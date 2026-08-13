const Firebird = require('node-firebird');
const { exec } = require('child_process');
const path = require('path');

const dbOptions = require('./dbConfig');

function processarCanais() {
    console.log('🚀 Iniciando Worker (Node.js)...');
    
    Firebird.attach(dbOptions, (err, db) => {
        if (err) return console.error('Erro ao conectar no banco:', err);

        db.query('SELECT ID_CANAL, NOME_CANAL, URL_YOUTUBE FROM TB_CANAIS WHERE ATIVO = 1', (err, canais) => {
            if (err) return console.error('Erro na query:', err);
            
            if (canais.length === 0) {
                console.log('Nenhum canal ativo encontrado.');
                db.detach();
                return;
            }

            canais.forEach(canal => {
                console.log('\n🔍 Verificando: ' + canal.NOME_CANAL);
                
                const ytDlpPath = path.join(__dirname, 'yt-dlp.exe');
                const comando = '"' + ytDlpPath + '" --get-title --playlist-items 1-5 "' + canal.URL_YOUTUBE + '"';
                
                exec(comando, (err, stdout, stderr) => {
                    if (err) {
                        console.log('   ⚠️ Erro ao acessar o canal: ' + canal.NOME_CANAL);
                        return;
                    }
                    console.log('   🎬 Últimos vídeos encontrados:\n' + stdout);
                });
            });
            
            db.detach();
        });
    });
}

processarCanais();
