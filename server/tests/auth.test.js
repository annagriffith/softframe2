const request = require('supertest');

let app, server;
let baseUrl;

// Node http-based helpers
function httpGet(path, headers = {}) {
  return new Promise((resolve, reject) => {
    const http = require('http');
    const req = http.request(baseUrl + path, { method: 'GET', headers, timeout: 5000 }, (res) => {
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => {
        const raw = Buffer.concat(chunks).toString('utf8');
        let body = null;
        try { body = raw ? JSON.parse(raw) : null; } catch (e) { body = raw; }
        resolve({ status: res.statusCode, body });
      });
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('timeout')); });
    req.end();
  });
}

function httpPost(path, data, headers = {}) {
  return new Promise((resolve, reject) => {
    const http = require('http');
    const bodyStr = JSON.stringify(data || {});
    const opts = new URL(baseUrl + path);
    const req = http.request({ hostname: opts.hostname, port: opts.port, path: opts.pathname + (opts.search||''), method: 'POST', headers: { 'content-type': 'application/json', 'content-length': Buffer.byteLength(bodyStr), ...headers }, timeout: 5000 }, (res) => {
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => {
        const raw = Buffer.concat(chunks).toString('utf8');
        let body = null;
        try { body = raw ? JSON.parse(raw) : null; } catch (e) { body = raw; }
        resolve({ status: res.statusCode, body });
      });
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('timeout')); });
    req.write(bodyStr);
    req.end();
  });
}

beforeAll(async () => {
  // Run server on ephemeral port for tests and use test DB name
  process.env.PORT = '0';
  process.env.DB_NAME = 'frametry_test';
  process.env.USE_TINY_DB = 'true';
  process.env.NODE_ENV = 'test';
  process.env.AUTOSTART_SERVER = 'false';
  // Ensure we load fresh modules with the env above
  jest.resetModules();
  const srv = require('../server');
  app = srv.app || srv;
  // ensure DB is ready
  const db = require('../db');
  await db.connect();
  // Start a dedicated HTTP server for this test suite
  const http = require('http');
  server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, resolve));
  const port = server.address().port;
  baseUrl = `http://127.0.0.1:${port}`;
  // Wait until the server reports an address and health endpoint responds
  const start = Date.now();
  // 10s timeout
  const timeoutMs = 10000;
  await new Promise((resolve) => {
    const http = require('http');
    const tick = () => {
      const req = http.request(`${baseUrl}/api/health`, { method: 'GET', timeout: 2000 }, (res) => {
        if (res.statusCode === 200) return resolve();
        if (Date.now() - start > timeoutMs) return resolve();
        setTimeout(tick, 50);
      });
      req.on('error', () => {
        if (Date.now() - start > timeoutMs) return resolve();
        setTimeout(tick, 50);
      });
      req.on('timeout', () => {
        req.destroy();
        if (Date.now() - start > timeoutMs) return resolve();
        setTimeout(tick, 50);
      });
      req.end();
    };
    tick();
  });
});

afterAll(async () => {
  try {
    if (server && server.close) {
      await new Promise((resolve) => server.close(resolve));
    }
  } finally {
    try { const db = require('../db'); await db.close(); } catch {}
  }
});

function api() {
  return { get: (p, h) => httpGet(p, h), post: (p, d, h) => httpPost(p, d, h) };
}

describe('Auth routes', () => {
  test('health endpoint returns ok', async () => {
    const res = await api().get('/api/health');
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('ok', true);
  });

  test('register -> login -> me flow', async () => {
    const username = `u_${Date.now()}`;
    const password = '123';

  const r1 = await api().post('/api/auth/register', { username, password, email: `${username}@test.local` });
  expect(r1.status).toBe(200);
  expect(r1.body).toHaveProperty('token');

  const r2 = await api().post('/api/auth/login', { username, password });
  expect(r2.status).toBe(200);
  expect(r2.body).toHaveProperty('token');
  const token = r2.body.token;

  const r3 = await api().get('/api/auth/me', { Authorization: `Bearer ${token}` });
  expect(r3.status).toBe(200);
  expect(r3.body).toHaveProperty('user.username', username);
  });

  test('login with bad credentials should 401', async () => {
  const res = await api().post('/api/auth/login', { username: 'missing', password: 'nope' });
  expect(res.status).toBe(401);
  });
});
