// Self-contained call invite tests that spin up the server in-process on a test port
// Runs two checks:
// 1) POST /api/calls broadcasts a call:invite to a joined socket (REST path)
// 2) Emitting call:invite over socket triggers call:incoming/notify on another socket (socket path)
// Exits with code 0 on success; 1 on failure.

const http = require('http');
const { io: ioClient } = require('socket.io-client');
const supertest = require('supertest');

async function wait(ms) { return new Promise(r => setTimeout(r, ms)); }

(async () => {
  // Isolate from any external server: run our server in-process on a test port
  const TEST_PORT = 3999;
  process.env.NODE_ENV = 'test';
  process.env.USE_TINY_DB = 'true';
  process.env.PORT = String(TEST_PORT);
  process.env.JWT_SECRET = process.env.JWT_SECRET || 'devsecret';

  const srv = require('./server.js');
  // In test mode, server.js does not auto-listen. Start it explicitly.
  try {
    await new Promise((resolve) => {
      srv.server.listen(TEST_PORT, () => resolve());
    });
  } catch (e) {
    // If already listening, continue
  }

  const BASE = `http://127.0.0.1:${TEST_PORT}`;
  const request = supertest(srv.app);

  // Wait for health
  await new Promise((resolve, reject) => {
    const deadline = Date.now() + 5000;
    const tick = () => {
      const req = http.get(BASE + '/api/health', res => {
        if (res.statusCode === 200) { res.resume(); resolve(); }
        else { res.resume(); Date.now() < deadline ? setTimeout(tick, 150) : reject(new Error('health timeout')); }
      });
      req.on('error', () => (Date.now() < deadline ? setTimeout(tick, 150) : reject(new Error('health error'))));
    };
    tick();
  });

  try {
    // Create two users and login
    await request.post('/api/auth/register').send({ username: 'callA', password: 'p' }).catch(()=>{});
    const aTok = (await request.post('/api/auth/login').send({ username: 'callA', password: 'p' })).body.token;

    await request.post('/api/auth/register').send({ username: 'callB', password: 'p' }).catch(()=>{});
    const bTok = (await request.post('/api/auth/login').send({ username: 'callB', password: 'p' })).body.token;

    const channelId = 'c1';

    // Socket B joins channel
    const sockB = ioClient(BASE, { auth: { token: bTok }, transports: ['websocket'] });
    await new Promise((res, rej) => {
      let ok = false;
      sockB.on('connect', () => sockB.emit('join', { channelId }, () => { ok = true; res(); }));
      sockB.on('connect_error', rej);
      sockB.once('history', () => { ok = true; res(); });
      setTimeout(() => ok ? res() : rej(new Error('B join timeout')), 8000);
    });

    // 1) REST /api/calls should emit call:invite to B
    const gotInviteREST = new Promise((resolve, reject) => {
      const t = setTimeout(() => reject(new Error('REST: no call:invite received')), 8000);
      sockB.on('call:invite', (p) => { clearTimeout(t); resolve(p); });
    });
    await request.post('/api/calls').set('Authorization', `Bearer ${aTok}`).send({ channelId }).expect(200);
    const p1 = await gotInviteREST;
    if (!p1 || !p1.callId) throw new Error('REST: missing callId in payload');

    // 2) Socket call:invite emits call:incoming/notify to B
    const sockA = ioClient(BASE, { auth: { token: aTok }, transports: ['websocket'] });
    await new Promise((res, rej) => {
      let ok = false;
      sockA.on('connect', () => sockA.emit('join', { channelId }, () => { ok = true; res(); }));
      sockA.on('connect_error', rej);
      sockA.once('history', () => { ok = true; res(); });
      setTimeout(() => ok ? res() : rej(new Error('A join timeout')), 8000);
    });
    await wait(250);
    const gotInviteSocket = new Promise((resolve, reject) => {
      const t = setTimeout(() => reject(new Error('SOCKET: no incoming/notify')), 8000);
      const done = (label, p) => { clearTimeout(t); resolve(p); };
      sockB.once('call:incoming', (p) => done('incoming', p));
      sockB.once('call:notify',   (p) => done('notify', p));
    });
    sockA.emit('call:invite', { channelId, callId: `${channelId}:${Date.now()}` });
    const p2 = await gotInviteSocket;
    if (!p2 || (!p2.callId && !p2.roomId)) throw new Error('SOCKET: missing call identifiers');

    console.log('SELFTEST PASS: REST and socket call invites received');
    process.exit(0);
  } catch (err) {
    console.error('SELFTEST FAIL:', err && err.message ? err.message : err);
    process.exit(1);
  } finally {
    try { if (srv && srv.server && typeof srv.server.close === 'function') await new Promise((r) => srv.server.close(() => r())); } catch {}
  }
})();
