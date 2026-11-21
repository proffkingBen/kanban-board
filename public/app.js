const taskColumns = [
  { status: 'todo', elementId: 'todo-tasks', label: 'To Do' },
  { status: 'in-progress', elementId: 'doing-tasks', label: 'In Progress' },
  { status: 'done', elementId: 'done-tasks', label: 'Done' },
];

const filterInput = document.getElementById('filter-assignee');
const movingTaskIds = new Set();
let isDraggingTask = false;

async function api(url, options = {}) {
  const response = await fetch(url, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  const data = response.status === 204 ? null : await response.json();
  if (!response.ok) {
    throw new Error(data?.error || `Request failed with status ${response.status}`);
  }
  return data;
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

function makeButton(label, ariaLabel, onClick) {
  const button = document.createElement('button');
  button.type = 'button';
  button.textContent = label;
  button.setAttribute('aria-label', ariaLabel);
  button.addEventListener('click', onClick);
  return button;
}

function createTaskCard(task) {
  const card = document.createElement('article');
  card.className = 'task-card';
  card.draggable = true;
  card.dataset.taskId = task.id;
  card.dataset.status = task.status;

  let dragPreview;
  card.addEventListener('dragstart', event => {
    isDraggingTask = true;
    event.dataTransfer.setData('text/plain', String(task.id));
    event.dataTransfer.effectAllowed = 'move';
    card.classList.add('is-dragging');

    dragPreview = card.cloneNode(true);
    dragPreview.classList.remove('is-dragging');
    dragPreview.classList.add('task-drag-preview');
    dragPreview.removeAttribute('data-task-id');
    dragPreview.removeAttribute('data-status');
    dragPreview.draggable = false;
    dragPreview.setAttribute('aria-hidden', 'true');
    const bounds = card.getBoundingClientRect();
    dragPreview.style.position = 'fixed';
    dragPreview.style.top = '-10000px';
    dragPreview.style.left = '-10000px';
    dragPreview.style.width = `${bounds.width}px`;
    document.body.append(dragPreview);
    event.dataTransfer.setDragImage(
      dragPreview,
      Math.max(0, Math.min(bounds.width, event.clientX - bounds.left)),
      Math.max(0, Math.min(bounds.height, event.clientY - bounds.top))
    );
  });

  card.addEventListener('dragend', () => {
    isDraggingTask = false;
    card.classList.remove('is-dragging');
    dragPreview?.remove();
  });

  const title = document.createElement('h3');
  title.className = 'task-title';
  title.textContent = task.title;

  const assignee = document.createElement('p');
  assignee.className = 'task-assignee';
  assignee.textContent = `Assigned to: ${task.assignee}`;

  const priority = document.createElement('span');
  priority.className = `priority-${task.priority}`;
  priority.textContent = task.priority;

  const actions = document.createElement('div');
  actions.className = 'task-actions';
  const columnIndex = taskColumns.findIndex(column => column.status === task.status);
  if (columnIndex > 0) {
    const previousColumn = taskColumns[columnIndex - 1];
    actions.appendChild(makeButton(
      '←',
      `Move to ${previousColumn.label}`,
      () => moveTask(task.id, previousColumn.status)
    ));
  }
  if (columnIndex < taskColumns.length - 1) {
    const nextColumn = taskColumns[columnIndex + 1];
    actions.appendChild(makeButton(
      '→',
      `Move to ${nextColumn.label}`,
      () => moveTask(task.id, nextColumn.status)
    ));
  }
  actions.appendChild(makeButton('Delete', `Delete ${task.title}`, () => deleteTask(task.id)));

  card.append(title, assignee, priority, actions);
  return card;
}

async function loadTasks() {
  let tasksByStatus;
  const filter = filterInput?.value.trim();
  if (filter) {
    const tasks = await api(`/api/tasks?assignee=${encodeURIComponent(filter)}`);
    tasksByStatus = Object.fromEntries(taskColumns.map(column => [column.status, []]));
    for (const task of tasks) {
      if (!tasksByStatus[task.status]) {
        throw new Error(`Unexpected task status: ${task.status}`);
      }
      tasksByStatus[task.status].push(task);
    }
  } else {
    tasksByStatus = await api('/api/tasks/grouped');
  }

  document.getElementById('task-load-error')?.remove();
  for (const column of taskColumns) {
    const taskList = document.getElementById(column.elementId);
    const tasks = tasksByStatus[column.status];
    taskList.replaceChildren(...tasks.map(createTaskCard));
    updateCount(taskList, tasks.length);
  }
}

function showFormError(error) {
  let message = document.getElementById('task-form-error');
  if (!message) {
    message = document.createElement('p');
    message.id = 'task-form-error';
    message.setAttribute('role', 'alert');
    document.getElementById('task-form').insertAdjacentElement('afterend', message);
  }

  message.textContent = `Unable to add task: ${error.message}`;
}

function showLoadError(error) {
  let message = document.getElementById('task-load-error');
  if (!message) {
    message = document.createElement('p');
    message.id = 'task-load-error';
    message.setAttribute('role', 'alert');
    document.querySelector('main').prepend(message);
  }

  message.textContent = `Unable to load tasks: ${error.message}`;
}

function showActionError(error, action) {
  let message = document.getElementById('task-action-error');
  if (!message) {
    message = document.createElement('p');
    message.id = 'task-action-error';
    message.setAttribute('role', 'alert');
    document.querySelector('[aria-label="Board Actions"]').insertAdjacentElement('afterend', message);
  }

  message.textContent = `Unable to ${action}: ${error.message}`;
}

async function moveTask(id, status) {
  try {
    await api(`/api/tasks/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      body: JSON.stringify({ status }),
    });
    document.getElementById('task-action-error')?.remove();
  } catch (error) {
    showActionError(error, 'move task');
    return;
  }

  loadTasks().catch(showLoadError);
}

async function deleteTask(id) {
  try {
    await api(`/api/tasks/${encodeURIComponent(id)}`, { method: 'DELETE' });
    document.getElementById('task-action-error')?.remove();
  } catch (error) {
    showActionError(error, 'delete task');
    return;
  }

  loadTasks().catch(showLoadError);
}

const taskForm = document.getElementById('task-form');
taskForm.addEventListener('submit', async event => {
  event.preventDefault();
  const submitButton = taskForm.querySelector('button[type="submit"]');
  submitButton.disabled = true;

  try {
    const formData = new FormData(taskForm);
    await api('/api/tasks', {
      method: 'POST',
      body: JSON.stringify({
        title: formData.get('title'),
        assignee: formData.get('assignee'),
        priority: formData.get('priority'),
      }),
    });
    taskForm.reset();
    document.getElementById('task-form-error')?.remove();
    loadTasks().catch(showLoadError);
  } catch (error) {
    showFormError(error);
  } finally {
    submitButton.disabled = false;
  }
});

const clearDoneButton = document.getElementById('clear-done-btn');
clearDoneButton.addEventListener('click', async () => {
  if (!window.confirm('Remove all finished tasks?')) return;

  clearDoneButton.disabled = true;
  let cleared = false;
  try {
    await api('/api/tasks/completed', { method: 'DELETE' });
    document.getElementById('task-action-error')?.remove();
    cleared = true;
  } catch (error) {
    showActionError(error, 'clear completed tasks');
  } finally {
    clearDoneButton.disabled = false;
  }

  if (cleared) {
    loadTasks().catch(showLoadError);
  }
});

for (const column of document.querySelectorAll('.column')) {
  column.addEventListener('dragover', event => {
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
    column.classList.add('drag-over');
  });

  column.addEventListener('dragleave', event => {
    if (!column.contains(event.relatedTarget)) {
      column.classList.remove('drag-over');
    }
  });

  column.addEventListener('drop', async event => {
    event.preventDefault();
    column.classList.remove('drag-over');

    const taskId = event.dataTransfer.getData('text/plain');
    const taskCard = [...document.querySelectorAll('.task-card')]
      .find(card => card.dataset.taskId === taskId);
    const status = column.dataset.status;
    const taskList = column.querySelector('.task-list');
    if (!taskId || !taskCard || taskCard.dataset.status === status || movingTaskIds.has(taskId)) {
      return;
    }

    movingTaskIds.add(taskId);
    try {
      await api(`/api/tasks/${encodeURIComponent(taskId)}`, {
        method: 'PATCH',
        body: JSON.stringify({ status, position: taskList.children.length }),
      });
      document.getElementById('task-action-error')?.remove();
      try {
        await loadTasks();
      } catch (error) {
        showLoadError(error);
      }
    } catch (error) {
      showActionError(error, 'move task');
    } finally {
      movingTaskIds.delete(taskId);
    }
  });
}

if (filterInput) {
  filterInput.addEventListener('input', () => loadTasks().catch(showLoadError));
}

loadTasks().catch(showLoadError);
setInterval(() => {
  if (!isDraggingTask && movingTaskIds.size === 0) {
    loadTasks().catch(showLoadError);
  }
}, 5000);
