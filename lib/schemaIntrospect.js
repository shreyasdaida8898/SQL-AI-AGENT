const db = require("../db");

async function getSchemaDescription() {
    const [columns] = await db.query(`
        SELECT TABLE_NAME, COLUMN_NAME, DATA_TYPE, COLUMN_KEY
        FROM INFORMATION_SCHEMA.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE()
        ORDER BY TABLE_NAME, ORDINAL_POSITION
    `);

    const tables = {};
    for (const col of columns) {
        if (!tables[col.TABLE_NAME]) tables[col.TABLE_NAME] = [];
        const keyNote = col.COLUMN_KEY === "PRI" ? ", primary key"
                       : col.COLUMN_KEY === "MUL" ? ", foreign key" : "";
        tables[col.TABLE_NAME].push(`  - ${col.COLUMN_NAME} (${col.DATA_TYPE}${keyNote})`);
    }

    let description = "";
    for (const [tableName, cols] of Object.entries(tables)) {
        description += `${tableName}\n${cols.join("\n")}\n\n`;
    }
    return description.trim();
}

module.exports = { getSchemaDescription };