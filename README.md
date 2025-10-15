
# Softframe2 • Angular + Node Chat

Role-based chat application built with Angular (standalone components) and Node.js/Express with MongoDB and Socket.IO. Includes Super Admin, Group Admin, and User roles; group/channel management; per-channel messaging; avatar upload; and a pink theme.

---

## Features

- Role-based login: Super Admin, Group Admin, User
- Admin dashboards: Super Admin (manage users), Group Admin (manage groups/channels)
- Chat per channel with Socket.IO
- Avatar uploads served from the backend (`/api/uploads`)
- Guards: AuthGuard and RoleGuard
- Angular v20 standalone components
- Clean API and code comments

---

## Project structure

```text
softframe2/
├─ src/                    # Angular app (frontend)
│  └─ app/app/             # Components (admin, group-admin, chat, login, etc.)
├─ server/                 # Node.js/Express backend
│  ├─ server.js            # Main backend server
│  ├─ db.js                # Mongo connection + fallbacks
│  ├─ data.json            # Seed data (users, groups, channels)
│  └─ uploads/             # Uploaded avatars/images
├─ proxy.conf.json         # Angular dev-server proxy to backend (incl. websockets)
├─ package.json            # Frontend scripts/deps
└─ README.md
```

---

## Prerequisites

- Node.js 18+ and npm
- Angular CLI 20+ (optional for local dev: `npm start` uses it)
- MongoDB 6+ (local) or MongoDB Atlas

---

## Setup

1. Install dependencies

```powershell
# From repo root
npm install

# Backend deps (in server/)
cd server
# If you are using a real MongoDB and want to avoid a large postinstall download:
$env:MONGOMS_DISABLE_POSTINSTALL='1'
npm install --no-audit --no-fund
```

1. Configure backend environment

Create `server/.env` (see `.env.example`):

```env
PORT=3001
MONGO_URL=mongodb://127.0.0.1:27017
DB_NAME=frametry
JWT_SECRET=change-me
```

Notes:

- Use `127.0.0.1` instead of `localhost` to avoid Windows name resolution issues.
- On first successful connect to an empty MongoDB, the backend seeds from `server/data.json` (passwords are hashed on seed).

---

## Run

Backend (in `server/`):

```powershell
cd server
node server.js
# Logs expected:
# Connecting to MongoDB at ...
# MongoDB connected
# Server running on port 3001
```

Frontend (in repo root):

```powershell
cd ..

# Serves at http://localhost:4200
```

Proxy & websockets:

- `proxy.conf.json` forwards `/api` and `/socket.io` to `http://localhost:3001`.
- Socket client connects at `/` with `auth: { token }`.

Health check:

- <http://127.0.0.1:3001/api/health> → `{ "ok": true }`

---

## Test accounts (seeded)

- Super Admin — `super / 123`
- Group Admin — `group / 123`
- User — `user / 123`

---

## REST API (high level)

Auth

- POST `/api/auth/register` — create user, returns token
- POST `/api/auth/login` — returns token and user
- GET `/api/auth/me` — current user (requires Bearer token)
- POST `/api/auth/avatar` — upload avatar (multipart/form-data, `avatar` field)

Users (super admin only)

- GET `/api/users` — list users (no passwords)
- POST `/api/users` — body: `{ username, email, role='user', password='123' }`
- PUT `/api/users/:username` — change role
- DELETE `/api/users/:username`

Groups & Channels

- GET `/api/groups`
- POST `/api/groups` (super admin)
- DELETE `/api/groups/:groupId` (super admin)
- GET `/api/channels?groupId=...`
- POST `/api/channels` (group/super admin)

Messages

- GET `/api/messages?channelId=...&page=1&pageSize=50`
- POST `/api/messages` (JWT) — `{ channelId, text, type='text' }`
- POST `/api/messages/image` (JWT, multipart/form-data `image`)

Socket.IO

- Connect with `io('/', { auth: { token } })`
- Rooms per channel; events: `join`, `leave`, `message`, `history`, `presence`

---

## Troubleshooting (Windows/PowerShell)

- Run backend from the `server/` folder. Running `node server.js` at repo root will fail.
- Use `127.0.0.1` rather than `localhost` for quick health checks.
- PowerShell aliases `curl` to Invoke-WebRequest; use `curl.exe` if needed.
- If `npm install` in `server/` begins downloading ~500MB for `mongodb-memory-server` but you use a real Mongo, set:
  - `$env:MONGOMS_DISABLE_POSTINSTALL='1'`
  - then `npm install --no-audit --no-fund`
- Confirm Mongo is listening: `Test-NetConnection 127.0.0.1 -Port 27017`
- Backend port check: `Test-NetConnection 127.0.0.1 -Port 3001`

---

## License

MIT

---

## Author

Anna Griffith

---

## Support

- Open issues on the repository with steps and logs

## REST API (Phase 1)
