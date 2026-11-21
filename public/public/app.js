const taskColumns = [
  { status: 'todo', elementId: 'todo-tasks' },
  { status: 'in-progress', elementId: 'doing-tasks' },
  { status: 'done', elementId: 'done-tasks' },
];

function createTaskCard(task) {
  const card = document.createElement('article');
  card.className = 'task-card';
  card.draggable = true;
  card.dataset.taskId = task.id;
  card.dataset.status = task.status;

  let dragPreview;
  card.addEventListener('dragstart', event => {
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
    card.classList.remove('is-dragging');
    dragPreview?.remove();
  });

  const title = document.createElement('h3');
  title.textContent = task.title;

  const assignee = document.createElement('p');
  assignee.textContent = `Assignee: ${task.assignee}`;

  const priority = document.createElement('span');
  priority.className = `priority-${task.priority}`;
  priority.textContent = task.priority;

  card.append(title, assignee, priority);
  return card;
}

async function loadTasks() {
  const response = await fetch('/api/tasks/grouped');
  if (!response.ok) {
    throw new Error(`Request failed with status ${response.status}`);
  }

  const tasksByStatus = await response.json();
  document.getElementById('task-load-error')?.remove();
  for (const column of taskColumns) {
    const taskList = document.getElementById(column.elementId);
    taskList.replaceChildren(...tasksByStatus[column.status].map(createTaskCard));
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

function showMoveError(error) {
  let message = document.getElementById('task-move-error');
  if (!message) {
    message = document.createElement('p');
    message.id = 'task-move-error';
    message.setAttribute('role', 'alert');
    document.querySelector('[aria-label="Task Columns"]').insertAdjacentElement('beforebegin', message);
  }

  message.textContent = `Unable to move task: ${error.message}`;
}

function showClearError(error) {
  let message = document.getElementById('task-clear-error');
  if (!message) {
    message = document.createElement('p');
    message.id = 'task-clear-error';
    message.setAttribute('role', 'alert');
    document.querySelector('[aria-label="Board Actions"]').insertAdjacentElement('afterend', message);
  }

  message.textContent = `Unable to clear completed tasks: ${error.message}`;
}

const taskForm = document.getElementById('task-form');
taskForm.addEventListener('submit', async event => {
  event.preventDefault();
  const submitButton = taskForm.querySelector('button[type="submit"]');
  submitButton.disabled = true;

  try {
    const formData = new FormData(taskForm);
    const response = await fetch('/api/tasks', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: formData.get('title'),
        assignee: formData.get('assignee'),
        priority: formData.get('priority'),
      }),
    });
    const task = await response.json();
    if (!response.ok) {
      throw new Error(task.error || `Request failed with status ${response.status}`);
    }

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
  clearDoneButton.disabled = true;
  let cleared = false;
  try {
    const response = await fetch('/api/tasks/completed', { method: 'DELETE' });
    if (!response.ok) {
      throw new Error(`Request failed with status ${response.status}`);
    }

    await response.json();
    document.getElementById('task-clear-error')?.remove();
    cleared = true;
  } catch (error) {
    showClearError(error);
  } finally {
    clearDoneButton.disabled = false;
  }

  if (cleared) {
    loadTasks().catch(showLoadError);
  }
});

const movingTaskIds = new Set();
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
      const response = await fetch(`/api/tasks/${encodeURIComponent(taskId)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status, position: taskList.children.length }),
      });
      const task = await response.json();
      if (!response.ok) {
        throw new Error(task.error || `Request failed with status ${response.status}`);
      }

      document.getElementById('task-move-error')?.remove();
      try {
        await loadTasks();
      } catch (error) {
        showLoadError(error);
      }
    } catch (error) {
      showMoveError(error);
    } finally {
      movingTaskIds.delete(taskId);
    }
  });
}

loadTasks().catch(showLoadError);
