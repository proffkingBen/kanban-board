const express = require('express');
const path = require('path');
const { initDB } = require('./db/init');
const taskModel = require('./db/taskModel');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

app.get('/api/tasks', async (req, res) => {
  const tasks = await taskModel.getAllTasks(req.query.assignee);
  res.json(tasks);
});

app.get('/api/tasks/grouped', async (req, res) => {
  res.json(await taskModel.getAllTasksGrouped());
});

app.post('/api/tasks', async (req, res) => {
  try {
    const { title, description, assignee, priority, status } = req.body ?? {};
    const task = await taskModel.createTask({ title, description, assignee, priority, status });
    res.status(201).json(task);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.patch('/api/tasks/:id', async (req, res) => {
  try {
    const { title, description, assignee, priority, status, position } = req.body ?? {};
    const task = await taskModel.updateTask(req.params.id, {
      title, description, assignee, priority, status, position,
    });
    if (!task) return res.status(404).json({ error: 'Task not found' });
    res.json(task);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.delete('/api/tasks/completed', async (req, res) => {
  const removed = await taskModel.deleteCompletedTasks();
  res.json({ removed });
});

app.delete('/api/tasks/:id', async (req, res) => {
  const deleted = await taskModel.deleteTask(req.params.id);
  if (!deleted) return res.status(404).json({ error: 'Task not found' });
  res.status(204).end();
});

async function start() {
  try {
    await initDB();
    app.listen(PORT, () => {
      console.log(`Task board running at http://localhost:${PORT}`);
    });
  } catch (err) {
    console.error('Failed to start:', err.message);
    process.exit(1);
  }
}

start();