const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');

const databasePath = path.join(__dirname, '..', 'data', 'tasks.db');

fs.mkdirSync(path.dirname(databasePath), { recursive: true });

const db = new Database(databasePath);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

module.exports = db;
