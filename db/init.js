const fs = require('fs');
const path = require('path');
const db = require('./connection');

const STATUSES = ['todo', 'doing', 'in-progress', 'done'];
const PRIORITIES = ['low', 'medium', 'high'];

function getColumns(database) {
  return new Set(database.pragma('table_info(tasks)').map(column => column.name));
}

function validateLegacyRows(database, columns) {
  const rules = [['status', STATUSES, false]];
  if (columns.has('priority')) rules.push(['priority', PRIORITIES, true]);

  const details = [];
  for (const [field, valid, nullable] of rules) {
    const allowed = valid.map(() => '?').join(', ');
    const where = nullable
      ? `${field} IS NOT NULL AND ${field} NOT IN (${allowed})`
      : `${field} IS NULL OR ${field} NOT IN (${allowed})`;
    const count = database.prepare(`SELECT COUNT(*) AS count FROM tasks WHERE ${where}`)
      .get(...valid).count;
    if (!count) continue;

    const sample = database.prepare(`SELECT id, ${field} FROM tasks WHERE ${where} LIMIT 5`)
      .all(...valid);
    details.push(`${count} invalid ${field} value(s), sample: ${JSON.stringify(sample)}`);
  }

  if (details.length) {
    throw new Error(
      `Cannot migrate tasks table: ${details.join('; ')}. ` +
      "Valid statuses are 'todo', 'doing', 'in-progress', and 'done'; " +
      "valid priorities are 'low', 'medium', and 'high'. Correct the listed records and retry."
    );
  }
}

function migrateLegacyStatuses(database, columns) {
  const value = (column, fallback) => columns.has(column)
    ? `COALESCE(${column}, ${fallback})`
    : fallback;
  const description = columns.has('description') ? 'description' : 'NULL';

  database.transaction(() => database.exec(`
    CREATE TABLE tasks_new (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title VARCHAR(255) NOT NULL,
      description TEXT,
      assignee TEXT NOT NULL DEFAULT 'Unassigned',
      priority TEXT NOT NULL DEFAULT 'medium' CHECK (priority IN ('low', 'medium', 'high')),
      status TEXT NOT NULL DEFAULT 'todo' CHECK (status IN ('todo', 'in-progress', 'done')),
      position INTEGER NOT NULL DEFAULT 0,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    INSERT INTO tasks_new (id, title, description, assignee, priority, status, position, created_at)
    SELECT id, title, ${description}, ${value('assignee', "'Unassigned'")},
      ${value('priority', "'medium'")},
      CASE WHEN status = 'doing' THEN 'in-progress' ELSE status END,
      ${value('position', '0')}, ${value('created_at', 'CURRENT_TIMESTAMP')}
    FROM tasks;
    DROP TABLE tasks;
    ALTER TABLE tasks_new RENAME TO tasks;
  `))();
}

async function initDB(database = db) {
  database.exec(fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8'));

  const tableSql = database.prepare(
    "SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'tasks'"
  ).get().sql;
  let columns = getColumns(database);
  const hasLegacyStatus = tableSql.includes("'doing'") || database.prepare(
    "SELECT 1 FROM tasks WHERE status = 'doing' LIMIT 1"
  ).get();

  if (hasLegacyStatus) {
    validateLegacyRows(database, columns);
    migrateLegacyStatuses(database, columns);
    columns = getColumns(database);
  }

  const additions = {
    description: 'TEXT',
    assignee: "TEXT NOT NULL DEFAULT 'Unassigned'",
    priority: "TEXT NOT NULL DEFAULT 'medium' CHECK (priority IN ('low', 'medium', 'high'))",
    position: 'INTEGER NOT NULL DEFAULT 0'
  };
  for (const [name, definition] of Object.entries(additions)) {
    if (!columns.has(name)) database.exec(`ALTER TABLE tasks ADD COLUMN ${name} ${definition}`);
  }
}

module.exports = { initDB };
