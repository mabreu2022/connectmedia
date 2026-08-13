const Firebird = require('node-firebird');

const dbOptions = require('./dbConfig');

console.log("🔌 Testando inserção direta no Firebird...");

Firebird.attach(dbOptions, (err, db) => {
    if (err) {
        return console.error("❌ Erro ao conectar:", err);
    }

    const query = `
        INSERT INTO TB_VIDEOS_BIBLIOTECA (ID_CANAL, TITULO, VIDEO_ID, URL_VIDEO, STATUS) 
        VALUES (1, 'Video de Teste Manual', 'TESTE123', 'https://youtube.com/watch?v=TESTE123', 'PENDENTE')
    `;

    db.query(query, (err) => {
        if (err) {
            console.error("❌ Erro ao inserir no banco:", err.message);
        } else {
            console.log("✅ Sucesso absoluto! O vídeo de teste foi gravado no Firebird!");
        }
        db.detach();
    });
});