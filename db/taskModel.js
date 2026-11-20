const db = require('./connection');

const VALID_STATUSES = new Set(['todo', 'doing', 'done']);

const statements = {
  allTasks: db.prepare(
    'SELECT id, title, description, status, position, created_at FROM tasks ' +
    'ORDER BY position ASC, created_at DESC'
  ),
  taskById: db.prepare(
    'SELECT id, title, description, status, position, created_at FROM tasks WHERE id = ?'
  ),
  insertTask: db.prepare(
    'INSERT INTO tasks (title, description, status, position) ' +
    'VALUES (?, ?, ?, COALESCE((SELECT MAX(position) + 1 FROM tasks WHERE status = ?), 0)) ' +
    'RETURNING id, title, description, status, position, created_at'
  ),
  taskForUpdate: db.prepare(
    'SELECT id, title, description, status, position FROM tasks WHERE id = ?'
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
  updateTitle: db.prepare(
    'UPDATE tasks SET title = ? WHERE id = ?'
  ),
  updateDescription: db.prepare(
    'UPDATE tasks SET description = ? WHERE id = ?'
  ),
  updateTitleAndDescription: db.prepare(
    'UPDATE tasks SET title = ?, description = ? WHERE id = ?'
  ),
  deleteTask: db.prepare(
    'DELETE FROM tasks WHERE id = ?'
  ),
  deleteCompleted: db.prepare(
    'DELETE FROM tasks WHERE status = ?'
  )
};

const updateTaskTransaction = db.transaction((id, updates) => {
  const task = statements.taskForUpdate.get(id);
  if (!task) return null;

  const status = updates.status ?? task.status;
  const movingColumn = status !== task.status;

  if (movingColumn) {
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

  const hasTitle = updates.title !== undefined;
  const hasDescription = updates.description !== undefined;
  if (hasTitle && hasDescription) {
    statements.updateTitleAndDescription.run(updates.title.trim(), updates.description ?? null, id);
  } else if (hasTitle) {
    statements.updateTitle.run(updates.title.trim(), id);
  } else if (hasDescription) {
    statements.updateDescription.run(updates.description ?? null, id);
  }

  return statements.taskById.get(id) || null;
});

const deleteTaskTransaction = db.transaction(id => {
  const task = statements.taskForUpdate.get(id);
  if (!task) return false;

  statements.deleteTask.run(id);
  statements.compactColumn.run(task.status, task.position);
  return true;
});

async function getAllTasksGrouped() {
  const grouped = { todo: [], doing: [], done: [] };
  for (const task of statements.allTasks.all()) {
    grouped[task.status].push(task);
  }
  return grouped;
}

async function createTask({ title, description = null, status = 'todo' }) {
  if (typeof title !== 'string' || !title.trim()) {
    throw new Error('Title is required');
  }
  if (!VALID_STATUSES.has(status)) {
    throw new Error('Status must be one of: todo, doing, done');
  }

  return statements.insertTask.get(
    title.trim(),
    description ?? null,
    status,
    status
  );
}

async function updateTask(id, updates = {}) {
  const numericId = Number(id);
  if (!Number.isInteger(numericId)) {
    throw new Error('Invalid task id');
  }
  if (updates.status !== undefined && !VALID_STATUSES.has(updates.status)) {
    throw new Error('Status must be one of: todo, doing, done');
  }
  if (updates.position !== undefined && (!Number.isInteger(updates.position) || updates.position < 0)) {
    throw new Error('Position must be a non-negative integer');
  }
  if (updates.title !== undefined && (typeof updates.title !== 'string' || !updates.title.trim())) {
    throw new Error('Title must not be empty');
  }

  return updateTaskTransaction(numericId, updates);
}

async function deleteTask(id) {
  const numericId = Number(id);
  return Number.isInteger(numericId) && deleteTaskTransaction(numericId);
}

async function deleteCompletedTasks() {
  return statements.deleteCompleted.run('done').changes;
}

module.exports = {
  getAllTasksGrouped,
  createTask,
  updateTask,
  deleteTask,
  deleteCompletedTasks
};
