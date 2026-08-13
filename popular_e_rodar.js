const Firebird = require('node-firebird');
const { exec } = require('child_process');
const path = require('path');
const fs = require('fs');

const dbOptions = require('./dbConfig');

const runOnce = process.argv.includes('--once');
const monitorLockPath = path.join(__dirname, 'Database', '.monitor.lock');

function acquireMonitorLock() {
    const pid = process.pid;
    try {
        if (fs.existsSync(monitorLockPath)) {
            const lockedPid = parseInt(fs.readFileSync(monitorLockPath, 'utf8'), 10);
            if (lockedPid && lockedPid !== pid) {
                try {
                    process.kill(lockedPid, 0);
                    return false; // Processo dono ainda está em execução
                } catch (_) {
                    // PID inativo — limpa o lock antigo
                    try { fs.unlinkSync(monitorLockPath); } catch (_) {}
                }
            }
        }
        fs.writeFileSync(monitorLockPath, String(pid));
        return true;
    } catch (_) {
        return false;
    }
}

function releaseMonitorLock() {
    try {
        if (fs.existsSync(monitorLockPath)) {
            const lockedPid = parseInt(fs.readFileSync(monitorLockPath, 'utf8'), 10);
            if (lockedPid === process.pid) {
                fs.unlinkSync(monitorLockPath);
            }
        }
    } catch (_) {}
}

process.on('exit', releaseMonitorLock);
process.on('SIGINT', () => { releaseMonitorLock(); process.exit(0); });
process.on('uncaughtException', (err) => { releaseMonitorLock(); console.error(err); process.exit(1); });

function monitorarCanais() {
    if (!acquireMonitorLock()) {
        console.log("ℹ️ [Monitor de Canais] Uma varredura já está em andamento. Execução duplicada ignorada.");
        if (runOnce) process.exit(0);
        return;
    }

    console.log("\n🔍 [Monitor de Canais] Iniciando ciclo de varredura...");

    Firebird.attach(dbOptions, (err, db) => {
        if (err) {
            console.error("❌ Erro de conexão com o Firebird:", err);
            releaseMonitorLock();
            if (runOnce) {
                process.exit(1);
            } else {
                setTimeout(monitorarCanais, 60000); 
            }
            return;
        }

        const queryConfig = `
            SELECT COALESCE(QTD_VIDEOS_BUSCA, 5) AS QTD_VIDEOS, DATA_INICIAL, DATA_FINAL, 
                   COALESCE(INTERVALO_MINUTOS, 60) AS INTERVALO_MINUTOS,
                   COALESCE(BUSCAR_VIDEOS, 1) AS BUSCAR_VIDEOS, 
                   COALESCE(BUSCAR_SHORTS, 1) AS BUSCAR_SHORTS, 
                   COALESCE(BUSCAR_LIVES, 1) AS BUSCAR_LIVES 
            FROM TB_CONFIGURACOES WHERE ID_CONFIG = 1
        `;

        db.query(queryConfig, (err, config) => {
            let limitVideos = 5;
            let dataInicial = null, dataFinal = null;
            let buscarVideos = 1, buscarShorts = 1, buscarLives = 1;
            let intervaloMinutos = 60; // Padrão 1 hora

            if (!err && config && config.length > 0) {
                limitVideos = config[0].QTD_VIDEOS;
                dataInicial = config[0].DATA_INICIAL;
                dataFinal = config[0].DATA_FINAL;
                buscarVideos = config[0].BUSCAR_VIDEOS;
                buscarShorts = config[0].BUSCAR_SHORTS;
                buscarLives = config[0].BUSCAR_LIVES;
                intervaloMinutos = config[0].INTERVALO_MINUTOS;
            }
            
            console.log(`⚙️  Limite configurado: Buscando até os ${limitVideos} conteúdos mais recentes.`);

            const formataDataYtDlp = (d) => {
                if (!d) return '';
                const data = new Date(d);
                return `${data.getFullYear()}${String(data.getMonth() + 1).padStart(2, '0')}${String(data.getDate()).padStart(2, '0')}`;
            };

            let filtroDataCmd = '';
            if (dataInicial) filtroDataCmd += `--dateafter ${formataDataYtDlp(dataInicial)} `;
            if (dataFinal) filtroDataCmd += `--datebefore ${formataDataYtDlp(dataFinal)} `;

            if (filtroDataCmd.trim() !== '') {
                console.log(`📅 Filtro de data ativado: ${filtroDataCmd}`);
            }

            db.query("SELECT ID_CANAL, NOME_CANAL, URL_YOUTUBE FROM TB_CANAIS WHERE ATIVO = 1", (err, canais) => {
                if (err || !canais || canais.length === 0) {
                    console.log("⚠️ Nenhum canal ativo encontrado.");
                    db.detach();
                    releaseMonitorLock();
                    
                    if (runOnce) {
                        process.exit(0);
                    } else {
                        console.log(`⏳ Aguardando ${intervaloMinutos} minutos para verificar novamente...`);
                        setTimeout(monitorarCanais, intervaloMinutos * 60000);
                    }
                    return;
                }

                let canalIndex = 0;

                function processarProximoCanal() {
                    if (canalIndex >= canais.length) {
                        db.detach();
                        releaseMonitorLock();
                        console.log(`\n✨ Ciclo de monitoramento concluído!`);
                        
                        if (runOnce) {
                            process.exit(0);
                        } else {
                            console.log(`⏳ Próximo ciclo agendado para daqui a ${intervaloMinutos} minutos...`);
                            setTimeout(monitorarCanais, intervaloMinutos * 60000);
                        }
                        return;
                    }

                    const canal = canais[canalIndex];
                    canalIndex++;

                    console.log(`\n📡 Verificando canal: ${canal.NOME_CANAL}`);

                    const ytDlpPath = path.join(__dirname, 'yt-dlp.exe');
                    const cookiesPath = path.join(__dirname, 'cookies.txt');
                    const cookiesCmd = fs.existsSync(cookiesPath) ? `--cookies "${cookiesPath}" ` : '';
                    
                    let baseUrl = canal.URL_YOUTUBE.trim();
                    baseUrl = baseUrl.replace(/\/(videos|shorts|streams)\/?$/, '').replace(/\/$/, '');

                    let abasParaBuscar = [];
                    if (buscarVideos === 1) abasParaBuscar.push(`"${baseUrl}/videos"`);
                    if (buscarShorts === 1) abasParaBuscar.push(`"${baseUrl}/shorts"`);
                    if (buscarLives === 1) abasParaBuscar.push(`"${baseUrl}/streams"`);

                    if (abasParaBuscar.length === 0) {
                        console.log(`   ⚠️ Nenhum tipo de conteúdo selecionado nas configurações. Pulando canal...`);
                        processarProximoCanal();
                        return;
                    }

                    const abasStr = abasParaBuscar.join(' ');
                    const cmd = `chcp 65001 >nul && "${ytDlpPath}" --ignore-errors --flat-playlist ${cookiesCmd}${filtroDataCmd}--dump-json --playlist-items 1-${limitVideos} ${abasStr}`;

                    exec(cmd, { maxBuffer: 1024 * 1024 * 10 }, (error, stdout, stderr) => {
                        const linhas = (stdout || '').split('\n').filter(l => l.trim().startsWith('{'));
                        
                        if (linhas.length === 0) {
                            console.log(`   ℹ️ Nenhum vídeo retornado para este canal.`);
                            processarProximoCanal();
                            return;
                        }

                        let videoIndex = 0;
                        function processarProximoVideo() {
                            if (videoIndex >= linhas.length) {
                                processarProximoCanal();
                                return;
                            }

                            const linhaJson = linhas[videoIndex];
                            videoIndex++;

                            let infoVideo;
                            try {
                                infoVideo = JSON.parse(linhaJson);
                            } catch (e) {
                                processarProximoVideo();
                                return;
                            }

                            const titulo = infoVideo.title ? infoVideo.title.trim() : 'Vídeo sem título';
                            const idVideoYT = infoVideo.id ? infoVideo.id.trim() : '';
                            const urlVideo = infoVideo.url || infoVideo.webpage_url || `https://www.youtube.com/watch?v=${idVideoYT}`;

                            if (!idVideoYT) {
                                processarProximoVideo();
                                return;
                            }

                            const thumbnail = `https://img.youtube.com/vi/${idVideoYT}/mqdefault.jpg`;

                            db.query("SELECT ID_VIDEO FROM TB_VIDEOS_BIBLIOTECA WHERE URL_VIDEO = ?", [urlVideo], (err, resExistente) => {
                                if (!err && resExistente && resExistente.length === 0) {
                                    const insertQuery = `
                                        INSERT INTO TB_VIDEOS_BIBLIOTECA 
                                        (ID_CANAL, TITULO_VIDEO, URL_VIDEO, THUMBNAIL_URL, STATUS_DOWNLOAD, PROGRESSO) 
                                        VALUES (?, ?, ?, ?, 'PENDENTE', 0)
                                    `;
                                    const queryFn = (db.querySilent || db.query).bind(db);
                                    queryFn(insertQuery, [canal.ID_CANAL, titulo, urlVideo, thumbnail], (err) => {
                                        if (!err) console.log(`   📺 Novo conteúdo salvo: ${titulo}`);
                                        processarProximoVideo();
                                    });
                                } else {
                                    processarProximoVideo();
                                }
                            });
                        }
                        processarProximoVideo(); 
                    });
                }
                processarProximoCanal(); 
            });
        });
    });
}

// Inicia o primeiro ciclo imediatamente ao rodar o script
monitorarCanais();