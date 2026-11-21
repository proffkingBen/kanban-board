const STATUSES = ['todo', 'in-progress', 'done'];

// Which list in index.html holds each status
const LIST_IDS = {
  'todo': 'todo-tasks',
  'in-progress': 'doing-tasks',
  'done': 'done-tasks',
};

// Optional filter box (null if the HTML doesn't have one yet)
const filterInput = document.getElementById('filter-assignee');

async function api(url, options = {}) {
  const res = await fetch(url, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  if (res.status === 204) return null;
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Request failed');
  return data;
}

function showError(err) {
  alert(err.message);
}

async function loadTasks() {
  try {
    const filter = filterInput ? filterInput.value.trim() : '';
    const url = filter
      ? `/api/tasks?assignee=${encodeURIComponent(filter)}`
      : '/api/tasks';
    render(await api(url));
  } catch (err) {
    console.error(err);
  }
}

function render(tasks) {
  STATUSES.forEach((status) => {
    const list = document.getElementById(LIST_IDS[status]);
    const inColumn = tasks.filter((t) => t.status === status);

    list.innerHTML = '';
    inColumn.forEach((task) => list.appendChild(createCard(task)));
    updateCount(list, inColumn.length);
  });
}

function createCard(task) {
  const card = document.createElement('div');
  card.className = 'task-card';

  const title = document.createElement('strong');
  title.className = 'task-title';
  title.textContent = task.title;

  const badge = document.createElement('span');
  badge.className = `priority-${task.priority}`;
  badge.textContent = task.priority;

  const assignee = document.createElement('p');
  assignee.className = 'task-assignee';
  assignee.textContent = `Assigned to: ${task.assignee}`;

  const actions = document.createElement('div');
  actions.className = 'task-actions';

  const i = STATUSES.indexOf(task.status);
  if (i > 0) {
    actions.appendChild(makeButton('←', () => moveTask(task.id, STATUSES[i - 1])));
  }
  if (i < STATUSES.length - 1) {
    actions.appendChild(makeButton('→', () => moveTask(task.id, STATUSES[i + 1])));
  }
  actions.appendChild(makeButton('Delete', () => deleteTask(task.id)));

  card.append(title, ' ', badge, assignee, actions);
  return card;
}

function makeButton(label, onClick) {
  const button = document.createElement('button');
  button.type = 'button';
  button.textContent = label;
  button.addEventListener('click', onClick);
  return button;
}

function updateCount(list, count) {
  const heading = list.closest('.column').querySelector('h2');
  let counter = heading.querySelector('.count');
  if (!counter) {
    counter = document.createElement('span');
    counter.className = 'count';
    heading.append(' ', counter);
  }
  counter.textContent = `(${count})`;
}

async function moveTask(id, status) {
  try {
    await api(`/api/tasks/${id}`, {
      method: 'PATCH',
      body: JSON.stringify({ status }),
    });
    loadTasks();
  } catch (err) {
    showError(err);
  }
}

async function deleteTask(id) {
  try {
    await api(`/api/tasks/${id}`, { method: 'DELETE' });
    loadTasks();
  } catch (err) {
    showError(err);
  }
}

async function clearDone() {
  if (!confirm('Remove all finished tasks?')) return;
  try {
    await api('/api/tasks/completed', { method: 'DELETE' });
    loadTasks();
  } catch (err) {
    showError(err);
  }
}

const form = document.getElementById('task-form');

form.addEventListener('submit', async (e) => {
  e.preventDefault();

  const task = {
    title: document.getElementById('task-title').value,
    assignee: document.getElementById('task-assignee').value,
    priority: document.getElementById('task-priority').value,
  };

  try {
    await api('/api/tasks', { method: 'POST', body: JSON.stringify(task) });
    form.reset();
    loadTasks();
  } catch (err) {
    showError(err);
  }
});
document.getElementById('clear-done-btn').addEventListener('click', clearDone);

if (filterInput) {
  filterInput.addEventListener('input', loadTasks);
}

loadTasks();
setInterval(loadTasks, 5000);