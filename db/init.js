const fs = require('fs');
const path = require('path');
const db = require('./connection');

async function initDB() {
  const schemaPath = path.join(__dirname, 'schema.sql');
  const schema = fs.readFileSync(schemaPath, 'utf8');
  db.exec(schema);
}

module.exports = { initDB };
