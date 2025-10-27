// node smoketest.socket.js
const { io } = require('socket.io-client');
const http = require('http');

const BASE = process.env.BASE || 'http://127.0.0.1:3001';
const channelId = process.env.CHANNEL_ID || 'c1'; // default seeded channel in Tiny DB

function post(path, data, token) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify(data);
    const req = http.request(BASE + path, {
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
  await post('/api/auth/register', { username: 'socketUser', password: 'pass', role: 'user' }).catch(()=>({}));
  const login = await post('/api/auth/login', { username: 'socketUser', password: 'pass' });
  const token = login.token;
  if (!token) throw new Error('No token; login failed');

  const socket = io(BASE, { auth: { token }, transports: ['websocket'] });

  let joined = false;
  socket.on('connect', () => {
    console.log('Socket connected', socket.id);
    socket.emit('join', { channelId }, (ok) => { joined = !!ok; console.log('joined?', ok); });
  });

  const waitForJoin = new Promise((resolve) => {
    socket.once('history', () => { joined = true; resolve(); });
    setTimeout(() => { if (joined) resolve(); }, 1500);
  });

  const finish = (msg) => { console.log('GOT BROADCAST:', msg.text || msg.imagePath || msg._id); process.exit(0); };
  socket.on('message:new', finish);
  socket.on('message', finish);

  (async () => {
    await waitForJoin;
    await post('/api/messages', { channelId, text: 'hello from smoke test' }, token);
  })();

  setTimeout(() => { console.error('No broadcast in time'); process.exit(1); }, 8000);
})();
