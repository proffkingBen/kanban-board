const express = require('express');
const fs = require('fs');
const path = require('path');
const app = express();
const PORT = process.env.PORT || 3000;
const DATA_FILE = path.join(__dirname, 'data.json');
const statuses = ['todo','in-progress','done'];
const priorities = ['low','medium','high'];
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

function readTasks() {
  try {
    return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
  } catch {
    return [];
  }
}

function writeTasks(tasks) {
  fs.mkdirSync(path.dirname(DATA_FILE), { recursive: true });
  fs.writeFileSync(DATA_FILE, JSON.stringify(tasks, null, 2));
}

app.get('/api/tasks', (req, res) => {
  let tasks = readTasks();
  const { assignee } = req.query;
  if (assignee) {
    tasks = tasks.filter(
      (t) => t.assignee.toLowerCase() === assignee.toLowerCase()
    );
  }
  res.json(tasks);
});

app.post('/api/tasks', (req, res) => {
  const { title, assignee, priority } = req.body;

  if (!title || !title.trim()) {
    return res.status(400).json({ error: 'Title is required' });
  }
  if (priority && !priorities.includes(priority)) {
    return res.status(400).json({ error: 'Invalid priority' });
  }

  const task = {
    id: Date.now(),
    title: title.trim(),
    assignee: (assignee || 'Unassigned').trim(),
    priority: priority || 'medium',
    status: 'todo',
  };

  const tasks = readTasks();
  tasks.push(task);
  writeTasks(tasks);
  res.status(201).json(task);
});

app.patch('/api/tasks/:id', (req, res) => {
  const { status, priority } = req.body;

  if (status && !statuses.includes(status)) {
    return res.status(400).json({ error: 'Invalid status' });
  }
  if (priority && !priorities.includes(priority)) {
    return res.status(400).json({ error: 'Invalid priority' });
  }

  const tasks = readTasks();
  const task = tasks.find((t) => t.id === Number(req.params.id));
  if (!task) return res.status(404).json({ error: 'Task not found' });

  if (status) task.status = status;
  if (priority) task.priority = priority;

  writeTasks(tasks);
  res.json(task);
});

app.delete('/api/tasks/completed', (req, res) => {
  const tasks = readTasks();
  const remaining = tasks.filter((t) => t.status !== 'done');
  writeTasks(remaining);
  res.json({ removed: tasks.length - remaining.length });
});

app.delete('/api/tasks/:id', (req, res) => {
  const tasks = readTasks().filter((t) => t.id !== Number(req.params.id));
  writeTasks(tasks);
  res.status(204).end();
});

app.listen(PORT, () => {
  console.log(`Task board running at http://localhost:${PORT}`);
});