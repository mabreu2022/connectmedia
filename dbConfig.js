const Firebird = require('node-firebird');
const { execSync, spawnSync } = require('child_process');
const path = require('path');
const fs = require('fs');
const os = require('os');

const dbPath = process.env.DB_PATH || path.join(__dirname, 'Database', 'BIBLIOTECA_YT.FDB');
const isqlPath = process.env.ISQL_PATH || 'C:\\Program Files (x86)\\Firebird\\Firebird_5_0\\isql.exe';

// Arquivo de lock compartilhado entre todos os processos que acessam o FDB
const lockPath = path.join(__dirname, 'Database', '.fdb.lock');

const dbOptions = {
    host: process.env.DB_HOST || '127.0.0.1',
    port: parseInt(process.env.DB_PORT, 10) || 3050,
    database: dbPath,
    user: process.env.DB_USER || 'SYSDBA',
    password: process.env.DB_PASSWORD || 'masterkey',
    lowercase_keys: false,
    role: null,
    pageSize: 4096,
    pluginName: 'Srp256'
};

/**
 * Sleep síncrono real usando Atomics (não bloqueia o event loop, mas é chamado via execSync).
 */
function sleepSync(ms) {
    const buf = new SharedArrayBuffer(4);
    const arr = new Int32Array(buf);
    Atomics.wait(arr, 0, 0, ms);
}

/**
 * Tenta adquirir o lock de arquivo. Aguarda de forma síncrona com backoff exponencial.
 * Retorna true se conseguiu, false se deu timeout.
 */
function acquireLock(timeoutMs = 15000) {
    const pid = process.pid;
    const startTime = Date.now();
    let delay = 50;

    while (Date.now() - startTime < timeoutMs) {
        try {
            // Tenta criar o arquivo de lock em modo exclusivo
            const fd = fs.openSync(lockPath, 'wx');
            fs.writeSync(fd, String(pid));
            fs.closeSync(fd);
            return true;
        } catch (e) {
            // Arquivo já existe — verifica se o PID dono ainda está vivo
            try {
                const lockedPid = parseInt(fs.readFileSync(lockPath, 'utf8'), 10);
                if (lockedPid && lockedPid !== pid) {
                    // Verifica se o processo ainda existe
                    try {
                        process.kill(lockedPid, 0);
                    } catch (killErr) {
                        // PID morto — remove o lock órfão
                        try { fs.unlinkSync(lockPath); } catch (_) {}
                        continue;
                    }
                }
            } catch (_) {
                // Arquivo de lock corrompido ou não legível — remove e tenta novamente
                try { fs.unlinkSync(lockPath); } catch (_) {}
                continue;
            }
            // Aguarda com backoff exponencial (máx 500ms)
            sleepSync(delay);
            delay = Math.min(delay * 1.5, 500);
        }
    }
    return false;
}

function releaseLock() {
    try {
        fs.unlinkSync(lockPath);
    } catch (_) {}
}

/**
 * Interpola parâmetros SQL de forma segura, sem double-replace em valores com '?'
 */
function buildSql(sql, params = []) {
    if (!params || !Array.isArray(params) || params.length === 0) return sql;

    const parts = sql.split('?');
    let result = parts[0];
    for (let i = 0; i < params.length; i++) {
        const p = params[i];
        let val;
        if (p === null || p === undefined) {
            val = 'NULL';
        } else if (typeof p === 'number') {
            val = String(p);
        } else if (typeof p === 'boolean') {
            val = p ? '1' : '0';
        } else if (p instanceof Date) {
            val = `'${p.toISOString().slice(0, 19).replace('T', ' ')}'`;
        } else {
            // Escapa aspas simples e remove quebras de linha
            const cleanStr = String(p).replace(/'/g, "''").replace(/\r/g, '').replace(/\n/g, ' ');
            val = `'${cleanStr}'`;
        }
        result += val + (parts[i + 1] !== undefined ? parts[i + 1] : '');
    }
    return result;
}

/**
 * Executa uma query via ISQL, usando lock de arquivo para evitar concorrência entre processos.
 */
function executeISQLInternal(sql, params = []) {
    const formattedSql = buildSql(sql, params).trim();
    const isSelect = formattedSql.toUpperCase().startsWith('SELECT');

    let script = `CONNECT '${dbOptions.database}' USER '${dbOptions.user}' PASSWORD '${dbOptions.password}';\n`;
    if (isSelect) {
        script += `SET HEADING ON;\n${formattedSql};\n`;
    } else {
        script += `${formattedSql};\nCOMMIT;\n`;
    }

    // Escreve o script em arquivo temporário (evita problemas de BOM/encoding no stdin do Windows)
    const tmpFile = path.join(os.tmpdir(), `isql_${process.pid}_${Date.now()}.sql`);
    fs.writeFileSync(tmpFile, script, { encoding: 'utf8' });

    const acquired = acquireLock(15000);
    if (!acquired) {
        fs.unlinkSync(tmpFile);
        throw new Error('[ISQL Bridge] Timeout ao aguardar lock do banco de dados.');
    }

    let stdout = '';
    let stderr = '';
    try {
        const result = spawnSync(`"${isqlPath}" -i "${tmpFile}"`, [], {
            shell: true,
            encoding: 'utf8',
            maxBuffer: 50 * 1024 * 1024,
            timeout: 30000
        });
        stdout = result.stdout || '';
        stderr = result.stderr || '';

        if (result.error) throw result.error;
        if (result.status !== 0 && stderr.includes('Statement failed')) {
            throw new Error(stderr);
        }
    } finally {
        releaseLock();
        try { fs.unlinkSync(tmpFile); } catch (_) {}
    }

    if (!isSelect) return [];

    const lines = stdout.split('\n');
    let headerLine = null;
    let dividerLine = null;
    let dividerIdx = -1;

    for (let i = 0; i < lines.length; i++) {
        if (lines[i].includes('====')) {
            dividerLine = lines[i];
            headerLine = lines[i - 1];
            dividerIdx = i;
            break;
        }
    }

    if (!dividerLine || !headerLine) return [];

    const cols = [];
    let regex = /=+/g;
    let m;
    while ((m = regex.exec(dividerLine)) !== null) {
        const start = m.index;
        const length = m[0].length;
        const name = headerLine.substring(start, start + length).trim();
        cols.push({ name, start, length });
    }

    const results = [];
    for (let i = dividerIdx + 1; i < lines.length; i++) {
        const line = lines[i];
        if (line.trim().startsWith('SQL>') || line.trim() === '') continue;

        const row = {};
        let hasValue = false;
        cols.forEach(col => {
            const rawVal = line.substring(col.start, col.start + col.length).trim();
            if (rawVal) hasValue = true;
            let parsedVal = rawVal;
            if (/^-?\d+$/.test(rawVal)) parsedVal = parseInt(rawVal, 10);
            else if (/^-?\d+\.\d+$/.test(rawVal)) parsedVal = parseFloat(rawVal, 10);
            else if (rawVal.toUpperCase() === '<NULL>' || rawVal === '') parsedVal = null;
            row[col.name] = parsedVal;
        });

        if (hasValue && Object.keys(row).length > 0) results.push(row);
    }

    return results;
}

function queryISQL(sql, params = [], silent = false) {
    return new Promise((resolve, reject) => {
        try {
            const result = executeISQLInternal(sql, params);
            resolve(result);
        } catch (err) {
            if (!silent) {
                console.error('⚠️ [ISQL Bridge] Erro na execução SQL:', err.message);
            }
            reject(err);
        }
    });
}

Firebird.attach = function (options, callback, silent = false) {
    const fakeDb = {
        query: function (sql, params, cb) {
            if (typeof params === 'function') {
                cb = params;
                params = [];
            }
            queryISQL(sql, params, silent)
                .then(result => { if (cb) cb(null, result); })
                .catch(err => { if (cb) cb(err); });
        },
        querySilent: function (sql, params, cb) {
            if (typeof params === 'function') {
                cb = params;
                params = [];
            }
            queryISQL(sql, params, true)
                .then(result => { if (cb) cb(null, result); })
                .catch(err => { if (cb) cb(err); });
        },
        detach: function () {
            // no-op
        }
    };

    process.nextTick(() => {
        callback(null, fakeDb);
    });
};

module.exports = dbOptions;
