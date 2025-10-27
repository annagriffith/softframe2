const { io } = require('socket.io-client');
const supertest = require('supertest');
const BASE = process.env.BASE || 'http://127.0.0.1:3005';

(async () => {
  const request = supertest(BASE);
  await request.post('/api/auth/register').send({ username: 'callA2', password: 'p' }).catch(()=>{});
  const aTok = (await request.post('/api/auth/login').send({ username: 'callA2', password: 'p' })).body.token;
  await request.post('/api/auth/register').send({ username: 'callB2', password: 'p' }).catch(()=>{});
  const bTok = (await request.post('/api/auth/login').send({ username: 'callB2', password: 'p' })).body.token;
  const channelId = 'c1';
  const sockB = io(BASE, { auth: { token: bTok }, transports: ['websocket'] });
  const sockA = io(BASE, { auth: { token: aTok }, transports: ['websocket'] });

  function join(socket, name){
    return new Promise((res, rej) => {
      socket.on('connect', () => {
        console.log('connect', name, socket.id);
        socket.emit('join', { channelId }, () => { console.log('joined ack', name); res(); });
      });
      socket.once('history', () => { console.log('history for', name); res(); });
      socket.on('connect_error', rej);
      setTimeout(()=>rej(new Error('join timeout '+name)), 10000);
    });
  }

  sockB.onAny((ev, p)=>console.log('B onAny', ev, p));

  await Promise.all([join(sockA, 'A'), join(sockB, 'B')]);
  console.log('both joined, emitting invite');
  sockA.emit('call:invite', { channelId, callId: channelId+':'+Date.now() });

  setTimeout(()=>{ console.log('done wait'); process.exit(0); }, 5000);
})();
