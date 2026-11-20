const fs = require('fs');
const path = require('path');
const db = require('./connection');

async function initDB(database = db) {
  const schemaPath = path.join(__dirname, 'schema.sql');
  const schema = fs.readFileSync(schemaPath, 'utf8');
  database.exec(schema);

  const table = database.prepare(
    "SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'tasks'"
  ).get();
  if (table.sql.includes("'doing'")) {
    const columns = new Set(database.pragma('table_info(tasks)').map(column => column.name));
    const description = columns.has('description') ? 'description' : 'NULL';
    const assignee = columns.has('assignee') ? "COALESCE(assignee, 'Unassigned')" : "'Unassigned'";
    const priority = columns.has('priority') ? "COALESCE(priority, 'medium')" : "'medium'";
    const position = columns.has('position') ? 'position' : '0';
    const createdAt = columns.has('created_at') ? 'created_at' : 'CURRENT_TIMESTAMP';

    const invalidStatuses = database.prepare(
      "SELECT id, status FROM tasks " +
      "WHERE status IS NULL OR status NOT IN ('todo', 'doing', 'in-progress', 'done') LIMIT 5"
    ).all();
    const invalidStatusCount = database.prepare(
      "SELECT COUNT(*) AS count FROM tasks " +
      "WHERE status IS NULL OR status NOT IN ('todo', 'doing', 'in-progress', 'done')"
    ).get().count;
    const invalidPriorities = columns.has('priority')
      ? database.prepare(
        "SELECT id, priority FROM tasks WHERE priority IS NOT NULL " +
        "AND priority NOT IN ('low', 'medium', 'high') LIMIT 5"
      ).all()
      : [];
    const invalidPriorityCount = columns.has('priority')
      ? database.prepare(
        "SELECT COUNT(*) AS count FROM tasks WHERE priority IS NOT NULL " +
        "AND priority NOT IN ('low', 'medium', 'high')"
      ).get().count
      : 0;

    if (invalidStatusCount || invalidPriorityCount) {
      const details = [];
      if (invalidStatusCount) {
        details.push(
          `${invalidStatusCount} invalid status value(s), sample: ${JSON.stringify(invalidStatuses)}`
        );
      }
      if (invalidPriorityCount) {
        details.push(
          `${invalidPriorityCount} invalid priority value(s), sample: ${JSON.stringify(invalidPriorities)}`
        );
      }
      throw new Error(
        `Cannot migrate tasks table: ${details.join('; ')}. ` +
        "Legacy statuses must be 'todo', 'doing', 'in-progress', or 'done'; " +
        "valid priorities are 'low', 'medium', and 'high'. " +
        'Correct the listed records and retry.'
      );
    }

    database.transaction(() => {
      database.exec(`
        CREATE TABLE tasks_new (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          title VARCHAR(255) NOT NULL,
          description TEXT,
          assignee TEXT NOT NULL DEFAULT 'Unassigned',
          priority TEXT NOT NULL DEFAULT 'medium'
            CHECK (priority IN ('low', 'medium', 'high')),
          status TEXT NOT NULL DEFAULT 'todo'
            CHECK (status IN ('todo', 'in-progress', 'done')),
          position INTEGER NOT NULL DEFAULT 0,
          created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
        );
        INSERT INTO tasks_new (id, title, description, assignee, priority, status, position, created_at)
        SELECT id, title, ${description}, ${assignee}, ${priority},
          CASE WHEN status = 'doing' THEN 'in-progress' ELSE status END,
          ${position}, ${createdAt}
        FROM tasks;
        DROP TABLE tasks;
        ALTER TABLE tasks_new RENAME TO tasks;
      `);
    })();
  }

  const columns = new Set(database.pragma('table_info(tasks)').map(column => column.name));
  if (!columns.has('assignee')) {
    database.exec("ALTER TABLE tasks ADD COLUMN assignee TEXT NOT NULL DEFAULT 'Unassigned'");
  }
  if (!columns.has('priority')) {
    database.exec(
      "ALTER TABLE tasks ADD COLUMN priority TEXT NOT NULL DEFAULT 'medium' " +
      "CHECK (priority IN ('low', 'medium', 'high'))"
    );
  }
}

module.exports = { initDB };
