const Firebird = require('node-firebird');
const { exec } = require('child_process');
const path = require('path');
const fs = require('fs');

const dbOptions = require('./dbConfig');

let isWorking = false;

function registrarLog(nivel, mensagem) {
    const fonte = 'WORKER_DOWNLOAD';
    const icone = nivel === 'SUCCESS' ? '✅' : nivel === 'ERROR' ? '❌' : nivel === 'WARN' ? '⚠️' : 'ℹ️';
    console.log(`[${new Date().toLocaleTimeString('pt-BR')}] [${fonte}] ${icone} ${mensagem}`);
    
    fetch('http://localhost:3000/api/logs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fonte, nivel, mensagem })
    }).catch(() => {});
}

function verificarDownloads() {
    if (isWorking) {
        return;
    }
    isWorking = true;
    
    Firebird.attach(dbOptions, (err, db) => {
        if (err) {
            registrarLog('ERROR', `Erro de conexão com banco de dados: ${err.message || err}`);
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

                registrarLog('INFO', `Encontrados ${videos.length} vídeo(s) na fila de download.`);
                
                let index = 0;
                function processarProximo() {
                    if (index >= videos.length) {
                        isWorking = false;
                        return;
                    }

                    const video = videos[index];
                    index++;

                    const formato = (video.FORMATO_DOWNLOAD === 'MP3' ? 'MP3' : 'MP4');
                    registrarLog('INFO', `Iniciando download [${formato}]: "${video.TITULO_VIDEO}"`);

                    Firebird.attach(dbOptions, (err, dbVideo) => {
                        if (err) {
                            registrarLog('ERROR', `Erro ao abrir banco para atualizar ${video.TITULO_VIDEO}`);
                            processarProximo();
                            return;
                        }

                        dbVideo.query("UPDATE TB_VIDEOS_BIBLIOTECA SET STATUS_DOWNLOAD = 'BAIXANDO', PROGRESSO = 0 WHERE ID_VIDEO = ?", [video.ID_VIDEO], () => {
                            const ytDlpPath = path.join(__dirname, 'yt-dlp.exe');
                            const pastaFinal = pastaDownloads.endsWith('\\') ? pastaDownloads : pastaDownloads + '\\';
                            const outputFile = pastaFinal + '%(title)s.%(ext)s';
                            
                            let cmd;
                            if (formato === 'MP3') {
                                cmd = `chcp 65001 >nul && "${ytDlpPath}" --newline -x --audio-format mp3 --audio-quality 0 -o "${outputFile}" "${video.URL_VIDEO}"`;
                            } else {
                                cmd = `chcp 65001 >nul && "${ytDlpPath}" --newline -f "best[ext=mp4]/best" -o "${outputFile}" "${video.URL_VIDEO}"`;
                            }

                            const processo = exec(cmd, { maxBuffer: 1024 * 1024 * 50 }); 
                            
                            let ultimoProgressoLido = -1;
                            let isUpdatingDB = false;

                            processo.stdout.on('data', (data) => {
                                const linhas = data.toString().split('\n');
                                
                                for (let linha of linhas) {
                                    if (linha.includes('[download]') && linha.includes('%')) {
                                        const match = linha.match(/([0-9]+(?:\.[0-9]+)?)%/);
                                        
                                        if (match && match[1]) {
                                            const progressoInt = Math.floor(parseFloat(match[1]));
                                            
                                            if (progressoInt > ultimoProgressoLido && progressoInt % 10 === 0) {
                                                ultimoProgressoLido = progressoInt;
                                                registrarLog('INFO', `📥 Download "${video.TITULO_VIDEO}": ${progressoInt}%`);
                                                
                                                if (!isUpdatingDB) {
                                                    isUpdatingDB = true;
                                                    dbVideo.query("UPDATE TB_VIDEOS_BIBLIOTECA SET PROGRESSO = ? WHERE ID_VIDEO = ?", [ultimoProgressoLido, video.ID_VIDEO], () => {
                                                        isUpdatingDB = false;
                                                    });
                                                }
                                            }
                                        }
                                    }
                                }
                            });

                            processo.on('close', (code) => {
                                if (code === 0) {
                                    dbVideo.query("UPDATE TB_VIDEOS_BIBLIOTECA SET STATUS_DOWNLOAD = 'DOWNLOAD_CONCLUIDO', PROGRESSO = 100 WHERE ID_VIDEO = ?", [video.ID_VIDEO], () => {
                                        registrarLog('SUCCESS', `Download concluído com sucesso: "${video.TITULO_VIDEO}" (${formato})`);
                                        dbVideo.detach();
                                        processarProximo();
                                    });
                                } else {
                                    registrarLog('ERROR', `Erro ou cancelamento no download de "${video.TITULO_VIDEO}"`);
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