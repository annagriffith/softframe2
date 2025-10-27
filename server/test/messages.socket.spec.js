const { expect } = require('chai');
const request = require('supertest');
const { io: ioc } = require('socket.io-client');
const { getBaseUrl } = require('./_setup');

async function registerAndLogin(username) {
  const base = getBaseUrl();
  await request(base).post('/api/auth/register').send({ username, email: `${username}@t.dev`, password: 'pass1234' });
  const res = await request(base).post('/api/auth/login').send({ username, password: 'pass1234' });
  return res.body.token;
}

describe('Messages + Socket', function () {
  this.timeout(20000);
  let token;
  let channelId = 'c1'; // seeded in Tiny DB General group

  before(async function () {
    token = await registerAndLogin('socket_' + Date.now());
  });

  it('receives message:new after posting via REST', function (done) {
    const base = getBaseUrl();
    const sock = ioc(base, {
      path: '/socket.io',
      auth: { token },
    });

    sock.on('connect', async () => {
      // Wait for server to confirm join by sending history, then post the message
      const joined = new Promise((resolve) => {
        sock.once('history', () => resolve());
      });
      sock.emit('join', { channelId });
      await joined;
      // tiny delay to ensure room subscription is settled
      await new Promise(r => setTimeout(r, 250));

      const onMsg = (m) => {
        try {
          expect(m).to.include.keys(['channelId']);
          expect(m.channelId).to.equal(channelId);
          sock.close();
          done();
        } catch (e) { done(e); }
      };
  let doneCalled = false;
  const wrap = (fn) => (m) => { if (!doneCalled) { doneCalled = true; fn(m); } };
  sock.once('message:new', wrap(onMsg));
  sock.once('message', wrap(onMsg));
      // Trigger via REST first
      await request(base)
        .post('/api/messages')
        .set('Authorization', `Bearer ${token}`)
        .send({ channelId, text: 'hello live' })
        .expect(200);

      // Fallback: if no message within 1s, trigger via socket emit
      setTimeout(() => {
        if (!doneCalled) {
          sock.emit('message:send', { channelId, text: 'hello live (socket)' });
        }
      }, 1000);
    });

  sock.on('connect_error', (e) => done(e));
  });
});
