const { io } = require('socket.io-client');
const supertest = require('supertest');
const BASE = process.env.BASE || 'http://127.0.0.1:3001';

(async () => {
  const request = supertest(BASE);

  await request.post('/api/auth/register').send({ username: 'callA', password: 'p', role: 'user' }).catch(()=>{});
  const aTok = (await request.post('/api/auth/login').send({ username: 'callA', password: 'p' })).body.token;

  await request.post('/api/auth/register').send({ username: 'callB', password: 'p', role: 'user' }).catch(()=>{});
  const bTok = (await request.post('/api/auth/login').send({ username: 'callB', password: 'p' })).body.token;

  const channelId = process.env.CHANNEL_ID || 'c1';
  const sockB = io(BASE, { auth: { token: bTok }, transports: ['websocket'] });
  const sockA = io(BASE, { auth: { token: aTok }, transports: ['websocket'] });

  await new Promise((res, rej) => {
    let joinedA = false, joinedB = false;
    function maybe() { if (joinedA && joinedB) res(); }
    const joinA = () => sockA.emit('join', { channelId }, () => { joinedA = true; maybe(); });
    const joinB = () => sockB.emit('join', { channelId }, () => { joinedB = true; maybe(); });
    sockA.on('connect', joinA);
    sockB.on('connect', joinB);
    sockA.once('history', () => { joinedA = true; maybe(); });
    sockB.once('history', () => { joinedB = true; maybe(); });
    sockA.on('connect_error', rej); sockB.on('connect_error', rej);
    setTimeout(()=>rej(new Error('join timeout')), 15000);
  });

  const gotInvite = new Promise((resolve, reject) => {
    const t = setTimeout(()=>reject(new Error('no call invite event')), 10000);
    const done = (label, p) => { clearTimeout(t); console.log(label + ':', p); resolve(p); };
    sockB.on('call:incoming', (p) => done('incoming', p));
    sockB.on('call:notify',   (p) => done('notify', p));
  });

  // small delay to ensure room subscriptions fully settled
  await new Promise(r => setTimeout(r, 500));
  sockA.emit('call:invite', { channelId, callId: `${channelId}:${Date.now()}` });

  const payload = await gotInvite;
  if (!payload || !payload.callId) throw new Error('Missing callId in invite');
  console.log('OK call invite received via socket');
  process.exit(0);
})();
