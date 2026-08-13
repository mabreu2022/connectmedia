const Firebird = require('node-firebird');
const { exec } = require('child_process');
const path = require('path');

const dbOptions = require('./dbConfig');

Firebird.attach(dbOptions, (err, db) => {
    if (err) return console.error("❌ Erro ao conectar:", err);

    db.query('SELECT ID_CANAL, NOME_CANAL, URL_YOUTUBE FROM TB_CANAIS WHERE ATIVO = 1', (err, canais) => {
        if (err || !canais || canais.length === 0) return db.detach();

        const canal = canais[0];
        const ytDlpPath = path.join(__dirname, 'yt-dlp.exe');
        const comando = `"${ytDlpPath}" --print "%(title)s|%(id)s|%(webpage_url)s" --playlist-items 1-3 "${canal.URL_YOUTUBE}"`;

        exec(comando, { maxBuffer: 1024 * 1024 * 10 }, (error, stdout) => {
            const linhas = stdout.split('\n').map(l => l.trim()).filter(l => l !== '');
            let i = 0;

            function salvarProximo() {
                if (i >= linhas.length) { db.detach(); return; }
                const partes = linhas[i].split('|'); i++;
                const titulo = partes[0].trim();
                const urlVideo = partes[2].trim();

                // Incluímos ID_ASSUNTO = 0 para satisfazer a regra do banco
                const sql = `INSERT INTO TB_VIDEOS_BIBLIOTECA (ID_CANAL, ID_ASSUNTO, TITULO_VIDEO, URL_VIDEO, STATUS_DOWNLOAD) VALUES (?, 0, ?, ?, 'PENDENTE')`;
                
                db.query(sql, [canal.ID_CANAL, titulo, urlVideo], (err) => {
                    if (err) console.log(`   ❌ Erro ao inserir "${titulo}": ${err.message}`);
                    else console.log(`   💾 Salvo no Banco: ${titulo}`);
                    salvarProximo();
                });
            }
            salvarProximo();
        });
    });
});