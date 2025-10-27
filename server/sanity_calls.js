// In-process sanity check for call invites without external ports
// 1) Starts server on an ephemeral port
// 2) Registers/logins two users via HTTP
// 3) Socket B joins a channel, Socket A emits call:invite
// 4) Asserts B receives call:incoming/notify or call:invite

const http = require('http');
const { io } = require('socket.io-client');

function wait(ms) { return new Promise(r => setTimeout(r, ms)); }

function post(base, path, data, token) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify(data || {});
    const req = http.request(base + path, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body),
        ...(token ? { Authorization: `Bearer ${token}` } : {})
      }
    }, res => {
      let raw = ''; res.on('data', d => raw += d); res.on('end', () => {
        try { resolve(JSON.parse(raw || '{}')); } catch { resolve({}); }
      });
    });
    req.on('error', reject); req.write(body); req.end();
  });
}

(async () => {
  try {
    process.env.NODE_ENV = 'test';
    process.env.USE_TINY_DB = 'true';
    process.env.JWT_SECRET = process.env.JWT_SECRET || 'devsecret';

    const srv = require('./server.js');
    // Listen on an ephemeral port
    const port = await new Promise((resolve, reject) => {
      try {
        srv.server.listen(0, () => {
          try {
            const addr = srv.server.address();
            resolve(addr.port);
          } catch (e) { reject(e); }
        });
      } catch (e) { reject(e); }
    });
    const BASE = `http://127.0.0.1:${port}`;

    // Prepare users
    await post(BASE, '/api/auth/register', { username: 'callA', password: 'p' }).catch(()=>{});
    const aRes = await post(BASE, '/api/auth/login', { username: 'callA', password: 'p' });
    const aTok = aRes.token;

    await post(BASE, '/api/auth/register', { username: 'callB', password: 'p' }).catch(()=>{});
    const bRes = await post(BASE, '/api/auth/login', { username: 'callB', password: 'p' });
    const bTok = bRes.token;

    if (!aTok || !bTok) throw new Error('login failed');

    const channelId = 'c1';

    // Socket B (callee)
    const sockB = io(BASE, { auth: { token: bTok }, transports: ['websocket'] });
    await new Promise((res, rej) => {
      let joined = false;
      const done = () => { joined = true; res(); };
      sockB.on('connect', () => sockB.emit('join', { channelId }, () => done()));
      sockB.once('history', () => done());
      sockB.on('connect_error', rej);
      setTimeout(() => joined ? res() : rej(new Error('B join timeout')), 8000);
    });

    // Socket A (caller)
    const sockA = io(BASE, { auth: { token: aTok }, transports: ['websocket'] });
    await new Promise((res, rej) => {
      let joined = false;
      const done = () => { joined = true; res(); };
      sockA.on('connect', () => sockA.emit('join', { channelId }, () => done()));
      sockA.once('history', () => done());
      sockA.on('connect_error', rej);
      setTimeout(() => joined ? res() : rej(new Error('A join timeout')), 8000);
    });

    await wait(200);

    // Expect any of the invite events
    const gotInvite = new Promise((resolve, reject) => {
      const t = setTimeout(() => reject(new Error('no call invite received')), 8000);
      const done = (label, p) => { clearTimeout(t); console.log(label + ':', p); resolve(p); };
      sockB.once('call:incoming', (p) => done('incoming', p));
      sockB.once('call:notify',   (p) => done('notify', p));
      sockB.once('call:invite',   (p) => done('invite', p));
    });

    sockA.emit('call:invite', { channelId, callId: `${channelId}:${Date.now()}` });

    const payload = await gotInvite;
    if (!payload || (!payload.callId && !payload.roomId)) throw new Error('missing call identifiers in payload');

    console.log('SANITY PASS: call invites received');
    process.exit(0);
  } catch (err) {
    console.error('SANITY FAIL:', err && err.message ? err.message : err);
    process.exit(1);
  }
})();
