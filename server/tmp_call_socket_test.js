const { io } = require('socket.io-client');
const http = require('http');

function post(path, data, headers = {}) {
  return new Promise((resolve, reject) => {
    const bodyStr = JSON.stringify(data);
    const req = http.request({ hostname: '127.0.0.1', port: 3001, path, method: 'POST', headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(bodyStr), ...headers }, timeout: 5000 }, (res) => {
      const chunks = []; res.on('data', c => chunks.push(c)); res.on('end', () => { const raw = Buffer.concat(chunks).toString('utf8'); try { resolve({ status: res.statusCode, body: JSON.parse(raw) }); } catch { resolve({ status: res.statusCode, body: raw }); } });
    });
    req.on('error', reject); req.on('timeout', () => { req.destroy(); reject(new Error('timeout')); }); req.write(bodyStr); req.end();
  });
}

(async () => {
  try {
    await post('/api/auth/register', { username: 'callA', password: 'p', email: 'a@x' }).catch(()=>({}));
    const aTok = (await post('/api/auth/login', { username: 'callA', password: 'p' })).body.token;
    await post('/api/auth/register', { username: 'callB', password: 'p', email: 'b@x' }).catch(()=>({}));
    const bTok = (await post('/api/auth/login', { username: 'callB', password: 'p' })).body.token;

    const channelId = 'c1';
  const sockB = io('http://127.0.0.1:3001', { auth: { token: bTok }, transports: ['websocket'] });
  const sockA = io('http://127.0.0.1:3001', { auth: { token: aTok }, transports: ['websocket'] });
  sockB.onAny((event, ...args) => { if (!String(event).startsWith('message')) console.log('B any:', event); });

    await new Promise((res, rej) => {
      let joinedA = false, joinedB = false;
      const maybe = () => { if (joinedA && joinedB) res(); };
      sockA.on('connect', () => { sockA.emit('join', { channelId }, () => { joinedA = true; maybe(); }); });
      sockB.on('connect', () => { sockB.emit('join', { channelId }, () => { joinedB = true; maybe(); }); });
      sockA.once('history', () => { joinedA = true; maybe(); });
      sockB.once('history', () => { joinedB = true; maybe(); });
      sockA.on('connect_error', rej); sockB.on('connect_error', rej);
      setTimeout(()=>rej(new Error('join timeout')), 10000);
    });

    console.log('both joined');

    // First validate room by sending a message via REST and expecting message event
    const gotMessage = new Promise((resolve, reject) => {
      const t = setTimeout(()=>reject(new Error('no message event')), 8000);
      sockB.once('message', (m) => { clearTimeout(t); resolve(m); });
      sockB.once('message:new', (m) => { clearTimeout(t); resolve(m); });
    });
    await new Promise(r => setTimeout(r, 200));
    await post('/api/messages', { channelId, text: 'hello from A' }, { Authorization: `Bearer ${aTok}` }).then(r => {
      if (r.status !== 200) throw new Error('post message failed ' + r.status + ' ' + r.body);
    });
    const m = await gotMessage;
    console.log('got message broadcast:', m && m.text);

    const gotInvite = new Promise((resolve, reject) => {
      const t = setTimeout(()=>reject(new Error('no call invite event')), 10000);
      const done = (label, p) => { clearTimeout(t); console.log('got', label, p); resolve(p); };
      sockB.on('call:invite',   (p) => done('invite', p));
      sockB.on('call:incoming', (p) => done('incoming', p));
      sockB.on('call:notify',   (p) => done('notify', p));
      sockA.on('call:invite',   (p) => console.log('A saw invite', p));
      sockA.on('call:incoming', (p) => console.log('A saw incoming', p));
      sockA.on('call:notify',   (p) => console.log('A saw notify', p));
    });

    await new Promise(r => setTimeout(r, 500));
  // Try REST path first
  const restRes = await post('/api/calls', { channelId }, { Authorization: `Bearer ${aTok}` });
  console.log('REST /api/calls status:', restRes.status, 'body:', restRes.body);
    // Then try socket path
    sockA.emit('call:invite', { channelId, callId: `${channelId}:${Date.now()}` });
    // Also try the explicit call room flow
    const callRoom = `call:${channelId}:${Date.now()}`;
    sockB.on('call:joined', (p) => console.log('B saw call:joined', p));
    sockA.emit('call:join', { roomId: callRoom, username: 'callA' });
    sockB.emit('call:join', { roomId: callRoom, username: 'callB' });

    const payload = await gotInvite;
    console.log('PASS call invite received via socket', payload);
    process.exit(0);
  } catch (e) {
    console.error('FAIL', e && e.message || e);
    process.exit(1);
  }
})();
