const http = require('http');
const req = http.request({ hostname: '127.0.0.1', port: 3001, path: '/api/version', method: 'GET', timeout: 3000 }, (res) => {
  const chunks = []; res.on('data', c => chunks.push(c)); res.on('end', () => {
    const raw = Buffer.concat(chunks).toString('utf8');
    console.log('status:', res.statusCode);
    console.log(raw);
  });
});
req.on('error', (e) => { console.error('err', e.message); process.exitCode = 1; });
req.end();
