const Firebird = require('node-firebird');

const dbOptions = require('./dbConfig');

Firebird.attach(dbOptions, (err, db) => {
    if (err) return console.error("❌ Erro ao conectar:", err);

    db.query('SELECT FIRST 5 * FROM TB_ASSUNTOS', (err, rows) => {
        if (err) {
            console.error("❌ Erro ao buscar assuntos:", err.message);
            // Se o nome da tabela for diferente, tentamos listar as tabelas
            db.query("SELECT RDB$RELATION_NAME FROM RDB$RELATIONS WHERE RDB$SYSTEM_FLAG = 0", (e, tables) => {
                if (!e) {
                    console.log("📋 Tabelas disponíveis no banco:");
                    tables.forEach(t => console.log(" - " + t.RDB$RELATION_NAME.trim()));
                }
                db.detach();
            });
        } else {
            console.log("📋 Assuntos encontrados na tabela:");
            console.log(rows);
            db.detach();
        }
    });
});