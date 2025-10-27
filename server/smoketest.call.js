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

  await new Promise((res, rej) => {
    sockB.on('connect', () => sockB.emit('join', { channelId }, () => res()));
    sockB.on('connect_error', rej);
    sockB.once('history', () => res());
    setTimeout(()=>rej(new Error('B join timeout')), 12000);
  });

  const gotInvite = new Promise((resolve, reject) => {
    const t = setTimeout(()=>reject(new Error('no call:invite')), 8000);
    sockB.on('call:invite', (p) => { clearTimeout(t); console.log('invite:', p); resolve(p); });
  });

  await request.post('/api/calls').set('Authorization', `Bearer ${aTok}`).send({ channelId }).expect(200);

  const payload = await gotInvite;
  if (!payload || !payload.callId) throw new Error('Missing callId in invite');
  console.log('OK call invite received');
  process.exit(0);
})();
