# Team Task Board

A mini Kanban board built with **Node.js, Express, HTML, CSS and JavaScript**. Add tasks, assign them to a person, set a priority, move them across three columns (To Do, In Progress, Done) and clear finished work. Tasks are stored in a JSON file, so there is no database to set up.

This project is also our practice ground for **teamwork with Git**: every person owns one part, works on their own branch, and merges through Pull Requests.

---

## 1. Getting started

### Prerequisites

- [Node.js](https://nodejs.org) (LTS version). Check with `node -v`
- [Git](https://git-scm.com). Check with `git version`
- A code editor such as VS Code

### Setup

```powershell
git clone <repo-url>
cd <repo-folder>
npm install
npm start
```

Open **http://localhost:3000** in your browser.

> `node_modules/` is not stored in the repo, so everyone must run `npm install` after cloning.

> Keep the repo **outside OneDrive** if you can (for example `C:\dev\`). OneDrive syncing can corrupt the `.git` folder.

---

## 2. Project structure

```
.
├── server.js          Express server and API (backend)
├── package.json       Project info and the npm start script
├── .gitignore         Files Git must not track
├── README.md          This file
├── data.json          JSON task storage used by server.js
├── db/                Optional, standalone SQLite data-access module
└── public/
    ├── index.html     Page structure (markup)
    ├── style.css      Look and layout (styling)
    └── app.js         Browser logic that talks to the API (frontend)
```

---

## 3. How it works

```
Browser (index.html + style.css + app.js)
        |  fetch() requests
        v
Express server (server.js)  <-->  data.json
```

The browser loads the page from the `public` folder. `app.js` calls the API with `fetch`, and `server.js` reads and writes `data.json`.

The `db/` directory is a separate, optional SQLite layer. It is not currently connected to `server.js`; the app continues to use its JSON-file storage unless the backend is explicitly wired to the database module. The module uses `better-sqlite3` and creates `data/tasks.db` when its connection is opened.

Its CommonJS entry points can be used from backend code:

```js
const { initDB } = require('./db/init');
const tasks = require('./db/taskModel');

await initDB();
const taskList = await tasks.getAllTasks('Dan');
```

`initDB()` creates the `tasks` table if needed. The task model exposes grouped listing, create, update/reorder, single-task deletion, and deletion of completed tasks. Keeping this layer separate from Express makes its schema and data-access logic independently reusable and testable.

A task looks like this:

```json
{
  "id": 1732180000000,
  "title": "Write API",
  "assignee": "Dan",
  "priority": "high",
  "status": "todo"
}
```

- `status` is one of: `todo`, `in-progress`, `done`
- `priority` is one of: `low`, `medium`, `high`
- New tasks default to `Unassigned` and `medium` priority.

---

## 4. API reference

| Method | URL | Purpose | Body (JSON) |
|--------|-----|---------|-------------|
| GET | `/api/tasks` | List all tasks | none |
| GET | `/api/tasks?assignee=Dan` | List one person's tasks | none |
| POST | `/api/tasks` | Create a task | `title` (required), `assignee`, `priority` |
| PATCH | `/api/tasks/:id` | Change status or priority | `status` and/or `priority` |
| DELETE | `/api/tasks/completed` | Remove all tasks in Done; returns `{ "removed": count }` | none |
| DELETE | `/api/tasks/:id` | Remove one task | none |

Common responses: `200` OK (including clear-completed), `201` created, `204` deleted, `400` bad input, `404` task not found.

Quick test from PowerShell:

```powershell
Invoke-RestMethod -Uri http://localhost:3000/api/tasks -Method Post -ContentType "application/json" -Body '{"title":"Test task","assignee":"Dan","priority":"high"}'
Invoke-RestMethod http://localhost:3000/api/tasks
```

---

## 5. Team roles and branches

| Role | Owns | Branch |
|------|------|--------|
| Backend | `server.js` | `feature/api` |
| Markup | `public/index.html` | `feature/html` |
| Styling | `public/style.css` | `feature/css` |
| Frontend logic | `public/app.js` | `feature/js` |

Ideas for each role:

- **Backend:** priority field, assignee filter, clear completed tasks (done)
- **HTML:** priority dropdown in the form, a "Clear done" button, a footer
- **CSS:** dark mode, colored priority badges, mobile layout
- **JS:** send `priority` when adding a task, task counts per column, filter by assignee, call the clear-completed endpoint

---

## 6. Git workflow (follow this order)

**Rule number one: create your branch BEFORE you start editing, and never commit directly to `main`.**

```powershell
# 1. Get the latest main
git switch main
git pull

# 2. Create your branch and check you are on it
git switch -c feature/yourrole
git branch                      # the one with * is where you are

# 3. Do your work, then save it in small commits
git status
git add .
git commit -m "Describe what you did"

# 4. Catch up with main, then push your branch
git pull origin main
git push -u origin feature/yourrole
```

5. On GitHub, click **Compare & pull request**.
6. A teammate reviews it, then click **Merge**.
7. Everyone updates their copy:

```powershell
git switch main
git pull
```

### If you get a merge conflict

Open the file and look for these markers:

```
<<<<<<< HEAD
your version
=======
their version
>>>>>>> branch-name
```

Keep the correct code, delete the marker lines, then:

```powershell
git add <file>
git commit
```

### Command cheat sheet

| Command | What it does |
|---------|--------------|
| `git status` | Shows what changed and what is staged |
| `git add .` | Stages all changes |
| `git commit -m "msg"` | Saves a snapshot with a message |
| `git log --oneline --graph --all` | Shows history as a graph |
| `git switch <branch>` | Moves to a branch |
| `git switch -c <branch>` | Creates a branch and moves to it |
| `git fetch` | Downloads remote changes without merging |
| `git pull` | Fetches and merges remote changes |
| `git push` | Uploads your commits |
| `git stash` / `git stash pop` | Shelves and restores unfinished work |
| `git restore <file>` | Discards edits to a file |
| `git revert <commit>` | Safely undoes a pushed commit |

---

## 7. Team rules

1. Never push directly to `main`. Use branches and Pull Requests.
2. Only edit the file you own. If you need a change in someone else's file, ask them.
3. Commit small and often, with clear messages ("Add priority dropdown", not "stuff").
4. Run `git pull origin main` before you push.
5. Never commit passwords, API keys or `.env` files.
6. Run `git branch` before you type any code, to confirm you are on your own branch.
7. Talk before you change shared things like field names (`priority`, `assignee`, `status`).

---

## 8. Troubleshooting

| Problem | Fix |
|---------|-----|
| `fatal: not a git repository` | You are in the wrong folder. `cd` into the repo first |
| `Cannot find module 'express'` | Run `npm install` |
| `EADDRINUSE: port 3000 already in use` | Another server is running. Close it, or run `$env:PORT=3001; npm start` |
| Push rejected | Run `git pull origin main`, resolve conflicts, push again |
| Page loads but no tasks appear | Check the server terminal for errors and open `/api/tasks` in the browser |
| Changes to `server.js` not showing | Stop the server (Ctrl+C) and run `npm start` again |

---

## 9. Stretch goals

- Replace the JSON file with SQLite or MySQL
- Add user login
- Add drag and drop between columns
- Deploy it free on Render or Railway
- Add edit-task-title support

Happy coding!
