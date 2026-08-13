const Firebird = require('node-firebird');
const path = require('path');
const fs = require('fs');
const { exec } = require('child_process');
const dbOptions = require('./dbConfig');
const inicializarBanco = require('./init_db');

const TEST_URL = 'https://www.youtube.com/watch?v=jNQXAC9IVRw';
const TEST_TITLE = 'Me at the zoo - Teste MP3 Automated';

async function runTest() {
    console.log("🚀 ============================================");
    console.log("   INICIANDO SUÍTE DE TESTES: DOWNLOAD MP3");
    console.log("============================================\n");

    // Step 1: Inicializar banco de dados se necessário
    console.log("📋 [Passo 1/6] Verificando e inicializando banco de dados Firebird...");
    await inicializarBanco();
    console.log("✅ Banco de dados Firebird pronto.\n");

    // Step 2: Iniciar Servidor Express temporariamente
    console.log("🌐 [Passo 2/6] Subindo servidor HTTP temporário...");
    const Server = require('./Server.js'); // Server abre a porta 3000 por padrão
    await new Promise(r => setTimeout(r, 1500)); // Aguarda bind do servidor

    // Step 3: Inserir vídeo de teste na tabela TB_VIDEOS_BIBLIOTECA
    console.log("➕ [Passo 3/6] Inserindo vídeo de teste na base de dados...");
    let idVideoTeste = null;
    await new Promise((resolve, reject) => {
        Firebird.attach(dbOptions, (err, db) => {
            if (err) return reject(err);
            
            // Garantir que existe canal ID 1 para a FK
            db.query("SELECT FIRST 1 ID_CANAL FROM TB_CANAIS", (err, resultCanal) => {
                let idCanal = 1;
                if (!err && resultCanal && resultCanal.length > 0) {
                    idCanal = resultCanal[0].ID_CANAL;
                }

                // Remove se já existir um teste antigo com essa URL
                db.query("DELETE FROM TB_VIDEOS_BIBLIOTECA WHERE URL_VIDEO = ?", [TEST_URL], () => {
                    const insertQuery = `
                        INSERT INTO TB_VIDEOS_BIBLIOTECA (ID_CANAL, TITULO_VIDEO, URL_VIDEO, STATUS_DOWNLOAD)
                        VALUES (?, ?, ?, 'PENDENTE')
                    `;
                    db.query(insertQuery, [idCanal, TEST_TITLE, TEST_URL], (err) => {
                        if (err) {
                            db.detach();
                            return reject(err);
                        }
                        
                        db.query("SELECT ID_VIDEO FROM TB_VIDEOS_BIBLIOTECA WHERE URL_VIDEO = ?", [TEST_URL], (err, res) => {
                            db.detach();
                            if (err || !res || res.length === 0) return reject(err || new Error("ID não retornado"));
                            idVideoTeste = res[0].ID_VIDEO;
                            console.log(`✅ Vídeo de teste inserido com Sucesso! ID: ${idVideoTeste}`);
                            resolve();
                        });
                    });
                });
            });
        });
    });

    // Step 4: Testar Endpoint da API REST para agendamento de download em MP3
    console.log("\n📡 [Passo 4/6] Agendando download via API REST (POST /api/videos/agendar - formato: MP3)...");
    const response = await fetch('http://localhost:3000/api/videos/agendar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ idVideo: idVideoTeste, formato: 'MP3' })
    });
    const apiResult = await response.json();
    console.log("  ↳ Resposta da API:", apiResult);

    // Verificar no banco se o FORMATO_DOWNLOAD é 'MP3' e STATUS_DOWNLOAD é 'DOWNLOAD_AGENDADO'
    await new Promise((resolve, reject) => {
        Firebird.attach(dbOptions, (err, db) => {
            if (err) return reject(err);
            db.query("SELECT STATUS_DOWNLOAD, FORMATO_DOWNLOAD FROM TB_VIDEOS_BIBLIOTECA WHERE ID_VIDEO = ?", [idVideoTeste], (err, res) => {
                db.detach();
                if (err || !res || res.length === 0) return reject(err || new Error("Falha ao buscar vídeo no DB"));
                console.log(`  ↳ Estado no DB: STATUS=${res[0].STATUS_DOWNLOAD}, FORMATO=${res[0].FORMATO_DOWNLOAD}`);
                if (res[0].STATUS_DOWNLOAD === 'DOWNLOAD_AGENDADO' && res[0].FORMATO_DOWNLOAD === 'MP3') {
                    console.log("✅ API REST registrou o agendamento em MP3 corretamente!");
                    resolve();
                } else {
                    reject(new Error(`Formato ou status incorreto no DB: status=${res[0].STATUS_DOWNLOAD}, formato=${res[0].FORMATO_DOWNLOAD}`));
                }
            });
        });
    });

    // Step 5: Executar o Worker de Download para processar o download em MP3
    console.log("\n⚙️ [Passo 5/6] Disparando Worker de Download para converter e salvar em MP3...");
    const workerProcess = exec('node worker_download.js');

    let downloadSucesso = false;
    let stdoutLog = '';
    let stderrLog = '';

    workerProcess.stdout.on('data', (data) => {
        const text = data.toString();
        stdoutLog += text;
        console.log(`  [Worker Log] ${text.trim()}`);
    });

    workerProcess.stderr.on('data', (data) => {
        stderrLog += data.toString();
    });

    // Aguardar conclusão no banco de dados (timeout de 60s)
    const startTime = Date.now();
    while (Date.now() - startTime < 60000) {
        await new Promise(r => setTimeout(r, 2000));
        
        const videoStatus = await new Promise((resolve) => {
            Firebird.attach(dbOptions, (err, db) => {
                if (err) return resolve(null);
                db.query("SELECT STATUS_DOWNLOAD, PROGRESSO FROM TB_VIDEOS_BIBLIOTECA WHERE ID_VIDEO = ?", [idVideoTeste], (err, res) => {
                    db.detach();
                    if (!err && res && res.length > 0) {
                        resolve(res[0]);
                    } else {
                        resolve(null);
                    }
                });
            });
        });

        if (videoStatus) {
            console.log(`  ⏳ Progresso atual: STATUS=${videoStatus.STATUS_DOWNLOAD}, PROGRESSO=${videoStatus.PROGRESSO}%`);
            if (videoStatus.STATUS_DOWNLOAD === 'DOWNLOAD_CONCLUIDO' && videoStatus.PROGRESSO === 100) {
                downloadSucesso = true;
                break;
            }
        }
    }

    workerProcess.kill();

    if (!downloadSucesso) {
        console.error("\n❌ ERRO: O download não concluiu em tempo hábil.");
        console.error("Stderr do worker:", stderrLog);
        process.exit(1);
    }
    console.log("✅ Worker concluiu o download com sucesso no banco de dados!");

    // Step 6: Verificação final do arquivo físico gerado (.mp3)
    console.log("\n📁 [Passo 6/6] Verificando existência do arquivo MP3 baixado no disco...");
    const downloadsDir = path.join(__dirname, 'downloads');
    const files = fs.readdirSync(downloadsDir);
    const mp3Files = files.filter(f => f.endsWith('.mp3'));
    
    console.log("  ↳ Arquivos MP3 encontrados no diretório de downloads:", mp3Files);
    
    let arquivoValido = false;
    for (const f of mp3Files) {
        const fullPath = path.join(downloadsDir, f);
        const stats = fs.statSync(fullPath);
        console.log(`  ↳ Arquivo '${f}': tamanho = ${stats.size} bytes (${(stats.size / 1024).toFixed(2)} KB)`);
        if (stats.size > 0) {
            arquivoValido = true;
        }
    }

    if (arquivoValido) {
        console.log("\n🎉 ============================================");
        console.log("   TODOS OS TESTES PASSARAM COM SUCESSO! 🎵");
        console.log("   A conversão e download para MP3 está 100% funcional!");
        console.log("============================================\n");
    } else {
        console.error("\n❌ ERRO: Nenhum arquivo MP3 válido (>0 bytes) foi gerado.");
        process.exit(1);
    }

    // Limpeza final do registro de teste no banco
    await new Promise((resolve) => {
        Firebird.attach(dbOptions, (err, db) => {
            if (err) return resolve();
            db.query("DELETE FROM TB_VIDEOS_BIBLIOTECA WHERE ID_VIDEO = ?", [idVideoTeste], () => {
                db.detach();
                resolve();
            });
        });
    });

    process.exit(0);
}

runTest().catch((err) => {
    console.error("❌ ERRO FATAL DURANTE OS TESTES:", err);
    process.exit(1);
});
