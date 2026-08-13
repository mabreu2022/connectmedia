const Firebird = require('node-firebird');

const dbOptions = require('./dbConfig');

Firebird.attach(dbOptions, (err, db) => {
    if (err) return console.error("Erro ao conectar:", err);

    // Consulta os metadados das colunas da tabela no Firebird
    const sql = `
        SELECT RDB\$FIELD_NAME AS CAMPO 
        FROM RDB\$RELATION_FIELDS 
        WHERE RDB\$RELATION_NAME = 'TB_VIDEOS_BIBLIOTECA'
    `;

    db.query(sql, (err, rows) => {
        if (err) {
            console.error("Erro ao ler colunas:", err.message);
        } else {
            console.log("📋 Colunas existentes na tabela TB_VIDEOS_BIBLIOTECA:");
            rows.forEach(r => console.log(" - " + r.CAMPO.trim()));
        }
        db.detach();
    });
});