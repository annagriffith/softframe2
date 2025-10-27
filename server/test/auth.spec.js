const request = require('supertest');
const { expect } = require('chai');
const { getBaseUrl } = require('./_setup');

describe('Auth', function () {
  let base;
  before(function(){ base = getBaseUrl(); });
  it('registers a user', async function () {
    const u = 'u' + Math.random().toString(36).slice(2, 7);
    const res = await request(base)
      .post('/api/auth/register')
      .send({ username: u, email: `${u}@t.dev`, password: 'pass1234' })
      .expect(200);
    expect(res.body).to.have.property('success', true);
    expect(res.body).to.have.property('token');
    expect(res.body).to.have.property('user');
  });

  it('logs in and fetches /api/auth/me', async function () {
    const u = 'u' + Math.random().toString(36).slice(2, 7);
  await request(base).post('/api/auth/register').send({ username: u, email: `${u}@t.dev`, password: 'pass1234' });
  const login = await request(base).post('/api/auth/login').send({ username: u, password: 'pass1234' }).expect(200);
    const token = login.body.token;
  const me = await request(base).get('/api/auth/me').set('Authorization', `Bearer ${token}`).expect(200);
    expect(me.body).to.have.property('user');
    expect(me.body.user).to.have.property('username', u);
  });

  it('blocks /api/auth/me without token', async function () {
  await request(base).get('/api/auth/me').expect(401);
  });
});
