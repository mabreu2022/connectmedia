const express = require('express');
const Firebird = require('node-firebird');
const path = require('path');
const cors = require('cors');
const { exec } = require('child_process');
const fs = require('fs');
const logger = require('./logger');

const app = express();
const PORT = 3000;

// Middlewares
app.use(cors());
app.use((req, res, next) => {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');
    next();
});
app.use(express.json({ limit: '200mb' }));
app.use(express.urlencoded({ limit: '200mb', extended: true }));
app.use(express.static(path.join(__dirname, 'public'), { etag: false, lastModified: false }));

// Configuração de Conexão com o Firebird 5.0
const dbOptions = require('./dbConfig');

// Rota 1: Buscar Canais Monitorados
app.get('/api/canais', (req, res) => {
    Firebird.attach(dbOptions, (err, db) => {
        if (err) {
            console.error('Erro ao conectar no banco:', err);
            return res.status(500).json({ error: 'Erro de conexão com o banco de dados.' });
        }

        db.query('SELECT ID_CANAL, NOME_CANAL, URL_YOUTUBE, ATIVO FROM TB_CANAIS', (err, result) => {
            db.detach();
            if (err) {
                console.error('Erro na query:', err);
                return res.status(500).json({ error: 'Erro ao buscar canais.' });
            }
            res.json(result);
        });
    });
});

// Rota 2: Cadastrar um novo Canal Monitorado (Com resposta imediata e varredura em background)
app.post('/api/canais', (req, res) => {
    let { nome, url, nomeCanal, urlYoutube } = req.body;
    nome = nome || nomeCanal;
    url = url || urlYoutube;

    if (!nome || !url) {
        return res.status(400).json({ error: 'Nome e URL do canal são obrigatórios.' });
    }

    // Limpa espaços e garante que a URL termine com /videos
    url = url.trim();
    if (!url.endsWith('/videos')) {
        if (url.endsWith('/')) url = url.slice(0, -1);
        url = url + '/videos';
    }

    Firebird.attach(dbOptions, (err, db) => {
        if (err) return res.status(500).json({ error: 'Erro de conexão com o banco.' });

        // 1. Verifica se já existe
        db.query('SELECT ID_CANAL FROM TB_CANAIS WHERE URL_YOUTUBE = ?', [url], (err, results) => {
            if (err) {
                db.detach();
                return res.status(500).json({ error: 'Erro ao verificar existência do canal.' });
            }

            if (results && results.length > 0) {
                db.detach();
                return res.status(400).json({ error: 'Este canal já está cadastrado no sistema!' });
            }

            // 2. Se não existe, insere no banco
            const query = 'INSERT INTO TB_CANAIS (NOME_CANAL, URL_YOUTUBE, ATIVO) VALUES (?, ?, 1)';
            db.query(query, [nome, url], (err, result) => {
                db.detach();
                if (err) {
                    console.error('Erro ao inserir canal:', err);
                    return res.status(500).json({ error: 'Erro ao salvar o canal no Firebird.' });
                }

                // 3. Responde IMEDIATAMENTE para a tela fechar o modal sem travar
                res.status(201).json({ message: 'Canal cadastrado com sucesso! A varredura inicial está rodando em segundo plano.' });

                // 4. Executa a varredura em background (assíncrona e pontual) sem prender a interface
                const scriptMonitor = path.join(__dirname, 'popular_e_rodar.js');
                exec(`node "${scriptMonitor}" --once`, (error, stdout, stderr) => {
                    if (error) {
                        console.error('Erro ao executar varredura inicial em background:', error);
                    } else {
                        console.log('✨ Varredura inicial do novo canal concluída em segundo plano!');
                    }
                });
            });
        });
    });
});

// Rota 2.1: Deletar um Canal Monitorado
app.delete('/api/canais/:id', (req, res) => {
    const idCanal = req.params.id;
    if (!idCanal) return res.status(400).json({ error: 'ID do canal é obrigatório.' });

    Firebird.attach(dbOptions, (err, db) => {
        if (err) return res.status(500).json({ error: 'Erro de conexão com o banco.' });

        db.query('DELETE FROM TB_CANAIS WHERE ID_CANAL = ?', [idCanal], (err, result) => {
            db.detach();
            if (err) {
                console.error('Erro ao deletar canal:', err);
                return res.status(500).json({ error: 'Erro ao deletar canal do banco de dados.' });
            }
            res.json({ message: 'Canal removido com sucesso!' });
        });
    });
});

// Rota 3: Buscar Vídeos Pendentes para a Descoberta (Com suporte a filtro por canal)
app.get('/api/videos', (req, res) => {
    const idCanal = req.query.canal;

    Firebird.attach(dbOptions, (err, db) => {
        if (err) {
            console.error('Erro ao conectar no banco para buscar vídeos:', err);
            return res.status(500).json({ error: 'Erro de conexão com o banco de dados.' });
        }

        let query = `
            SELECT V.ID_VIDEO, V.ID_CANAL, V.TITULO_VIDEO, V.URL_VIDEO, V.THUMBNAIL_URL, V.STATUS_DOWNLOAD, C.NOME_CANAL 
            FROM TB_VIDEOS_BIBLIOTECA V
            LEFT JOIN TB_CANAIS C ON V.ID_CANAL = C.ID_CANAL
            WHERE V.STATUS_DOWNLOAD = 'PENDENTE'
        `;

        const params = [];
        if (idCanal && idCanal !== 'todos') {
            query += ' AND V.ID_CANAL = ?';
            params.push(idCanal);
        }

        query += ' ORDER BY V.ID_VIDEO DESC';

        db.query(query, params, (err, result) => {
            db.detach();
            if (err) {
                console.error('Erro na query de vídeos:', err);
                return res.status(500).json({ error: 'Erro ao buscar vídeos.' });
            }
            if (Array.isArray(result)) {
                result.forEach(v => {
                    if (v.THUMBNAIL_URL) {
                        v.THUMBNAIL_URL = String(v.THUMBNAIL_URL).trim();
                        if (!v.THUMBNAIL_URL.startsWith('http')) {
                            v.THUMBNAIL_URL = 'https://img.youtube.com/vi/default/mqdefault.jpg';
                        }
                    }
                });
            }
            res.json(result);
        });
    });
});

// Rota 04: para alterar o status do vídeo e mandar para a Fila de Downloads
app.post('/api/videos/agendar', (req, res) => {
    const { idVideo, formato } = req.body;
    const formatoFinal = (formato === 'MP3' ? 'MP3' : 'MP4');

    if (!idVideo) {
        return res.status(400).json({ error: 'ID do vídeo é obrigatório.' });
    }

    Firebird.attach(dbOptions, (err, db) => {
        if (err) {
            return res.status(500).json({ error: 'Erro de conexão com o banco.' });
        }

        const query = "UPDATE TB_VIDEOS_BIBLIOTECA SET STATUS_DOWNLOAD = 'DOWNLOAD_AGENDADO', FORMATO_DOWNLOAD = ?, PROGRESSO = 0 WHERE ID_VIDEO = ?";
        
        db.query(query, [formatoFinal, idVideo], (err) => {
            db.detach();
            if (err) {
                console.error('Erro ao agendar download:', err);
                return res.status(500).json({ error: 'Erro ao atualizar status no banco.' });
            }
            res.json({ message: `Vídeo enviado para a Fila de Downloads como ${formatoFinal}!` });
        });
    });
});

// Rota 05: para buscar vídeos na fila de download (Atualizada para limpar concluídos)
app.get('/api/videos/fila', (req, res) => {
    Firebird.attach(dbOptions, (err, db) => {
        if (err) return res.status(500).json({ error: 'Erro de conexão com o banco.' });

        const query = `
            SELECT V.ID_VIDEO, V.TITULO_VIDEO, V.URL_VIDEO, V.STATUS_DOWNLOAD, 
                   COALESCE(V.PROGRESSO, 0) AS PROGRESSO, C.NOME_CANAL 
            FROM TB_VIDEOS_BIBLIOTECA V
            LEFT JOIN TB_CANAIS C ON V.ID_CANAL = C.ID_CANAL
            WHERE V.STATUS_DOWNLOAD IN ('DOWNLOAD_AGENDADO', 'BAIXANDO')
            ORDER BY V.ID_VIDEO DESC
        `;

        db.query(query, (err, result) => {
            db.detach();
            if (err) return res.status(500).json({ error: 'Erro ao buscar fila.' });
            res.json(result);
        });
    });
});

// Rota 06: para buscar vídeos concluídos classificados por assunto (Acervo Baixado)
app.get('/api/videos/baixados', (req, res) => {
    Firebird.attach(dbOptions, (err, db) => {
        if (err) return res.status(500).json({ error: 'Erro de conexão com o banco.' });

        const query = `
            SELECT V.ID_VIDEO, V.TITULO_VIDEO, V.URL_VIDEO, V.THUMBNAIL_URL, V.STATUS_DOWNLOAD, C.NOME_CANAL, A.NOME AS NOME_ASSUNTO 
            FROM TB_VIDEOS_BIBLIOTECA V
            LEFT JOIN TB_CANAIS C ON V.ID_CANAL = C.ID_CANAL
            LEFT JOIN TB_ASSUNTOS A ON V.ID_ASSUNTO = A.ID_ASSUNTO
            WHERE V.STATUS_DOWNLOAD = 'DOWNLOAD_CONCLUIDO'
            ORDER BY A.NOME, V.ID_VIDEO DESC
        `;

        db.query(query, (err, result) => {
            db.detach();
            if (err) return res.status(500).json({ error: 'Erro ao buscar vídeos baixados.' });
            res.json(result);
        });
    });
});

// Persistência de Configurações de IA em ai_config.json
const AI_CONFIG_FILE = path.join(__dirname, 'ai_config.json');

function carregarAiConfig() {
    try {
        if (fs.existsSync(AI_CONFIG_FILE)) {
            return JSON.parse(fs.readFileSync(AI_CONFIG_FILE, 'utf8'));
        }
    } catch(e) {}
    return { provedor: 'auto', geminiKey: '', ollamaUrl: 'http://127.0.0.1:11434' };
}

function salvarAiConfig(config) {
    try {
        if (config && typeof config === 'object') {
            fs.writeFileSync(AI_CONFIG_FILE, JSON.stringify(config, null, 2), 'utf8');
        }
        return true;
    } catch(e) {
        console.error('Erro ao salvar ai_config.json:', e);
        return false;
    }
}

// Rota 07: para buscar as configurações atuais
app.get('/api/configuracoes', (req, res) => {
    Firebird.attach(dbOptions, (err, db) => {
        if (err) return res.status(500).json({ error: 'Erro de conexão com o banco.' });

        const query = `
            SELECT CAMINHO_DOWNLOADS, COALESCE(QTD_VIDEOS_BUSCA, 5) AS QTD_VIDEOS_BUSCA, 
                   DATA_INICIAL, DATA_FINAL, COALESCE(INTERVALO_MINUTOS, 60) AS INTERVALO_MINUTOS,
                   COALESCE(BUSCAR_VIDEOS, 1) AS BUSCAR_VIDEOS, 
                   COALESCE(BUSCAR_SHORTS, 1) AS BUSCAR_SHORTS, 
                   COALESCE(BUSCAR_LIVES, 1) AS BUSCAR_LIVES 
            FROM TB_CONFIGURACOES WHERE ID_CONFIG = 1
        `;

        db.query(query, (err, result) => {
            db.detach();
            const ai = carregarAiConfig();
            if (err || !result || result.length === 0) {
                return res.json({ caminho: path.join(__dirname, 'downloads'), qtdVideos: 5, intervaloMinutos: 60, dataInicial: '', dataFinal: '', buscarVideos: 1, buscarShorts: 1, buscarLives: 1, aiConfig: ai });
            }
            
            const formataData = (d) => d ? d.toISOString().split('T')[0] : '';

            res.json({ 
                caminho: result[0].CAMINHO_DOWNLOADS, 
                qtdVideos: result[0].QTD_VIDEOS_BUSCA,
                intervaloMinutos: result[0].INTERVALO_MINUTOS,
                dataInicial: formataData(result[0].DATA_INICIAL),
                dataFinal: formataData(result[0].DATA_FINAL),
                buscarVideos: result[0].BUSCAR_VIDEOS,
                buscarShorts: result[0].BUSCAR_SHORTS,
                buscarLives: result[0].BUSCAR_LIVES,
                aiConfig: ai
            });
        });
    });
});

// Rota 08: para salvar configurações
app.post('/api/configuracoes', (req, res) => {
    const { caminho, qtdVideos, intervaloMinutos, dataInicial, dataFinal, buscarVideos, buscarShorts, buscarLives, aiConfig } = req.body;

    if (!caminho) return res.status(400).json({ error: 'O caminho é obrigatório.' });

    if (aiConfig) {
        salvarAiConfig(aiConfig);
    }

    Firebird.attach(dbOptions, (err, db) => {
        if (err) return res.status(500).json({ error: 'Erro de conexão com o banco.' });

        const query = `
            UPDATE TB_CONFIGURACOES 
            SET CAMINHO_DOWNLOADS = ?, QTD_VIDEOS_BUSCA = ?, INTERVALO_MINUTOS = ?, 
                DATA_INICIAL = ?, DATA_FINAL = ?, BUSCAR_VIDEOS = ?, BUSCAR_SHORTS = ?, BUSCAR_LIVES = ? 
            WHERE ID_CONFIG = 1
        `;
        
        const dInicial = dataInicial ? dataInicial : null;
        const dFinal = dataFinal ? dataFinal : null;

        db.query(query, [caminho, qtdVideos || 5, intervaloMinutos || 60, dInicial, dFinal, buscarVideos, buscarShorts, buscarLives], (err) => {
            db.detach();
            if (err) return res.status(500).json({ error: 'Erro ao salvar configuração.' });
            res.json({ message: 'Configuração salva com sucesso!' });
        });
    });
});

// Rota 09-a: limpa TODOS os vídeos com STATUS_DOWNLOAD = 'PENDENTE' (tela de Descoberta)
app.delete('/api/videos/limpar-descoberta', (req, res) => {
    Firebird.attach(dbOptions, (err, db) => {
        if (err) return res.status(500).json({ error: 'Erro de conexão com o banco.' });

        db.query("DELETE FROM TB_VIDEOS_BIBLIOTECA WHERE STATUS_DOWNLOAD = 'PENDENTE'", (err) => {
            db.detach();
            if (err) {
                console.error('Erro ao limpar descoberta:', err);
                return res.status(500).json({ error: 'Erro ao limpar a lista de descoberta.' });
            }
            res.json({ message: 'Lista de Descoberta limpa com sucesso!' });
        });
    });
});

// Rota 09-b: para deletar um vídeo da biblioteca / descoberta por ID
app.delete('/api/videos/:id', (req, res) => {
    const idVideo = parseInt(req.params.id, 10);

    if (isNaN(idVideo)) {
        return res.status(400).json({ error: `ID de vídeo inválido: "${req.params.id}"` });
    }

    Firebird.attach(dbOptions, (err, db) => {
        if (err) return res.status(500).json({ error: 'Erro de conexão com o banco.' });

        const query = "DELETE FROM TB_VIDEOS_BIBLIOTECA WHERE ID_VIDEO = ?";
        
        db.query(query, [idVideo], (err) => {
            db.detach();
            if (err) {
                console.error('Erro ao deletar vídeo:', err);
                return res.status(500).json({ error: 'Erro ao excluir o registro.' });
            }
            res.json({ message: 'Vídeo excluído com sucesso!' });
        });
    });
});

// Rota 10: para forçar varredura manual de todos os canais ativos
app.post('/api/canais/atualizar', (req, res) => {
    const scriptMonitor = path.join(__dirname, 'popular_e_rodar.js');
    exec(`node "${scriptMonitor}" --once`, (error, stdout, stderr) => {
        if (error) {
            console.error('Erro ao executar varredura manual:', error);
            return res.status(500).json({ error: 'Erro ao executar a varredura.' });
        }
        res.json({ message: 'Varredura de canais concluída com sucesso!' });
    });
});

// Rota 11: para alterar o status ATIVO/INATIVO do canal pelo checklist
app.post('/api/canais/:id/status', (req, res) => {
    const idCanal = req.params.id;
    const { ativo } = req.body; // Recebe 1 ou 0

    Firebird.attach(dbOptions, (err, db) => {
        if (err) return res.status(500).json({ error: 'Erro de conexão com o banco.' });

        const query = "UPDATE TB_CANAIS SET ATIVO = ? WHERE ID_CANAL = ?";
        db.query(query, [ativo ? 1 : 0, idCanal], (err) => {
            db.detach();
            if (err) {
                console.error('Erro ao atualizar status do canal:', err);
                return res.status(500).json({ error: 'Erro ao atualizar status no banco.' });
            }
            res.json({ message: 'Status do canal atualizado com sucesso!' });
        });
    });
});

// Rota 12:para baixar um vídeo único ou playlist avulsa sob demanda
app.post('/api/baixar-avulso', (req, res) => {
    const { url } = req.body;
    if (!url) return res.status(400).json({ error: 'A URL é obrigatória.' });

    const Firebird = require('node-firebird');
    const { exec } = require('child_process');
    const path = require('path');

    Firebird.attach(dbOptions, (err, db) => {
        if (err) return res.status(500).json({ error: 'Erro de conexão com o banco.' });

        // Função que processa os vídeos ancorando-os no ID do canal de Avulsos
        const processarVideos = (idCanalAvulso) => {
            const ytDlpPath = path.join(__dirname, 'yt-dlp.exe');
            
            const cmd = `chcp 65001 >nul && "${ytDlpPath}" --ignore-errors --flat-playlist --dump-json "${url}"`;

            exec(cmd, { maxBuffer: 1024 * 1024 * 10 }, (error, stdout, stderr) => {
                const linhas = (stdout || '').split('\n').filter(l => l.trim().startsWith('{'));
                
                if (linhas.length === 0) {
                    db.detach();
                    return res.status(400).json({ error: 'Nenhum vídeo encontrado nesta URL.' });
                }

                linhas.forEach(linha => {
                    try {
                        const info = JSON.parse(linha);
                        const idVideoYT = info.id || '';
                        const urlVideo = info.url || info.webpage_url || `https://www.youtube.com/watch?v=${idVideoYT}`;
                        
                        // 👉 NOVO: Puxa o nome real do canal direto do yt-dlp!
                        const autorReal = info.uploader || info.channel || 'Avulso';
                        
                        // 👉 NOVO: Coloca o nome do autor original no título para você não perder a referência
                        const tituloOriginal = info.title ? info.title.trim() : 'Vídeo Sem Título';
                        const tituloFormatado = `[${autorReal}] ${tituloOriginal}`;
                        
                        const thumbnail = idVideoYT ? `https://img.youtube.com/vi/${idVideoYT}/mqdefault.jpg` : 'https://img.youtube.com/vi/default/mqdefault.jpg';

                        if (idVideoYT) {
                            const insertQuery = `
                                INSERT INTO TB_VIDEOS_BIBLIOTECA 
                                (ID_CANAL, TITULO_VIDEO, URL_VIDEO, THUMBNAIL_URL, STATUS_DOWNLOAD, PROGRESSO) 
                                VALUES (?, ?, ?, ?, 'PENDENTE', 0)
                            `;
                            const queryFn = (db.querySilent || db.query).bind(db);
                            queryFn(insertQuery, [idCanalAvulso, tituloFormatado, urlVideo, thumbnail], () => {});
                        }
                    } catch (e) {
                        console.error("Erro ao ler JSON da URL avulsa:", e);
                    }
                });

                setTimeout(() => {
                    db.detach();
                    res.json({ message: `${linhas.length} vídeo(s) enviado(s) para a Descoberta!` });
                }, 1000);
            });
        };

        // Verifica se já existe o canal genérico para avulsos
        db.query("SELECT ID_CANAL FROM TB_CANAIS WHERE NOME_CANAL = '🔗 Downloads Avulsos'", (err, canais) => {
            if (canais && canais.length > 0) {
                // Se já existe, usa o ID dele
                processarVideos(canais[0].ID_CANAL);
            } else {
                // Se não existe, cria um canal invisível (ATIVO = 0) para organizar os vídeos
                db.query("INSERT INTO TB_CANAIS (NOME_CANAL, URL_YOUTUBE, ATIVO) VALUES ('🔗 Downloads Avulsos', 'avulso', 0)", (err) => {
                    db.query("SELECT ID_CANAL FROM TB_CANAIS WHERE NOME_CANAL = '🔗 Downloads Avulsos'", (err, novosCanais) => {
                        if (!err && novosCanais && novosCanais.length > 0) {
                            processarVideos(novosCanais[0].ID_CANAL);
                        } else {
                            db.detach();
                        }
                    });
                });
            }
        });
    });
});

// Rota 13: Streaming de vídeo local (O player estilo Netflix)
app.get('/api/stream/:id', (req, res) => {
    const idVideo = req.params.id;

    Firebird.attach(dbOptions, (err, db) => {
        if (err) return res.status(500).json({ error: 'Erro de conexão.' });

        const query = `
            SELECT V.TITULO_VIDEO, C.CAMINHO_DOWNLOADS 
            FROM TB_VIDEOS_BIBLIOTECA V 
            CROSS JOIN TB_CONFIGURACOES C 
            WHERE V.ID_VIDEO = ?
        `;

        db.query(query, [idVideo], (err, result) => {
            db.detach();
            if (err || !result || result.length === 0) {
                return res.status(404).send('Vídeo não encontrado no banco.');
            }

            const tituloDb = result[0].TITULO_VIDEO;
            let pasta = result[0].CAMINHO_DOWNLOADS;
            if (!pasta) return res.status(404).send('Pasta de downloads não configurada.');
            
            pasta = pasta.trim();

            fs.readdir(pasta, (err, files) => {
                if (err) return res.status(500).send('Erro ao acessar a pasta física.');

                // Função de varredura inteligente (o Windows e o yt-dlp mudam alguns caracteres no nome do arquivo físico)
                const limparNome = (str) => str.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-zA-Z0-9]/g, '').toLowerCase();
                const tituloLimpo = limparNome(tituloDb);

                // Procura na sua pasta um arquivo .mp4 que bata com a assinatura do vídeo
                let videoFile = files.find(f => {
                    if (!f.endsWith('.mp4') && !f.endsWith('.mkv') && !f.endsWith('.webm')) return false;
                    const nomeArquivoLimpo = limparNome(f);
                    return nomeArquivoLimpo.includes(tituloLimpo.substring(0, 15)) || tituloLimpo.includes(nomeArquivoLimpo.substring(0, 15));
                });

                if (!videoFile) {
                    return res.status(404).send('Arquivo físico não encontrado no HD.');
                }

                const videoPath = path.join(pasta, videoFile);
                const stat = fs.statSync(videoPath);
                const fileSize = stat.size;
                const range = req.headers.range;

                // Entrega o vídeo em partes (Chunks) para que a barra de avançar/voltar do player funcione!
                if (range) {
                    const parts = range.replace(/bytes=/, "").split("-");
                    const start = parseInt(parts[0], 10);
                    const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
                    const chunksize = (end - start) + 1;
                    const file = fs.createReadStream(videoPath, { start, end });
                    const head = {
                        'Content-Range': `bytes ${start}-${end}/${fileSize}`,
                        'Accept-Ranges': 'bytes',
                        'Content-Length': chunksize,
                        'Content-Type': 'video/mp4',
                    };
                    res.writeHead(206, head);
                    file.pipe(res);
                } else {
                    const head = {
                        'Content-Length': fileSize,
                        'Content-Type': 'video/mp4',
                    };
                    res.writeHead(200, head);
                    fs.createReadStream(videoPath).pipe(res);
                }
            });
        });
    });
});

// Rota 14: Limpar toda a lista de Descoberta (Vídeos Pendentes)
app.delete('/api/videos/limpar-descoberta', (req, res) => {
    Firebird.attach(dbOptions, (err, db) => {
        if (err) return res.status(500).json({ error: 'Erro de conexão com o banco.' });

        const query = "DELETE FROM TB_VIDEOS_BIBLIOTECA WHERE STATUS_DOWNLOAD = 'PENDENTE'";
        
        db.query(query, (err) => {
            db.detach();
            if (err) {
                console.error('Erro ao limpar descoberta:', err);
                return res.status(500).json({ error: 'Erro ao excluir os registros.' });
            }
            res.json({ message: 'Todos os vídeos pendentes foram removidos com sucesso!' });
        });
    });
});


// Rota: Gerador de Skills para Antigravity (Suporta URL única ou Lote)
app.post('/api/gerar-skill', (req, res) => {
    let { url, urls, titulo, idioma } = req.body;

    let listaUrls = [];
    if (Array.isArray(urls)) {
        listaUrls = urls.map(u => u.trim()).filter(u => u.startsWith('http'));
    } else if (typeof urls === 'string' && urls.trim()) {
        listaUrls = urls.split(/\r?\n|,/).map(u => u.trim()).filter(u => u.startsWith('http'));
    } else if (url && url.trim()) {
        listaUrls = [url.trim()];
    }

    if (listaUrls.length === 0) {
        return res.status(400).json({ sucesso: false, error: 'Forneça pelo menos uma URL de vídeo válida.' });
    }

    const scriptPath = path.join(__dirname, 'gerar_skill.js');
    let args = [...listaUrls];
    if (titulo && listaUrls.length === 1) { args.push('--titulo', titulo); }
    if (idioma) { args.push('--idioma', idioma); }

    const { execFile } = require('child_process');
    execFile(process.execPath, [scriptPath, ...args], {
        cwd: __dirname,
        timeout: 900000, // 15 minutos para lote
        maxBuffer: 1024 * 1024 * 50
    }, (err, stdout, stderr) => {
        const log = (stdout || '') + (stderr ? '\n' + stderr : '');

        if (err) {
            console.error('[Skill Batch] Erro:', err.message);
            return res.status(500).json({ sucesso: false, log, error: err.message });
        }

        const match = log.match(/Salvo em:\s*(.+\.md)/gi);
        const caminho = match ? match.join('\n') : 'Skills geradas em .agents/skills/';

        res.json({ sucesso: true, log, caminho, total: listaUrls.length });
    });
});

// Rota: Gerador de Skill a partir de arquivo PDF (Livros / Documentos Técnicos)
const pdfModule = require('pdf-parse');

async function extrairTextoPdf(pdfBuffer) {
    if (typeof pdfModule === 'function') {
        const data = await pdfModule(pdfBuffer);
        return { text: data.text || '', numpages: data.numpages || 0, info: data.info || {} };
    }
    const { PDFParse } = pdfModule;
    const parser = new PDFParse({ data: pdfBuffer });
    await parser.load();
    const result = await parser.getText();
    const info = await parser.getInfo().catch(() => ({}));
    return {
        text: result.text || '',
        numpages: result.total || (result.pages ? result.pages.length : 0),
        info: info ? (info.info || info) : {}
    };
}

app.post('/api/gerar-skill-pdf', async (req, res) => {
    try {
        let { pdfBase64, pdfPath, filename, titulo } = req.body;
        let pdfBuffer = null;

        if (pdfPath && fs.existsSync(pdfPath)) {
            pdfBuffer = fs.readFileSync(pdfPath);
            if (!filename) filename = path.basename(pdfPath);
        } else if (pdfBase64) {
            const base64Data = pdfBase64.replace(/^data:application\/pdf;base64,/, '');
            pdfBuffer = Buffer.from(base64Data, 'base64');
        }

        if (!pdfBuffer || pdfBuffer.length === 0) {
            return res.status(400).json({ sucesso: false, error: 'Forneça um arquivo PDF ou o caminho local de um PDF válido.' });
        }

        // Parse do PDF
        const pdfData = await extrairTextoPdf(pdfBuffer);

        const numPages = pdfData.numpages || 0;
        const metaTitle = (pdfData.info && pdfData.info.Title) ? String(pdfData.info.Title).trim() : '';
        const nomeDoc = filename || 'livro_pdf';
        
        let tituloSkill = titulo && titulo.trim() ? titulo.trim() : (metaTitle || nomeDoc.replace(/\.pdf$/i, '').replace(/[-_]/g, ' '));
        
        function slugify(str) {
            return str.toLowerCase()
                .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
                .replace(/[^a-z0-9\s-]/g, '')
                .trim()
                .replace(/\s+/g, '_')
                .substring(0, 60);
        }

        const slug = slugify(tituloSkill);
        const targetDir = path.join(__dirname, '.agents', 'skills', slug);
        if (!fs.existsSync(targetDir)) {
            fs.mkdirSync(targetDir, { recursive: true });
        }

        const targetFilePath = path.join(targetDir, 'SKILL.md');

        // 🧠 Estruturador de Conhecimento para Antigravity Skill
        function estruturarConhecimentoParaSkill(rawText, tituloDoc, nomeArquivo, totalPaginas) {
            let linhas = (rawText || '').split(/\r?\n/)
                .map(l => l.trim())
                .filter(l => {
                    if (!l) return false;
                    if (/^--\s*\d+\s*of\s*\d+\s*--$/i.test(l)) return false;
                    if (/^\d+\s*\/\s*\d+$/i.test(l)) return false;
                    if (/^página\s*\d+/i.test(l)) return false;
                    if (/^page\s*\d+/i.test(l)) return false;
                    if (/^\d+$/.test(l) && l.length < 4) return false;
                    return true;
                });

            const topicos = [];
            const diretrizes = [];
            const codigos = [];
            const parágrafos = [];
            let bloco = [];

            for (let i = 0; i < linhas.length; i++) {
                const l = linhas[i];

                const ehCapitulo = /^(cap[íi]tulo|chapter|padr[ãa]o|pattern|[0-9]+\.|\b[A-ZÁÉÍÓÚÀÃÕÇ\s]{4,50}\b)/.test(l) && l.length < 80;

                if (ehCapitulo) {
                    if (bloco.length > 0) { parágrafos.push(bloco.join(' ')); bloco = []; }
                    topicos.push(l);
                } else if (l.includes('class ') || l.includes('function ') || l.includes('def ') || l.includes('CREATE TABLE') || l.includes('SELECT ') || l.includes('{') || l.includes('}')) {
                    codigos.push(l);
                    bloco.push(l);
                } else if (l.toLowerCase().includes('deve') || l.toLowerCase().includes('regra') || l.toLowerCase().includes('importante') || l.toLowerCase().includes('recomenda')) {
                    diretrizes.push(l);
                    bloco.push(l);
                } else {
                    bloco.push(l);
                }
            }

            if (bloco.length > 0) parágrafos.push(bloco.join(' '));

            const topicosUnicos = Array.from(new Set(topicos)).slice(0, 30);
            const diretrizesUnicas = Array.from(new Set(diretrizes)).slice(0, 15);
            const codigosUnicos = Array.from(new Set(codigos)).slice(0, 25);

            let textoLimpo = parágrafos.join('\n\n');
            if (textoLimpo.length > 150000) {
                textoLimpo = textoLimpo.substring(0, 150000) + '\n\n... [Conhecimento compilado e otimizado para a Skill Antigravity] ...';
            }

            const dataHoje = new Date().toLocaleString('pt-BR');

            return `---
name: ${slug}
description: >
  Skill técnica e guia de arquitetura extraído do livro PDF "${nomeArquivo}" (${totalPaginas} páginas). Fornece diretrizes de código, padrões de projeto e boas práticas compiladas para uso no Antigravity IDE.
source: ${nomeArquivo}
generated_at: ${dataHoje}
---

# 🧠 Skill: ${tituloDoc}

> [!IMPORTANT]
> **Antigravity Skill Specification** — Conhecimento extraído do documento técnico: \`${nomeArquivo}\`
> - **Total de Páginas**: ${totalPaginas}
> - **Data de Geramento**: ${dataHoje}
> - **Formato**: Markdown Otimizado para Antigravity AI

---

## 📌 1. Visão Geral & Objetivos da Skill

Esta Skill foi compilada a partir do livro **"${tituloDoc}"** e serve como guia de referência técnica para tomada de decisões arquiteturais, padrões de design e padrões de implementação no projeto.

---

## 📐 2. Principais Tópicos & Padrões Extraídos

${topicosUnicos.length > 0 ? topicosUnicos.map(t => `- **${t}**`).join('\n') : '- Padrões e conceitos fundamentais do documento.'}

---

## ⚙️ 3. Regras & Diretrizes Técnicas

${diretrizesUnicas.length > 0 ? diretrizesUnicas.map(d => `> 💡 ${d}`).join('\n\n') : '> 💡 Aplique arquitetura limpa, separação de responsabilidades e reutilização de código.'}

---

${codigosUnicos.length > 0 ? `## 💻 4. Estruturas & Exemplos de Código de Referência

\`\`\`javascript
${codigosUnicos.join('\n')}
\`\`\`

---` : ''}

## 📖 5. Corpo Completo de Conhecimento

${textoLimpo}
`;
        }

        // 🤖 Motor de Síntese e Interpretação via Inteligência Artificial
        async function sintetizarSkillComIA(rawText, tituloDoc, nomeArquivo, totalPaginas, userApiKey = '', objetivoAgente = '') {
            const aiSaved = carregarAiConfig();
            const apiKey = userApiKey.trim() || aiSaved.geminiKey || process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || '';
            const ollamaEndpoint = (aiSaved.ollamaUrl || 'http://127.0.0.1:11434').replace(/\/$/, '') + '/api/generate';
            const slug = slugify(tituloDoc);
            const dataHoje = new Date().toLocaleString('pt-BR');
            const foco = objetivoAgente && objetivoAgente.trim() ? objetivoAgente.trim() : 'Análise, arquitetura e aplicação de boas práticas no projeto';

            const systemPrompt = `Você é um Arquiteto de Software Sênior e Especialista em Antigravity IDE.
Sua missão é analisar o texto do livro/documento técnico PDF "${nomeArquivo}" (Título: "${tituloDoc}") e GERAR UMA HABILIDADE (SKILL.md) MODULAR E PROMPT DE SISTEMA PROFISSIONAL para o Antigravity IDE.

OBJETIVO DA TAREFA DO AGENTE: "${foco}"

Gere a resposta EXATAMENTE no seguinte formato Markdown com Frontmatter YAML:

---
name: ${slug}
description: >
  Skill e guia de atuação baseado no livro "${nomeArquivo}" (${totalPaginas} páginas). Atua como um especialista focado em "${foco}", aplicando as diretrizes, padrões e regras do livro no projeto do usuário.
source: ${nomeArquivo}
generated_at: ${dataHoje}
---

# 🧠 Skill: ${tituloDoc} — ${foco}

> [!IMPORTANT]
> **Manual de Atuação do Agente Antigravity** — Baseado no livro: \`${nomeArquivo}\`
> - **Objetivo da Tarefa**: ${foco}
> - **Páginas Processadas**: ${totalPaginas}
> - **Data de Geramento**: ${dataHoje}

---

## 🎭 1. Papel & Contexto do Agente
Atue como um especialista sênior aplicando a metodologia descrita no arquivo \`${nomeArquivo}\`.
Sua tarefa é analisar o projeto e executar com precisão: **"${foco}"**.

---

## ⚙️ 2. Restrições & Diretrizes Técnicas (Regras Invioláveis)
[Extraia de 5 a 10 regras técnicas estritas do livro que o agente JAMAIS deve violar ao modificar o código ou a arquitetura]

---

## 📐 3. Padrões de Projeto & Metodologia Recomendada
[Detalhamento dos padrões de projeto do livro aplicados a esta tarefa]

---

## 💻 4. Exemplos Práticos de Código & Padrão de Saída
[Exemplos claros de código e formato de entrega esperado]

---

## 📋 5. Plano de Execução em 5 Etapas (Visão de Gerente)
1. **Etapa 1: Diagnóstico e Análise** — Mapear os arquivos afetados no projeto.
2. **Etapa 2: Proposta Arquitetural** — Apresentar o plano de ação para aprovação do usuário.
3. **Etapa 3: Execução Modular** — Aplicar as modificações seguindo as regras da Skill.
4. **Etapa 4: Validação & Checklist** — Verificar se nenhuma restrição do livro foi violada.
5. **Etapa 5: Entrega & Relatório** — Apresentar walkthrough e resumo das melhorias.

---

## 📖 6. Base de Conhecimento Relevante do Livro
[Trechos e conceitos-chave do livro para orientação contínua]
`;

            let promptText = (rawText || '').substring(0, 80000);

            // 1. Tenta via Google Gemini API se a chave estiver disponível
            if (apiKey) {
                try {
                    console.log('[AI Synthesis] Interpretando PDF via Google Gemini API...');
                    const resAi = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            contents: [{
                                parts: [
                                    { text: systemPrompt },
                                    { text: `\n\n--- TEXTO BRUTO DO LIVRO PDF ---\n\n${promptText}` }
                                ]
                            }]
                        })
                    });

                    if (resAi.ok) {
                        const dataAi = await resAi.json();
                        const markdownContent = dataAi.candidates?.[0]?.content?.parts?.[0]?.text;
                        if (markdownContent && markdownContent.includes('---')) {
                            return { sucesso: true, content: markdownContent, provedor: 'Google Gemini AI (1.5 Flash)' };
                        }
                    }
                } catch(err) {
                    console.error('[Gemini API Error]:', err.message);
                }
            }

            // 2. Tenta via Ollama Local
            try {
                console.log(`[AI Synthesis] Checando Ollama Local (${ollamaEndpoint})...`);
                const resOllama = await fetch(ollamaEndpoint, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        model: 'llama3',
                        prompt: `${systemPrompt}\n\n--- TEXTO BRUTO DO LIVRO PDF ---\n\n${promptText}`,
                        stream: false
                    })
                });

                if (resOllama.ok) {
                    const dataOllama = await resOllama.json();
                    if (dataOllama.response && dataOllama.response.includes('---')) {
                        return { sucesso: true, content: dataOllama.response, provedor: 'Ollama Local (LLM)' };
                    }
                }
            } catch(err) {
                // Ollama indisponível
            }

            // 3. Fallback estruturado caso nenhuma IA esteja configurada
            return { sucesso: false, content: estruturarConhecimentoParaSkill(rawText, tituloDoc, nomeArquivo, totalPaginas), provedor: 'Algoritmo de Estruturação Técnica' };
        }

        let apiKeyUser = req.body.apiKey || '';
        let objetivoAgente = req.body.objetivo || '';
        const aiResult = await sintetizarSkillComIA(pdfData.text, tituloSkill, nomeDoc, numPages, apiKeyUser, objetivoAgente);
        const skillContent = aiResult.content;

        fs.writeFileSync(targetFilePath, skillContent, 'utf8');

        // Registra também no Banco de Dados Firebird para a Loja de Prompts
        try {
            Firebird.attach(dbOptions, (err, db) => {
                if (!err && db) {
                    db.query('INSERT INTO TB_PROMPTS_LOJA (TITULO, CATEGORIA, DETALHES, PRECO, TIPO) VALUES (?, ?, ?, ?, ?)', [
                        `Agente: ${tituloSkill} - ${(objetivoAgente || 'Metodologia').substring(0, 30)}`,
                        'Engenharia de Software & IA',
                        skillContent,
                        0.00,
                        'PROMPT'
                    ], (qErr) => {
                        if (qErr) console.log('Aviso banco prompts:', qErr.message);
                        db.detach();
                    });
                }
            });
        } catch(e) {}

        console.log(`[PDF Skill] Gerada com sucesso e interpretada (${aiResult.provedor}): ${targetFilePath} (${numPages} páginas)`);
        
        const log = `✅ Skill "${tituloSkill}" gerada com sucesso!\n• Provedor de Interpretação: ${aiResult.provedor}\n• Objetivo da Tarefa: ${objetivoAgente || 'Atuação no Projeto'}\n• Total de Páginas: ${numPages}\n• Arquivo da Skill: ${targetFilePath}\n• Cadastrado na Loja de Prompts automaticamente!`;

        res.json({
            sucesso: true,
            log,
            caminho: targetFilePath,
            slug,
            titulo: tituloSkill,
            paginas: numPages,
            provedor: aiResult.provedor
        });

    } catch (e) {
        console.error('[PDF Skill Error]:', e);
        res.status(500).json({ sucesso: false, error: 'Erro ao processar o arquivo PDF: ' + e.message });
    }
});

// Rota: Listagem de Skills aprendidas (.agents/skills/*)
app.get('/api/skills', (req, res) => {
    const skillsDir = path.join(__dirname, '.agents', 'skills');
    
    if (!fs.existsSync(skillsDir)) {
        return res.json([]);
    }

    try {
        const folders = fs.readdirSync(skillsDir, { withFileTypes: true })
            .filter(dirent => dirent.isDirectory())
            .map(dirent => dirent.name);

        const skills = [];

        for (const slug of folders) {
            const filePath = path.join(skillsDir, slug, 'SKILL.md');
            if (fs.existsSync(filePath)) {
                const content = fs.readFileSync(filePath, 'utf8');
                
                const nameMatch = content.match(/^name:\s*(.+)$/m) || content.match(/^#\s*(.+)$/m);
                const sourceMatch = content.match(/^source:\s*(.+)$/m) || content.match(/\[Assistir no YouTube\]\((.+?)\)/);
                const descMatch = content.match(/description:\s*>([\s\S]*?)(?:---|\n[a-z_]+:|$)/m) || content.match(/^description:\s*(.+)$/m);
                const dateMatch = content.match(/^generated_at:\s*(.+)$/m) || content.match(/Gerado em:\s*(.+)/);

                let description = '';
                if (descMatch && descMatch[1]) {
                    description = descMatch[1].replace(/\n/g, ' ').trim();
                }

                const skillFolder = path.join(skillsDir, slug);
                skills.push({
                    slug,
                    name: nameMatch ? nameMatch[1].trim() : slug,
                    source: sourceMatch ? sourceMatch[1].trim() : '',
                    description: description || 'Conhecimento extraído para o Antigravity IDE.',
                    generated_at: dateMatch ? dateMatch[1].trim() : '',
                    path: `.agents/skills/${slug}/SKILL.md`,
                    dirPath: skillFolder,
                    filePath: filePath
                });
            }
        }

        res.json(skills);
    } catch (err) {
        console.error('Erro ao listar skills:', err);
        res.status(500).json({ error: 'Erro ao carregar a lista de skills.' });
    }
});

// Rota: Conteúdo completo de uma Skill
app.get('/api/skills/:slug', (req, res) => {
    const { slug } = req.params;
    const filePath = path.join(__dirname, '.agents', 'skills', slug, 'SKILL.md');
    if (fs.existsSync(filePath)) {
        const content = fs.readFileSync(filePath, 'utf8');
        res.json({ slug, content });
    } else {
        res.status(404).json({ error: 'Skill não encontrada.' });
    }
});


// Rota: Obtém o título do vídeo do YouTube automaticamente
app.get('/api/video-info', async (req, res) => {
    const { url } = req.query;
    if (!url) return res.status(400).json({ error: 'URL é obrigatória' });

    try {
        // Tenta primeiro via oEmbed API do YouTube (super rápido < 100ms)
        const oembedUrl = `https://www.youtube.com/oembed?url=${encodeURIComponent(url)}&format=json`;
        const fetchRes = await fetch(oembedUrl);
        if (fetchRes.ok) {
            const data = await fetchRes.json();
            if (data && data.title) {
                return res.json({ title: data.title, author: data.author_name });
            }
        }
    } catch (_) {}

    // Fallback via yt-dlp
    const scriptPath = path.join(__dirname, 'yt-dlp.exe');
    const { execFile } = require('child_process');
    execFile(scriptPath, ['--get-title', '--no-playlist', url], { timeout: 15000 }, (err, stdout) => {
        if (!err && stdout && stdout.trim()) {
            return res.json({ title: stdout.trim() });
        }
        res.status(500).json({ error: 'Não foi possível obter o título.' });
    });
});


// ROTAS DE LOGS (Terminal em Tempo Real / Big Brother)
app.get('/api/logs', (req, res) => {
    res.json(logger.getLogs());
});

app.get('/api/logs/stream', (req, res) => {
    logger.handleSSE(req, res);
});

app.post('/api/logs', (req, res) => {
    const { fonte, nivel, mensagem } = req.body;
    if (!mensagem) {
        return res.status(400).json({ error: 'Mensagem de log é obrigatória.' });
    }
    const entry = logger.addLog(fonte, nivel, mensagem);
    res.json({ success: true, entry });
});

// =======================================================================
// HELPER: GERADOR DE PAYLOAD PIX EMV BR CODE (Padrão Banco Central)
// =======================================================================
function gerarPayloadPixEMV(chavePix, nome, cidade, valor, txId = 'CONNECTMEDIA') {
    const cleanStr = (s) => (s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-zA-Z0-9 ]/g, '').trim();
    const cleanChave = (chavePix || 'connectmedia@pix.com.br').trim();
    const cleanNome = cleanStr(nome || 'Connect Media').substring(0, 25) || 'Connect Media';
    const cleanCidade = cleanStr(cidade || 'Sao Paulo').substring(0, 15) || 'Sao Paulo';
    const valStr = parseFloat(valor || 0).toFixed(2);

    const f = (id, val) => id + String(val.length).padStart(2, '0') + val;

    const gui = f('00', 'br.gov.bcb.pix');
    const key = f('01', cleanChave);
    const merchantAccount = f('26', gui + key);

    const payloadSemCRC = 
        f('00', '01') + 
        merchantAccount +
        f('52', '0000') + 
        f('53', '986') + 
        f('54', valStr) + 
        f('58', 'BR') + 
        f('59', cleanNome) + 
        f('60', cleanCidade) + 
        f('62', f('05', txId.substring(0, 25))) + 
        '6304';

    function calcularCRC16(str) {
        let crc = 0xFFFF;
        for (let i = 0; i < str.length; i++) {
            crc ^= (str.charCodeAt(i) << 8);
            for (let j = 0; j < 8; j++) {
                if ((crc & 0x8000) !== 0) {
                    crc = ((crc << 1) ^ 0x1021) & 0xFFFF;
                } else {
                    crc = (crc << 1) & 0xFFFF;
                }
            }
        }
        return crc.toString(16).toUpperCase().padStart(4, '0');
    }

    return payloadSemCRC + calcularCRC16(payloadSemCRC);
}

// =======================================================================
// ROTAS DA LOJA DE PROMPTS & CHECKOUT PIX
// =======================================================================

// Rota: Lista todos os prompts da loja
app.get('/api/prompts', (req, res) => {
    Firebird.attach(dbOptions, (err, db) => {
        if (err) return res.status(500).json({ error: 'Erro de conexão com o banco.' });

        const query = 'SELECT ID_PROMPT, TITULO, CATEGORIA, DESCRICAO_CURTA, PRECO_REAIS, TAGS, AUTOR, DATA_CADASTRO, CAPA_URL, TIPO_ITEM FROM TB_PROMPTS_LOJA WHERE ATIVO = 1 ORDER BY ID_PROMPT DESC';
        db.query(query, (err, result) => {
            if (err) {
                db.detach();
                return res.status(500).json({ error: 'Erro ao buscar catálogo de prompts.' });
            }

            // Busca IDs comprados para marcar no catálogo
            db.query('SELECT ID_PROMPT FROM TB_MINHAS_COMPRAS', (errCompras, resCompras) => {
                db.detach();
                const compradosSet = new Set((resCompras || []).map(c => c.ID_PROMPT));

                const prompts = result.map(p => ({
                    id: p.ID_PROMPT,
                    titulo: p.TITULO,
                    categoria: p.CATEGORIA,
                    descricao: p.DESCRICAO_CURTA,
                    preco: parseFloat(p.PRECO_REAIS || 0),
                    tags: p.TAGS ? p.TAGS.split(',').map(t => t.trim()) : [],
                    autor: p.AUTOR,
                    capaUrl: p.CAPA_URL ? p.CAPA_URL.toString('utf8') : null,
                    tipoItem: p.TIPO_ITEM || 'PROMPT',
                    comprado: compradosSet.has(p.ID_PROMPT)
                }));

                res.json(prompts);
            });
        });
    });
});

// Rota: Lista prompts comprados pelo usuário com o texto completo do System Prompt
app.get('/api/prompts/meus', (req, res) => {
    Firebird.attach(dbOptions, (err, db) => {
        if (err) return res.status(500).json({ error: 'Erro de conexão com o banco.' });

        const query = `
            SELECT p.ID_PROMPT, p.TITULO, p.CATEGORIA, p.DESCRICAO_CURTA, p.PROMPT_SISTEMA, p.TAGS, c.DATA_COMPRA
            FROM TB_MINHAS_COMPRAS c
            JOIN TB_PROMPTS_LOJA p ON c.ID_PROMPT = p.ID_PROMPT
            ORDER BY c.DATA_COMPRA DESC
        `;

        db.query(query, (err, result) => {
            db.detach();
            if (err) return res.status(500).json({ error: 'Erro ao buscar meus prompts.' });

            const meusPrompts = (result || []).map(p => ({
                id: p.ID_PROMPT,
                titulo: p.TITULO,
                categoria: p.CATEGORIA,
                descricao: p.DESCRICAO_CURTA,
                promptSistema: p.PROMPT_SISTEMA ? p.PROMPT_SISTEMA.toString('utf8') : '',
                tags: p.TAGS ? p.TAGS.split(',').map(t => t.trim()) : [],
                dataCompra: p.DATA_COMPRA
            }));

            res.json(meusPrompts);
        });
    });
});

// Rota: Gera QR Code PIX e ordem de venda para os itens do carrinho
app.post('/api/prompts/gerar-pix', (req, res) => {
    const { promptIds } = req.body;
    if (!Array.isArray(promptIds) || promptIds.length === 0) {
        return res.status(400).json({ error: 'Nenhum prompt selecionado.' });
    }

    Firebird.attach(dbOptions, (err, db) => {
        if (err) return res.status(500).json({ error: 'Erro de conexão com o banco.' });

        // Busca valores e títulos dos prompts
        const inClause = promptIds.map(() => '?').join(',');
        const queryPrompts = `SELECT ID_PROMPT, TITULO, PRECO_REAIS FROM TB_PROMPTS_LOJA WHERE ID_PROMPT IN (${inClause})`;

        db.query(queryPrompts, promptIds, (err, prompts) => {
            if (err || !prompts || prompts.length === 0) {
                db.detach();
                return res.status(400).json({ error: 'Prompts não encontrados.' });
            }

            // Calcula total
            const totalVal = prompts.reduce((acc, p) => acc + parseFloat(p.PRECO_REAIS || 0), 0);

            // Busca configurações Pix do usuário
            db.query('SELECT CHAVE_PIX, NOME_RECEBEDOR_PIX, CIDADE_RECEBEDOR_PIX FROM TB_CONFIGURACOES WHERE ID_CONFIG = 1', (errCfg, resCfg) => {
                const cfg = (resCfg && resCfg[0]) || {};
                const chavePix = cfg.CHAVE_PIX || 'connectmedia@pix.com.br';
                const nome = cfg.NOME_RECEBEDOR_PIX || 'Connect Media Solucoes';
                const cidade = cfg.CIDADE_RECEBEDOR_PIX || 'Sao Paulo';

                const txId = 'PROMPT' + Date.now().toString().slice(-8);
                const codigoPix = gerarPayloadPixEMV(chavePix, nome, cidade, totalVal, txId);
                const itensJson = JSON.stringify(prompts.map(p => ({ id: p.ID_PROMPT, titulo: p.TITULO, preco: p.PRECO_REAIS })));

                const insertVenda = `
                    INSERT INTO TB_VENDAS_PIX (VALOR_TOTAL, STATUS, CODIGO_PIX, ITENS_JSON)
                    VALUES (?, 'PENDENTE', ?, ?)
                    RETURNING ID_VENDA
                `;

                db.query(insertVenda, [totalVal, codigoPix, itensJson], (errIns, resIns) => {
                    db.detach();
                    if (errIns) return res.status(500).json({ error: 'Erro ao registrar ordem de pagamento Pix.' });

                    const idVenda = (resIns && resIns[0] && resIns[0].ID_VENDA) ? resIns[0].ID_VENDA : ((resIns && resIns.ID_VENDA) ? resIns.ID_VENDA : 1);
                    logger.info('LOJA PIX', `🛒 Nova ordem Pix gerada (#${idVenda}) - R$ ${totalVal.toFixed(2)} (${prompts.length} itens)`);

                    res.json({
                        idVenda,
                        valorTotal: totalVal,
                        codigoPix,
                        itens: prompts.map(p => ({ id: p.ID_PROMPT, titulo: p.TITULO, preco: parseFloat(p.PRECO_REAIS || 0) }))
                    });
                });
            });
        });
    });
});

// Rota: Confirma pagamento Pix e libera os prompts comprados
app.post('/api/prompts/confirmar-pix', (req, res) => {
    const { idVenda } = req.body;
    if (!idVenda) return res.status(400).json({ error: 'ID da venda é obrigatório.' });

    Firebird.attach(dbOptions, (err, db) => {
        if (err) return res.status(500).json({ error: 'Erro de conexão com o banco.' });

        db.query('SELECT ID_VENDA, ITENS_JSON, STATUS FROM TB_VENDAS_PIX WHERE ID_VENDA = ?', [idVenda], (err, resVenda) => {
            if (err || !resVenda || resVenda.length === 0) {
                db.detach();
                return res.status(404).json({ error: 'Venda não encontrada.' });
            }

            const venda = resVenda[0];
            let itens = [];
            try { itens = JSON.parse(venda.ITENS_JSON || '[]'); } catch (_) {}

            // Atualiza status para PAGO
            db.query("UPDATE TB_VENDAS_PIX SET STATUS = 'PAGO' WHERE ID_VENDA = ?", [idVenda], () => {
                let idx = 0;
                function insereProximo() {
                    if (idx >= itens.length) {
                        db.detach();
                        logger.success('LOJA PIX', `✅ Pagamento confirmado para ordem Pix #${idVenda}! Prompts liberados com sucesso.`);
                        return res.json({ success: true, message: 'Pagamento Pix confirmado! Prompts adicionados à sua biblioteca com sucesso.' });
                    }
                    const item = itens[idx++];
                    db.query('INSERT INTO TB_MINHAS_COMPRAS (ID_PROMPT, ID_VENDA) VALUES (?, ?)', [item.id, idVenda], () => {
                        insereProximo();
                    });
                }
                insereProximo();
            });
        });
    });
});

// Rota: Envia comprovante de pagamento Pix da ordem
app.post('/api/prompts/enviar-comprovante', (req, res) => {
    const { idVenda, comprovante } = req.body;
    if (!idVenda || !comprovante) {
        return res.status(400).json({ error: 'ID da venda e comprovante são obrigatórios.' });
    }

    Firebird.attach(dbOptions, (err, db) => {
        if (err) return res.status(500).json({ error: 'Erro de conexão com o banco.' });

        db.query('UPDATE TB_VENDAS_PIX SET COMPROVANTE = ? WHERE ID_VENDA = ?', [comprovante, idVenda], (errUp) => {
            db.detach();
            if (errUp) return res.status(500).json({ error: 'Erro ao salvar comprovante no banco de dados.' });

            logger.success('LOJA PIX', `📄 Comprovante anexado para a ordem Pix #${idVenda}`);
            res.json({ success: true, message: 'Comprovante de pagamento enviado com sucesso!' });
        });
    });
});

// =======================================================================
// ROTAS DE AUTENTICAÇÃO SAAS (LOGIN, CADASTRO, ESQUECI SENHA)
// =======================================================================
const crypto = require('crypto');

function hashSenha(senha) {
    return crypto.createHash('sha256').update(senha || '').digest('hex');
}

function gerarTokenSessao(usuario) {
    const payload = {
        id: usuario.ID_USUARIO,
        nome: usuario.NOME,
        email: usuario.EMAIL,
        perfil: usuario.PERFIL,
        exp: Date.now() + (7 * 24 * 60 * 60 * 1000) // 7 dias
    };
    return Buffer.from(JSON.stringify(payload)).toString('base64');
}

function obterUsuarioSessao(req) {
    const authHeader = req.headers['authorization'] || req.headers['x-auth-token'];
    if (!authHeader) return null;
    const token = authHeader.replace(/^Bearer\s+/, '');
    try {
        const payload = JSON.parse(Buffer.from(token, 'base64').toString('utf8'));
        if (payload.exp && payload.exp > Date.now()) {
            return payload;
        }
    } catch (_) {}
    return null;
}

// Rota: Cadastro de Novo Usuário
app.post('/api/auth/register', (req, res) => {
    const { nome, email, senha } = req.body;
    if (!nome || !email || !senha) {
        return res.status(400).json({ error: 'Nome, e-mail e senha são obrigatórios.' });
    }
    if (senha.length < 6) {
        return res.status(400).json({ error: 'A senha deve ter no mínimo 6 caracteres.' });
    }

    Firebird.attach(dbOptions, (err, db) => {
        if (err) return res.status(500).json({ error: 'Erro de conexão com o banco.' });

        const emailLower = email.trim().toLowerCase();
        db.query('SELECT ID_USUARIO FROM TB_USUARIOS WHERE EMAIL = ?', [emailLower], (err, resExist) => {
            if (resExist && resExist.length > 0) {
                db.detach();
                return res.status(400).json({ error: 'Este e-mail já está cadastrado no sistema.' });
            }

            const senhaHash = hashSenha(senha);
            const queryInsert = `
                INSERT INTO TB_USUARIOS (NOME, EMAIL, SENHA_HASH, PERFIL, ATIVO)
                VALUES (?, ?, ?, 'CLIENTE', 1)
                RETURNING ID_USUARIO, NOME, EMAIL, PERFIL
            `;

            db.query(queryInsert, [nome.trim(), emailLower, senhaHash], (errIns, resIns) => {
                db.detach();
                if (errIns) return res.status(500).json({ error: 'Erro ao cadastrar usuário.' });

                const idUser = (resIns && resIns[0] && resIns[0].ID_USUARIO) ? resIns[0].ID_USUARIO : 1;
                const userObj = { ID_USUARIO: idUser, NOME: nome.trim(), EMAIL: emailLower, PERFIL: 'CLIENTE' };
                const token = gerarTokenSessao(userObj);

                logger.success('SAAS AUTH', `👤 Novo usuário cadastrado: ${emailLower} (#${idUser})`);
                res.json({ success: true, token, user: { id: idUser, nome: nome.trim(), email: emailLower, perfil: 'CLIENTE' } });
            });
        });
    });
});

// Rota: Login de Usuário
app.post('/api/auth/login', (req, res) => {
    const { email, senha } = req.body;
    if (!email || !senha) {
        return res.status(400).json({ error: 'E-mail e senha são obrigatórios.' });
    }

    Firebird.attach(dbOptions, (err, db) => {
        if (err) return res.status(500).json({ error: 'Erro de conexão com o banco.' });

        const emailLower = email.trim().toLowerCase();
        const senhaHash = hashSenha(senha);

        const query = 'SELECT ID_USUARIO, NOME, EMAIL, PERFIL, ATIVO FROM TB_USUARIOS WHERE EMAIL = ? AND SENHA_HASH = ?';
        db.query(query, [emailLower, senhaHash], (err, resUser) => {
            db.detach();
            if (err || !resUser || resUser.length === 0) {
                return res.status(401).json({ error: 'E-mail ou senha incorretos.' });
            }

            const u = resUser[0];
            if (u.ATIVO === 0) {
                return res.status(403).json({ error: 'Sua conta está bloqueada pelo Administrador. Entre em contato com o suporte.' });
            }

            const token = gerarTokenSessao(u);
            logger.info('SAAS AUTH', `🔑 Login efetuado: ${u.EMAIL} [${u.PERFIL}]`);

            res.json({
                success: true,
                token,
                user: { id: u.ID_USUARIO, nome: u.NOME, email: u.EMAIL, perfil: u.PERFIL }
            });
        });
    });
});

// Rota: Solicitacao de Recuperação de Senha (Esqueci Minha Senha)
app.post('/api/auth/esqueci-senha', (req, res) => {
    const { email } = req.body;
    if (!email) return res.status(400).json({ error: 'E-mail é obrigatório.' });

    Firebird.attach(dbOptions, (err, db) => {
        if (err) return res.status(500).json({ error: 'Erro de conexão com o banco.' });

        const emailLower = email.trim().toLowerCase();
        const tokenRecuperacao = Math.floor(100000 + Math.random() * 900000).toString(); // Código de 6 dígitos

        db.query('UPDATE TB_USUARIOS SET TOKEN_RECUPERACAO = ? WHERE EMAIL = ?', [tokenRecuperacao, emailLower], (err, resUp) => {
            db.detach();
            logger.info('SAAS AUTH', `🔑 Código de recuperação gerado para ${emailLower}: ${tokenRecuperacao}`);
            res.json({ success: true, message: 'Se o e-mail estiver cadastrado, um código de recuperação foi gerado.', tokenSimulado: tokenRecuperacao });
        });
    });
});

// Rota: Redefinição de Senha com Código
app.post('/api/auth/redefinir-senha', (req, res) => {
    const { email, token, novaSenha } = req.body;
    if (!email || !token || !novaSenha) {
        return res.status(400).json({ error: 'Todos os campos são obrigatórios.' });
    }

    Firebird.attach(dbOptions, (err, db) => {
        if (err) return res.status(500).json({ error: 'Erro de conexão com o banco.' });

        const emailLower = email.trim().toLowerCase();
        const novaSenhaHash = hashSenha(novaSenha);

        const query = 'UPDATE TB_USUARIOS SET SENHA_HASH = ?, TOKEN_RECUPERACAO = NULL WHERE EMAIL = ? AND TOKEN_RECUPERACAO = ?';
        db.query(query, [novaSenhaHash, emailLower, token], (err, resUp) => {
            db.detach();
            logger.success('SAAS AUTH', `✅ Senha redefinida com sucesso para ${emailLower}`);
            res.json({ success: true, message: 'Senha redefinida com sucesso! Você já pode fazer login com a nova senha.' });
        });
    });
});

// Rota: Perfil do usuário atual
app.get('/api/auth/me', (req, res) => {
    const sessao = obterUsuarioSessao(req);
    if (!sessao) return res.status(401).json({ error: 'Não autenticado.' });
    res.json({ user: sessao });
});

// =======================================================================
// ROTAS EXCLUSIVAS DO PAINEL ADMIN SAAS (APENAS PERFIL 'ADMIN')
// =======================================================================

// Rota Admin: Métricas Globais e Faturamento
app.get('/api/admin/metricas', (req, res) => {
    const sessao = obterUsuarioSessao(req);
    if (!sessao || sessao.perfil !== 'ADMIN') {
        return res.status(403).json({ error: 'Acesso negado. Requer perfil de Administrador.' });
    }

    Firebird.attach(dbOptions, (err, db) => {
        if (err) return res.status(500).json({ error: 'Erro de conexão com o banco.' });

        db.query('SELECT COUNT(ID_USUARIO) AS TOTAL_USER FROM TB_USUARIOS', (err1, resUser) => {
            db.query("SELECT SUM(VALOR_TOTAL) AS TOTAL_FAT, COUNT(ID_VENDA) AS TOTAL_VENDAS FROM TB_VENDAS_PIX WHERE STATUS = 'PAGO'", (err2, resFats) => {
                db.query('SELECT COUNT(ID_PROMPT) AS TOTAL_PROMPTS FROM TB_PROMPTS_LOJA', (err3, resPrompts) => {
                    db.detach();

                    const totalUsuarios = (resUser && resUser[0]) ? resUser[0].TOTAL_USER : 0;
                    const faturamentoTotal = (resFats && resFats[0] && resFats[0].TOTAL_FAT) ? parseFloat(resFats[0].TOTAL_FAT) : 0;
                    const totalVendasPix = (resFats && resFats[0]) ? resFats[0].TOTAL_VENDAS : 0;
                    const totalPrompts = (resPrompts && resPrompts[0]) ? resPrompts[0].TOTAL_PROMPTS : 0;

                    res.json({
                        totalUsuarios,
                        faturamentoTotal,
                        totalVendasPix,
                        totalPrompts
                    });
                });
            });
        });
    });
});

// Rota Admin: Lista todos os usuários
app.get('/api/admin/usuarios', (req, res) => {
    const sessao = obterUsuarioSessao(req);
    if (!sessao || sessao.perfil !== 'ADMIN') {
        return res.status(403).json({ error: 'Acesso negado. Requer perfil de Administrador.' });
    }

    Firebird.attach(dbOptions, (err, db) => {
        if (err) return res.status(500).json({ error: 'Erro de conexão com o banco.' });

        db.query('SELECT ID_USUARIO, NOME, EMAIL, PERFIL, ATIVO, DATA_CADASTRO FROM TB_USUARIOS ORDER BY ID_USUARIO DESC', (err, result) => {
            db.detach();
            if (err) return res.status(500).json({ error: 'Erro ao buscar usuários.' });
            res.json(result || []);
        });
    });
});

// Rota Admin: Bloquear / Ativar usuário
app.post('/api/admin/usuarios/:id/status', (req, res) => {
    const sessao = obterUsuarioSessao(req);
    if (!sessao || sessao.perfil !== 'ADMIN') {
        return res.status(403).json({ error: 'Acesso negado. Requer perfil de Administrador.' });
    }

    const idUser = req.params.id;
    const { ativo } = req.body; // 1 ou 0

    Firebird.attach(dbOptions, (err, db) => {
        if (err) return res.status(500).json({ error: 'Erro de conexão com o banco.' });

        db.query('UPDATE TB_USUARIOS SET ATIVO = ? WHERE ID_USUARIO = ?', [ativo, idUser], (err) => {
            db.detach();
            if (err) return res.status(500).json({ error: 'Erro ao atualizar status do usuário.' });
            logger.info('ADMIN SAAS', `⚙️ Status do usuário #${idUser} alterado para ${ativo === 1 ? 'ATIVO' : 'BLOQUEADO'}`);
            res.json({ success: true, message: 'Status do usuário atualizado!' });
        });
    });
});

// Rota Admin: Extrato completo de Vendas Pix Globais
app.get('/api/admin/vendas', (req, res) => {
    const sessao = obterUsuarioSessao(req);
    if (!sessao || sessao.perfil !== 'ADMIN') {
        return res.status(403).json({ error: 'Acesso negado. Requer perfil de Administrador.' });
    }

    Firebird.attach(dbOptions, (err, db) => {
        if (err) return res.status(500).json({ error: 'Erro de conexão com o banco.' });

        const query = `
            SELECT v.ID_VENDA, v.VALOR_TOTAL, v.STATUS, v.DATA_CRIACAO, v.ITENS_JSON, v.COMPROVANTE
            FROM TB_VENDAS_PIX v
            ORDER BY v.ID_VENDA DESC
        `;
        db.query(query, (err, result) => {
            db.detach();
            if (err) return res.status(500).json({ error: 'Erro ao buscar extrato de vendas.' });

            const vendas = (result || []).map(v => ({
                ID_VENDA: v.ID_VENDA,
                VALOR_TOTAL: v.VALOR_TOTAL,
                STATUS: v.STATUS,
                DATA_CRIACAO: v.DATA_CRIACAO,
                ITENS_JSON: v.ITENS_JSON,
                COMPROVANTE: v.COMPROVANTE ? v.COMPROVANTE.toString('utf8') : null
            }));

            res.json(vendas);
        });
    });
});

// Rota Admin: Salva Chave Pix Mestre da Empresa
app.post('/api/admin/config-pix', (req, res) => {
    const sessao = obterUsuarioSessao(req);
    if (!sessao || sessao.perfil !== 'ADMIN') {
        return res.status(403).json({ error: 'Acesso negado. Requer perfil de Administrador.' });
    }

    const { chavePixMestre, nomeRecebedor, cidadeRecebedor } = req.body;
    if (!chavePixMestre) return res.status(400).json({ error: 'A Chave Pix Mestre é obrigatória.' });

    Firebird.attach(dbOptions, (err, db) => {
        if (err) return res.status(500).json({ error: 'Erro de conexão com o banco.' });

        db.query('UPDATE TB_CONFIGURACOES SET CHAVE_PIX = ?, NOME_RECEBEDOR_PIX = ?, CIDADE_RECEBEDOR_PIX = ? WHERE ID_CONFIG = 1', [
            chavePixMestre, nomeRecebedor || 'Connect Media Solucoes', cidadeRecebedor || 'Sao Paulo'
        ], (err) => {
            db.detach();
            if (err) return res.status(500).json({ error: 'Erro ao salvar Chave Pix Mestre.' });
            logger.success('ADMIN SAAS', `❖ Chave Pix Mestre do SaaS atualizada para: ${chavePixMestre}`);
            res.json({ success: true, message: 'Chave Pix Mestre do SaaS salva com sucesso!' });
        });
    });
});

// Rota Admin: Aprovar Venda Pix e Liberar Prompts Manualmente
app.post('/api/admin/vendas/:id/aprovar', (req, res) => {
    const sessao = obterUsuarioSessao(req);
    if (!sessao || sessao.perfil !== 'ADMIN') {
        return res.status(403).json({ error: 'Acesso negado. Requer perfil de Administrador.' });
    }

    const idVenda = req.params.id;

    Firebird.attach(dbOptions, (err, db) => {
        if (err) return res.status(500).json({ error: 'Erro de conexão com o banco.' });

        db.query('SELECT ID_VENDA, ITENS_JSON FROM TB_VENDAS_PIX WHERE ID_VENDA = ?', [idVenda], (err, resVenda) => {
            if (err || !resVenda || resVenda.length === 0) {
                db.detach();
                return res.status(404).json({ error: 'Venda não encontrada.' });
            }

            const venda = resVenda[0];
            let itens = [];
            try { itens = JSON.parse(venda.ITENS_JSON || '[]'); } catch (_) {}

            db.query("UPDATE TB_VENDAS_PIX SET STATUS = 'PAGO' WHERE ID_VENDA = ?", [idVenda], () => {
                let idx = 0;
                function insereProximo() {
                    if (idx >= itens.length) {
                        db.detach();
                        logger.success('ADMIN SAAS', `✅ Venda #${idVenda} aprovada manualmente pelo Admin! Prompts liberados.`);
                        return res.json({ success: true, message: `Pagamento da Venda #${idVenda} aprovado com sucesso!` });
                    }
                    const item = itens[idx++];
                    db.query('INSERT INTO TB_MINHAS_COMPRAS (ID_PROMPT, ID_VENDA) VALUES (?, ?)', [item.id, idVenda], () => {
                        insereProximo();
                    });
                }
                insereProximo();
            });
        });
    });
});

// Rota Admin: CRUD Listar Todos os Prompts (incluindo desativados)
app.get('/api/admin/prompts', (req, res) => {
    const sessao = obterUsuarioSessao(req);
    if (!sessao || sessao.perfil !== 'ADMIN') {
        return res.status(403).json({ error: 'Acesso negado. Requer perfil de Administrador.' });
    }

    Firebird.attach(dbOptions, (err, db) => {
        if (err) return res.status(500).json({ error: 'Erro de conexão com o banco.' });

        const query = 'SELECT ID_PROMPT, TITULO, CATEGORIA, DESCRICAO_CURTA, PROMPT_SISTEMA, PRECO_REAIS, TAGS, AUTOR, CAPA_URL, TIPO_ITEM, ATIVO, DATA_CADASTRO FROM TB_PROMPTS_LOJA ORDER BY ID_PROMPT DESC';
        db.query(query, (err, result) => {
            db.detach();
            if (err) return res.status(500).json({ error: 'Erro ao buscar catálogo completo.' });

            const prompts = (result || []).map(p => ({
                id: p.ID_PROMPT,
                titulo: p.TITULO,
                categoria: p.CATEGORIA,
                descricao: p.DESCRICAO_CURTA,
                promptSistema: p.PROMPT_SISTEMA ? p.PROMPT_SISTEMA.toString('utf8') : '',
                preco: parseFloat(p.PRECO_REAIS || 0),
                tags: p.TAGS || '',
                autor: p.AUTOR,
                capaUrl: p.CAPA_URL ? p.CAPA_URL.toString('utf8') : '',
                tipoItem: p.TIPO_ITEM || 'PROMPT',
                ativo: p.ATIVO
            }));
            res.json(prompts);
        });
    });
});

// Rota Admin: CRUD Criar Novo Prompt / Módulo
app.post('/api/admin/prompts', (req, res) => {
    const sessao = obterUsuarioSessao(req);
    if (!sessao || sessao.perfil !== 'ADMIN') {
        return res.status(403).json({ error: 'Acesso negado. Requer perfil de Administrador.' });
    }

    const { titulo, categoria, descricao, promptSistema, preco, tags, autor, capaUrl, tipoItem } = req.body;
    if (!titulo) return res.status(400).json({ error: 'Título é obrigatório.' });

    Firebird.attach(dbOptions, (err, db) => {
        if (err) return res.status(500).json({ error: 'Erro de conexão com o banco.' });

        const queryInsert = `
            INSERT INTO TB_PROMPTS_LOJA (TITULO, CATEGORIA, DESCRICAO_CURTA, PROMPT_SISTEMA, PRECO_REAIS, TAGS, AUTOR, CAPA_URL, TIPO_ITEM, ATIVO)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1)
        `;

        db.query(queryInsert, [
            titulo.trim(),
            categoria || 'GERAL',
            descricao || '',
            promptSistema || '',
            parseFloat(preco || 0),
            tags || '',
            autor || 'Connect Media AI',
            capaUrl || '',
            tipoItem || 'PROMPT'
        ], (errIns) => {
            db.detach();
            if (errIns) return res.status(500).json({ error: 'Erro ao cadastrar prompt.' });

            logger.success('ADMIN SAAS', `✨ Novo Prompt/Módulo cadastrado: "${titulo}"`);
            res.json({ success: true, message: 'Prompt cadastrado com sucesso!' });
        });
    });
});

// Rota Admin: CRUD Atualizar Prompt
app.put('/api/admin/prompts/:id', (req, res) => {
    const sessao = obterUsuarioSessao(req);
    if (!sessao || sessao.perfil !== 'ADMIN') {
        return res.status(403).json({ error: 'Acesso negado. Requer perfil de Administrador.' });
    }

    const idPrompt = req.params.id;
    const { titulo, categoria, descricao, promptSistema, preco, tags, autor, capaUrl, tipoItem, ativo } = req.body;

    Firebird.attach(dbOptions, (err, db) => {
        if (err) return res.status(500).json({ error: 'Erro de conexão com o banco.' });

        const queryUpdate = `
            UPDATE TB_PROMPTS_LOJA
            SET TITULO = ?, CATEGORIA = ?, DESCRICAO_CURTA = ?, PROMPT_SISTEMA = ?, PRECO_REAIS = ?, TAGS = ?, AUTOR = ?, CAPA_URL = ?, TIPO_ITEM = ?, ATIVO = ?
            WHERE ID_PROMPT = ?
        `;

        db.query(queryUpdate, [
            titulo, categoria, descricao, promptSistema, parseFloat(preco || 0), tags, autor, capaUrl, tipoItem, ativo !== undefined ? ativo : 1, idPrompt
        ], (errUp) => {
            db.detach();
            if (errUp) return res.status(500).json({ error: 'Erro ao atualizar prompt.' });

            logger.info('ADMIN SAAS', `✏️ Prompt #${idPrompt} atualizado com sucesso.`);
            res.json({ success: true, message: 'Prompt atualizado com sucesso!' });
        });
    });
});

// Rota Admin: CRUD Excluir Prompt (Soft Delete)
app.delete('/api/admin/prompts/:id', (req, res) => {
    const sessao = obterUsuarioSessao(req);
    if (!sessao || sessao.perfil !== 'ADMIN') {
        return res.status(403).json({ error: 'Acesso negado. Requer perfil de Administrador.' });
    }

    const idPrompt = req.params.id;

    Firebird.attach(dbOptions, (err, db) => {
        if (err) return res.status(500).json({ error: 'Erro de conexão com o banco.' });

        db.query('UPDATE TB_PROMPTS_LOJA SET ATIVO = 0 WHERE ID_PROMPT = ?', [idPrompt], (errDel) => {
            db.detach();
            if (errDel) return res.status(500).json({ error: 'Erro ao desativar prompt.' });

            logger.info('ADMIN SAAS', `🗑️ Prompt #${idPrompt} desativado.`);
            res.json({ success: true, message: 'Prompt desativado com sucesso!' });
        });
    });
});

// Rota: Consulta Configuração de Banco de Dados Firebird
app.get('/api/configuracoes/db', (req, res) => {
    res.json({
        host: dbOptions.host,
        port: dbOptions.port,
        database: dbOptions.database,
        user: dbOptions.user,
        password: dbOptions.password
    });
});

// Rota: Salva Configuração de Banco de Dados Firebird
app.post('/api/configuracoes/db', (req, res) => {
    const { host, port, database, user, password } = req.body;
    if (!host || !database) return res.status(400).json({ error: 'Host e caminho do banco são obrigatórios.' });

    dbOptions.atualizarConfiguracao({ host, port, database, user, password });

    Firebird.attach(dbOptions, (err, db) => {
        if (err) return res.status(500).json({ error: 'Erro ao conectar com as novas configurações do banco de dados.' });

        db.query('UPDATE TB_CONFIGURACOES SET DB_HOST = ?, DB_PORT = ?, DB_DATABASE = ?, DB_USER = ?, DB_PASSWORD = ? WHERE ID_CONFIG = 1', [
            host, parseInt(port || 3050, 10), database, user || 'SYSDBA', password || 'masterkey'
        ], (errUp) => {
            db.detach();
            logger.success('CONFIG', `⚙️ Configuração do Banco Firebird atualizada: ${host}:${port} (${database})`);
            res.json({ success: true, message: 'Configurações de conexão do Banco Firebird salvas com sucesso!' });
        });
    });
});

// Middleware Global de Tratamento de Erros (Retorna JSON em vez de HTML para erros 413 Payload Too Large)
app.use((err, req, res, next) => {
    if (err && (err.status === 413 || err.type === 'entity.too.large')) {
        return res.status(413).json({
            sucesso: false,
            error: 'O arquivo PDF é muito grande para upload direto via navegador. Informe o caminho absoluto do arquivo no campo "OU CAMINHO ABSOLUTO NO COMPUTADOR" (ex: C:\\Livros\\Manual.pdf).'
        });
    }
    if (err) {
        return res.status(err.status || 500).json({
            sucesso: false,
            error: err.message || 'Erro no processamento do servidor.'
        });
    }
    next();
});

// Inicializa o Servidor
app.listen(PORT, () => {
    logger.info('SERVIDIOR', `🚀 Connect Media rodando em http://localhost:${PORT}`);
    logger.info('SERVIDIOR', `⚙️ API REST ativada e escutando na porta ${PORT}`);
});