const path = require('path');
const fs = require('fs');
const request = require('supertest');
const { expect } = require('chai');
const { getBaseUrl } = require('./_setup');

async function login(username) {
  const base = getBaseUrl();
  await request(base).post('/api/auth/register').send({ username, email: `${username}@t.dev`, password: 'pass1234' });
  const r = await request(base).post('/api/auth/login').send({ username, password: 'pass1234' });
  return r.body.token;
}

describe('Uploads', function () {
  this.timeout(15000);
  let token;
  const tinyPng = path.join(__dirname, 'fixtures', 'tiny.png');

  before(function () {
    // generate a 1x1 transparent PNG if not present
    if (!fs.existsSync(path.dirname(tinyPng))) fs.mkdirSync(path.dirname(tinyPng), { recursive: true });
    if (!fs.existsSync(tinyPng)) {
      // Prebuilt base64 1x1 pixel PNG
      const b64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR4nGMAAQAABQABDQottAAAAABJRU5ErkJggg==';
      fs.writeFileSync(tinyPng, Buffer.from(b64, 'base64'));
    }
  });

  before(async function () {
    token = await login('up_' + Date.now());
  });

  it('uploads avatar via /api/auth/avatar', async function () {
    const res = await request(getBaseUrl())
      .post('/api/auth/avatar')
      .set('Authorization', `Bearer ${token}`)
      .attach('avatar', tinyPng)
      .expect(200);
    expect(res.body).to.have.property('success', true);
    expect(res.body).to.have.property('avatar');
  });

  it('uploads chat image via /api/messages/image', async function () {
    // Use seeded channel c1 in Tiny DB
    const res = await request(getBaseUrl())
      .post('/api/messages/image')
      .set('Authorization', `Bearer ${token}`)
      .field('channelId', 'c1')
      .attach('image', tinyPng)
      .expect(200);
    expect(res.body).to.have.property('success', true);
    expect(res.body.message).to.include.keys(['channelId', 'imagePath']);
  });
});
