const Firebird = require('node-firebird');
const dbOptions = require('./dbConfig');

Firebird.attach(dbOptions, (err, db) => {
    if (err) {
        console.error("Erro na conexão:", err);
        return;
    }
    db.query("SELECT NOME_CANAL, URL_YOUTUBE, ATIVO FROM TB_CANAIS", (err, result) => {
        db.detach();
        if (err) {
            console.error("Erro na consulta:", err);
            return;
        }
        console.log("Canais encontrados no banco:");
        console.table(result);
    });
});
