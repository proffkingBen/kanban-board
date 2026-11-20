const db = require('./connection');

const VALID_STATUSES = new Set(['todo', 'in-progress', 'done']);
const VALID_PRIORITIES = new Set(['low', 'medium', 'high']);

function ensure(condition, message) {
  if (!condition) throw new Error(message);
}

const updateStatements = new Map();
let statements;
let updateTaskTransaction;
let deleteTaskTransaction;

function prepareStatements() {
  if (statements) return;

  statements = {
    allTasks: db.prepare(
      'SELECT id, title, assignee, priority, status FROM tasks ORDER BY id ASC'
    ),
    groupedTasks: db.prepare(
      'SELECT id, title, assignee, priority, status FROM tasks ' +
      'ORDER BY position ASC, id ASC'
    ),
    tasksByAssignee: db.prepare(
      'SELECT id, title, assignee, priority, status FROM tasks ' +
      'WHERE assignee = ? COLLATE NOCASE ORDER BY id ASC'
    ),
    taskById: db.prepare(
      'SELECT id, title, assignee, priority, status FROM tasks WHERE id = ?'
    ),
    insertTask: db.prepare(
      'INSERT INTO tasks (title, description, assignee, priority, status, position) ' +
      'VALUES (?, ?, ?, ?, ?, COALESCE((SELECT MAX(position) + 1 FROM tasks WHERE status = ?), 0)) ' +
      'RETURNING id, title, assignee, priority, status'
    ),
    taskForUpdate: db.prepare(
      'SELECT id, title, description, assignee, priority, status, position FROM tasks WHERE id = ?'
    ),
    compactColumn: db.prepare(
      'UPDATE tasks SET position = position - 1 WHERE status = ? AND position > ?'
    ),
    columnSize: db.prepare(
      'SELECT COUNT(*) AS count FROM tasks WHERE status = ?'
    ),
    openPosition: db.prepare(
      'UPDATE tasks SET position = position + 1 WHERE status = ? AND position >= ?'
    ),
    shiftEarlier: db.prepare(
      'UPDATE tasks SET position = position + 1 ' +
      'WHERE status = ? AND position >= ? AND position < ?'
    ),
    shiftLater: db.prepare(
      'UPDATE tasks SET position = position - 1 ' +
      'WHERE status = ? AND position > ? AND position <= ?'
    ),
    setStatusAndPosition: db.prepare(
      'UPDATE tasks SET status = ?, position = ? WHERE id = ?'
    ),
    setPosition: db.prepare(
      'UPDATE tasks SET position = ? WHERE id = ?'
    ),
    deleteTask: db.prepare(
      'DELETE FROM tasks WHERE id = ?'
    ),
    deleteCompleted: db.prepare(
      'DELETE FROM tasks WHERE status = ?'
    )
  };

  updateTaskTransaction = db.transaction((id, updates) => {
    const task = statements.taskForUpdate.get(id);
    if (!task) return null;

    const status = updates.status ?? task.status;
    if (status !== task.status) {
      statements.compactColumn.run(task.status, task.position);

      const columnSize = statements.columnSize.get(status).count;
      const position = updates.position === undefined
        ? columnSize
        : Math.min(updates.position, columnSize);

      statements.openPosition.run(status, position);
      statements.setStatusAndPosition.run(status, position, id);
    } else if (updates.position !== undefined && updates.position !== task.position) {
      const position = Math.min(updates.position, statements.columnSize.get(status).count - 1);
      if (position < task.position) {
        statements.shiftEarlier.run(status, position, task.position);
      } else {
        statements.shiftLater.run(status, task.position, position);
      }
      statements.setPosition.run(position, id);
    }

    const fields = ['title', 'description', 'assignee', 'priority']
      .filter(field => updates[field] !== undefined);
    if (fields.length) {
      const key = fields.join(',');
      let statement = updateStatements.get(key);
      if (!statement) {
        statement = db.prepare(
          `UPDATE tasks SET ${fields.map(field => `${field} = ?`).join(', ')} WHERE id = ?`
        );
        updateStatements.set(key, statement);
      }
      statement.run(...fields.map(field => updates[field]), id);
    }

    return statements.taskById.get(id) || null;
  });

  deleteTaskTransaction = db.transaction(id => {
    const task = statements.taskForUpdate.get(id);
    if (!task) return false;

    statements.deleteTask.run(id);
    statements.compactColumn.run(task.status, task.position);
    return true;
  });
}

async function getAllTasks(assignee) {
  prepareStatements();
  return assignee
    ? statements.tasksByAssignee.all(assignee)
    : statements.allTasks.all();
}

async function getAllTasksGrouped() {
  prepareStatements();
  const grouped = { todo: [], 'in-progress': [], done: [] };
  for (const task of statements.groupedTasks.all()) {
    grouped[task.status].push(task);
  }
  return grouped;
}

async function createTask({
  title,
  description = null,
  assignee = 'Unassigned',
  priority = 'medium',
  status = 'todo'
}) {
  ensure(typeof title === 'string' && title.trim(), 'Title is required');
  ensure(typeof assignee === 'string', 'Assignee must be a string');
  ensure(VALID_PRIORITIES.has(priority), 'Invalid priority');
  ensure(VALID_STATUSES.has(status), 'Invalid status');

  prepareStatements();
  const normalizedAssignee = assignee.trim() || 'Unassigned';
  return statements.insertTask.get(
    title.trim(),
    description ?? null,
    normalizedAssignee,
    priority,
    status,
    status
  );
}

async function updateTask(id, updates = {}) {
  const numericId = Number(id);
  ensure(Number.isInteger(numericId) && numericId > 0, 'Invalid task id');
  ensure(updates && typeof updates === 'object' && !Array.isArray(updates), 'Updates must be an object');
  ensure(updates.status === undefined || VALID_STATUSES.has(updates.status), 'Invalid status');
  ensure(updates.priority === undefined || VALID_PRIORITIES.has(updates.priority), 'Invalid priority');
  ensure(updates.position === undefined || (Number.isInteger(updates.position) && updates.position >= 0),
    'Position must be a non-negative integer');
  ensure(updates.title === undefined || (typeof updates.title === 'string' && updates.title.trim()),
    'Title must not be empty');
  ensure(updates.assignee === undefined ||
    (typeof updates.assignee === 'string' && updates.assignee.trim()), 'Assignee must not be empty');

  const normalizedUpdates = { ...updates };
  for (const field of ['title', 'assignee']) {
    if (normalizedUpdates[field] !== undefined) normalizedUpdates[field] = normalizedUpdates[field].trim();
  }

  prepareStatements();
  return updateTaskTransaction(numericId, normalizedUpdates);
}

async function deleteTask(id) {
  const numericId = Number(id);
  if (!Number.isInteger(numericId) || numericId < 1) return false;
  prepareStatements();
  return deleteTaskTransaction(numericId);
}

async function deleteCompletedTasks() {
  prepareStatements();
  return statements.deleteCompleted.run('done').changes;
}

module.exports = {
  getAllTasks,
  getAllTasksGrouped,
  createTask,
  updateTask,
  deleteTask,
  deleteCompletedTasks
};
