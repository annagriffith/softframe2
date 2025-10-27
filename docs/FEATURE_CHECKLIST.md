# Feature checklist + behaviors (Angular + Node/Express + MongoDB + Socket.IO + WebRTC)

Use this as your demo/runbook to validate the app. Items map to what’s implemented in this repo.

---

## Roles & permissions

Roles in this app: `superAdmin`, `groupAdmin`, `user`.

- Server: All protected routes use JWT; additional role checks:
  - superAdmin → full power
  - groupAdmin → manage groups/channels/members in their groups
  - user → chat, view groups/channels they belong to
- Client: Angular AuthGuard + RoleGuard; controls hidden via *ngIf

Done when:
- Hitting admin/super endpoints as user returns 403
- Admin/Super pages are guarded and hidden from users

---

## Authentication

- Register + Login via REST, JWT stored client‑side
- Angular HTTP interceptor sets Authorization: Bearer <token>
- /api/auth/me returns current user
- Logout clears token and disconnects socket

Done when:
- No/invalid token → 401
- Refresh keeps session until token expires

---

## Groups & Channels (CRUD)

- Groups: GET /api/groups; POST /api/groups (superAdmin); DELETE /api/groups/:groupId (superAdmin)
- Channels: GET /api/channels?groupId=...; POST /api/channels (groupAdmin/superAdmin)
- Membership adjust with PATCH endpoints:
  - /api/groups/:groupId/members { add/remove }
  - /api/channels/:channelId/members { add/remove }

Mongo rules:

- users.username unique; channels unique per (groupId, name); messages indexed by (channelId, timestamp)

Done when:
- Members see only their groups/channels
- Duplicate channel name is rejected
- Deleting a group removes its channels

---

## Chat (real-time + history)

- REST: GET /api/messages?channelId=&page=&pageSize=50; POST /api/messages
- Socket: join/leave rooms per channel; message broadcast on REST save (message and message:new)

Done when:
- Two browsers in same channel see messages instantly without refresh

---

## Uploads (avatars + images)

- Avatar: POST /api/auth/avatar (multer single 'avatar')
- Chat image: POST /api/messages/image (multer single 'image')
- Served under /api/uploads/*

Done when:
- Avatars show on messages
- Image messages render thumbnails

---

## Presence & call banner

- presence join/leave when sockets join/leave channel
- call invite: socket emits call:notify & call:incoming to the channel room
- Chat shows a blue Join Call banner in the channel with an active call

Done when:
- Starting a call in A shows banner in B within a second

---

## Video calls (WebRTC signalling)

- Caller route to /call?channel=<id>&role=caller
- Caller creates offer → emits call:offer; callee answers; ICE relayed via call:ice
- When joining the room, caller re‑emits localDescription offer so late joiners receive it

Done when:
- Two browsers in same channel join a call and both cameras appear (local + remote)

---

## Testing (server)

- Mocha/Chai/Supertest: auth, uploads, socket message broadcast
- Socket test: join → REST post → expect message/new event

---

## Run notes (Windows)

- Backend: cd server; npm run dev:mongo (real Mongo) or npm run dev (Tiny DB)
- Frontend: npm install; npm run start
- Health: http://127.0.0.1:3001/api/health → { ok: true }
- Proxy: Angular dev-server proxies /api and /socket.io to http://localhost:3001
