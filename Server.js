const express = require('express');
const Firebird = require('node-firebird');
const path = require('path');
const cors = require('cors');
const { exec } = require('child_process');
const fs = require('fs');

const app = express();
const PORT = 3000;

// Middlewares
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

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
    let { nome, url } = req.body;

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

                // 4. Executa a varredura em background (assíncrona) sem prender a interface
                const scriptMonitor = path.join(__dirname, 'popular_e_rodar.js');
                exec(`node "${scriptMonitor}"`, (error, stdout, stderr) => {
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
            if (err || !result || result.length === 0) {
                return res.json({ caminho: path.join(__dirname, 'downloads'), qtdVideos: 5, intervaloMinutos: 60, dataInicial: '', dataFinal: '', buscarVideos: 1, buscarShorts: 1, buscarLives: 1 });
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
                buscarLives: result[0].BUSCAR_LIVES
            });
        });
    });
});

// Rota 08: para salvar configurações
app.post('/api/configuracoes', (req, res) => {
    const { caminho, qtdVideos, intervaloMinutos, dataInicial, dataFinal, buscarVideos, buscarShorts, buscarLives } = req.body;

    if (!caminho) return res.status(400).json({ error: 'O caminho é obrigatório.' });

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
    exec(`node "${scriptMonitor}"`, (error, stdout, stderr) => {
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
                            db.query(insertQuery, [idCanalAvulso, tituloFormatado, urlVideo, thumbnail], () => {});
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


// Rota: Gerador de Skills para Antigravity
app.post('/api/gerar-skill', (req, res) => {
    const { url, titulo, idioma } = req.body;

    if (!url) {
        return res.status(400).json({ sucesso: false, error: 'URL é obrigatória.' });
    }

    const scriptPath = path.join(__dirname, 'gerar_skill.js');
    let args = [url];
    if (titulo) { args.push('--titulo', titulo); }
    if (idioma) { args.push('--idioma', idioma); }

    const { execFile } = require('child_process');
    const processo = execFile(process.execPath, [scriptPath, ...args], {
        cwd: __dirname,
        timeout: 300000, // 5 minutos
        maxBuffer: 1024 * 1024 * 10
    }, (err, stdout, stderr) => {
        const log = (stdout || '') + (stderr ? '\n' + stderr : '');

        if (err) {
            console.error('[Skill] Erro:', err.message);
            return res.status(500).json({ sucesso: false, log, error: err.message });
        }

        // Extrai o caminho do arquivo gerado do log
        const match = log.match(/Salvo em:\s*(.+\.md)/i);
        const caminho = match ? match[1].trim() : 'Skill gerado em .agents/skills/';

        res.json({ sucesso: true, log, caminho });
    });
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

                skills.push({
                    slug,
                    name: nameMatch ? nameMatch[1].trim() : slug,
                    source: sourceMatch ? sourceMatch[1].trim() : '',
                    description: description || 'Conhecimento extraído para o Antigravity IDE.',
                    generated_at: dateMatch ? dateMatch[1].trim() : '',
                    path: `.agents/skills/${slug}/SKILL.md`
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


// Inicializa o Servidor
app.listen(PORT, () => {
    console.log(`🚀 Connect Media rodando em http://localhost:${PORT}`);
    console.log(`⚙️  API de Canais disponível em http://localhost:${PORT}/api/canais`);
});