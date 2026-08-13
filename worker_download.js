const Firebird = require('node-firebird');
const { exec } = require('child_process');
const path = require('path');
const fs = require('fs');

const dbOptions = require('./dbConfig');

let isWorking = false;

function verificarDownloads() {
    if (isWorking) {
        return;
    }
    isWorking = true;

    console.log("🔍 [Worker] Verificando novos pedidos de download...");
    
    Firebird.attach(dbOptions, (err, db) => {
        if (err) {
            console.error("❌ Erro de conexão:", err);
            isWorking = false;
            return;
        }

        db.query("SELECT CAMINHO_DOWNLOADS FROM TB_CONFIGURACOES WHERE ID_CONFIG = 1", (err, configRes) => {
            let pastaDownloads = path.join(__dirname, 'downloads');
            if (!err && configRes && configRes.length > 0 && configRes[0].CAMINHO_DOWNLOADS) {
                pastaDownloads = configRes[0].CAMINHO_DOWNLOADS.trim();
            }

            if (!fs.existsSync(pastaDownloads)) {
                fs.mkdirSync(pastaDownloads, { recursive: true });
            }

            db.query("SELECT ID_VIDEO, TITULO_VIDEO, URL_VIDEO, FORMATO_DOWNLOAD FROM TB_VIDEOS_BIBLIOTECA WHERE STATUS_DOWNLOAD = 'DOWNLOAD_AGENDADO'", (err, videos) => {
                db.detach(); 

                if (err || !videos || videos.length === 0) {
                    isWorking = false;
                    return;
                }

                console.log(`📥 [Worker] Encontrados ${videos.length} vídeos para baixar na pasta: ${pastaDownloads}`);
                
                let index = 0;
                function processarProximo() {
                    if (index >= videos.length) {
                        isWorking = false;
                        return;
                    }

                    const video = videos[index];
                    index++;

                    const formato = (video.FORMATO_DOWNLOAD === 'MP3' ? 'MP3' : 'MP4');
                    console.log(`🎬 Baixando como ${formato}: ${video.TITULO_VIDEO}`);

                    Firebird.attach(dbOptions, (err, dbVideo) => {
                        if (err) {
                            processarProximo();
                            return;
                        }

                        dbVideo.query("UPDATE TB_VIDEOS_BIBLIOTECA SET STATUS_DOWNLOAD = 'BAIXANDO', PROGRESSO = 0 WHERE ID_VIDEO = ?", [video.ID_VIDEO], () => {
                            const ytDlpPath = path.join(__dirname, 'yt-dlp.exe');
                            const pastaFinal = pastaDownloads.endsWith('\\') ? pastaDownloads : pastaDownloads + '\\';
                            const outputFile = pastaFinal + '%(title)s.%(ext)s';
                            
                            let cmd;
                            if (formato === 'MP3') {
                                // Extrai áudio em MP3 com qualidade máxima
                                cmd = `chcp 65001 >nul && "${ytDlpPath}" --newline -x --audio-format mp3 --audio-quality 0 -o "${outputFile}" "${video.URL_VIDEO}"`;
                            } else {
                                // Download de vídeo em MP4 (padrão)
                                cmd = `chcp 65001 >nul && "${ytDlpPath}" --newline -f "best[ext=mp4]/best" -o "${outputFile}" "${video.URL_VIDEO}"`;
                            }

                            // maxBuffer aumentado para downloads enormes não crasharem o Node
                            const processo = exec(cmd, { maxBuffer: 1024 * 1024 * 50 }); 
                            
                            let ultimoProgressoLido = -1;
                            let isUpdatingDB = false; // 👉 O NOSSO NOVO SEMÁFORO

                            processo.stdout.on('data', (data) => {
                                const linhas = data.toString().split('\n');
                                
                                for (let linha of linhas) {
                                    if (linha.includes('[download]') && linha.includes('%')) {
                                        const match = linha.match(/([0-9]+(?:\.[0-9]+)?)%/);
                                        
                                        if (match && match[1]) {
                                            const progressoInt = Math.floor(parseFloat(match[1]));
                                            
                                            if (progressoInt > ultimoProgressoLido) {
                                                ultimoProgressoLido = progressoInt;
                                                console.log(`📥 [${video.TITULO_VIDEO}] - ${progressoInt}%`);
                                                
                                                // Só manda para o Firebird se a conexão não estiver gravando algo agora
                                                if (!isUpdatingDB) {
                                                    isUpdatingDB = true;
                                                    dbVideo.query("UPDATE TB_VIDEOS_BIBLIOTECA SET PROGRESSO = ? WHERE ID_VIDEO = ?", [ultimoProgressoLido, video.ID_VIDEO], () => {
                                                        isUpdatingDB = false; // Libera o semáforo para a próxima atualização
                                                    });
                                                }
                                            }
                                        }
                                    }
                                }
                            });

                            processo.on('close', (code) => {
                                if (code === 0) {
                                    // Força o 100% no final garantindo que o vídeo conclua mesmo se o banco tiver pulado a atualização visual
                                    dbVideo.query("UPDATE TB_VIDEOS_BIBLIOTECA SET STATUS_DOWNLOAD = 'DOWNLOAD_CONCLUIDO', PROGRESSO = 100 WHERE ID_VIDEO = ?", [video.ID_VIDEO], () => {
                                        console.log(`✅ Download concluído: ${video.TITULO_VIDEO}`);
                                        dbVideo.detach();
                                        processarProximo();
                                    });
                                } else {
                                    console.log(`❌ Erro no download de ${video.TITULO_VIDEO}`);
                                    dbVideo.detach();
                                    processarProximo();
                                }
                            });
                        });
                    });
                }

                processarProximo();
            });
        });
    });
}

setInterval(verificarDownloads, 30000);
verificarDownloads();