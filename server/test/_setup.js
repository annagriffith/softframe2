const http = require('http');
const path = require('path');
const fs = require('fs');
const db = require('../db');

// Exports for specs
let baseUrl;
let appExp;
let serverExp;

const mochaHooks = {
  beforeAll: async function () {
    // Ensure the server doesn't autostart and we use Tiny DB
    process.env.NODE_ENV = 'test';
    process.env.USE_TINY_DB = process.env.USE_TINY_DB || 'true';
    process.env.PORT = process.env.PORT || '3999';
    process.env.JWT_SECRET = process.env.JWT_SECRET || 'devsecret';

    // Prepare uploads dir used by server (under server/uploads)
    const uploadsDir = path.join(__dirname, '..', 'uploads');
    fs.mkdirSync(uploadsDir, { recursive: true });
    for (const f of fs.readdirSync(uploadsDir)) {
      try { fs.rmSync(path.join(uploadsDir, f), { force: true, recursive: true }); } catch {}
    }

    // Connect DB (Tiny DB will seed default data like c1)
    await db.connect();

    // Require server AFTER env vars are set; in test mode it won't auto-listen
    const srv = require('../server.js');
    appExp = srv.app;
    serverExp = srv.server;
    // Start the HTTP server once for all tests if we have a server and it's not already listening
    if (serverExp && typeof serverExp.listen === 'function' && !serverExp.listening) {
      await new Promise((resolve) => {
        serverExp.listen(process.env.PORT, resolve);
      });
    }

    // Base URL is the configured PORT; we are in the same process
    const port = process.env.PORT || '3999';
    baseUrl = `http://127.0.0.1:${port}`;

    // Wait until /api/health responds (retry a few times)
    await new Promise((resolve, reject) => {
      let attempts = 0;
      const maxAttempts = 20;
      const tryOnce = () => {
        attempts++;
        const req = http.get(`${baseUrl}/api/health`, (res) => {
          if (res.statusCode === 200) {
            res.resume();
            resolve();
          } else {
            res.resume();
            if (attempts >= maxAttempts) reject(new Error('Health check failed'));
            else setTimeout(tryOnce, 200);
          }
        });
        req.on('error', () => {
          if (attempts >= maxAttempts) reject(new Error('Server did not start in time'));
          else setTimeout(tryOnce, 200);
        });
      };
      tryOnce();
    });
  },
  afterAll: async function () {
    try {
      if (serverExp) {
        await new Promise((resolve) => serverExp.close(resolve));
      }
    } finally {
      try { await db.close(); } catch {}
    }
  }
};

// Helper to expose base URL and app to specs
module.exports = { getBaseUrl: () => baseUrl, getApp: () => appExp, mochaHooks };
