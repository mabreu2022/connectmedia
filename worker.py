const Firebird = require('node-firebird');
const { exec } = require('child_process');
const path = require('path');

const dbOptions = require('./dbConfig');

console.log("🚀 Iniciando Worker (Node.js)...");

Firebird.attach(dbOptions, (err, db) => {
    if (err) {
        return console.error("❌ Erro fatal ao conectar no Firebird:", err);
    }

    console.log("✅ Conectado ao Firebird com sucesso!");

    db.query('SELECT ID_CANAL, NOME_CANAL, URL_YOUTUBE FROM TB_CANAIS WHERE ATIVO = 1', (err, canais) => {
        if (err) {
            console.error("❌ Erro na query de canais:", err);
            db.detach();
            return;
        }
        
        if (canais.length === 0) {
            console.log("⚠️ Nenhum canal ativo encontrado no banco.");
            db.detach();
            return;
        }

        console.log(`📋 Encontrado(s) ${canais.length} canal(is) ativo(s) para varredura.`);

        const canal = canais[0]; // Pega o primeiro canal (Adrian)
        console.log(`🔍 Varrendo canal: ${canal.NOME_CANAL}`);
        
        const ytDlpPath = path.join(__dirname, 'yt-dlp.exe');
        // Comando limpo pegando título, id e url separados por pipe (|)
        const comando = `"${ytDlpPath}" --print "%(title)s|%(id)s|%(webpage_url)s" --playlist-items 1-5 "${canal.URL_YOUTUBE}"`;
        
        exec(comando, { maxBuffer: 1024 * 1024 * 10 }, (err, stdout, stderr) => {
            if (err) {
                console.error("❌ Erro ao executar o yt-dlp:", err.message);
                db.detach();
                return;
            }

            const linhas = stdout.split('\n').map(l => l.trim()).filter(l => l !== '');
            console.log(`📥 O yt-dlp retornou ${linhas.length} vídeos.`);

            if (linhas.length === 0) {
                db.detach();
                return;
            }

            let index = 0;

            function processarProximo() {
                if (index >= linhas.length) {
                    console.log("✨ Varredura e gravação finalizadas com sucesso!");
                    db.detach();
                    return;
                }

                const linha = linhas[index];
                index++;

                const partes = linha.split('|');
                if (partes.length < 3) {
                    processarProximo();
                    return;
                }

                const titulo = partes[0].trim();
                const videoId = partes[1].trim();
                const urlVideo = partes[2].trim();

                // Verifica se já existe na base
                db.query('SELECT ID_VIDEO FROM TB_VIDEOS_BIBLIOTECA WHERE URL_VIDEO = ?', [urlVideo], (err, results) => {
                    if (!err && results && results.length > 0) {
                        console.log(`   ⏭️ Já cadastrado: ${titulo}`);
                        processarProximo();
                    } else {
                        const sqlInsert = `
                            INSERT INTO TB_VIDEOS_BIBLIOTECA (ID_CANAL, TITULO_VIDEO, URL_VIDEO, STATUS_DOWNLOAD) 
                            VALUES (?, ?, ?, 'PENDENTE')
                        `;
                        
                        db.query(sqlInsert, [canal.ID_CANAL, titulo, urlVideo], (err) => {
                            if (err) {
                                console.log(`   ❌ Erro ao gravar no banco: ${err.message}`);
                            } else {
                                console.log(`   💾 Gravado no Banco: ${titulo}`);
                            }
                            processarProximo();
                        });
                    }
                });
            }

            processarProximo();
        });
    });
});