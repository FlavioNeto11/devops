// Preview LOCAL do Reqhub que TAMBÉM faz proxy de /reqs/api -> reqhub-api local (127.0.0.1:8099),
// injetando o header SSO de admin (platform-admins) p/ validar o painel "Uso da IA" ponta a ponta.
// Só para preview — não vai a produção.
const http = require('http'), fs = require('fs'), path = require('path');
const ROOT = path.resolve(__dirname, '..', 'apps', 'reqhub', 'frontend');
const PORT = 5601, API = { host: '127.0.0.1', port: 8099 };
const MIME = { '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.html': 'text/html', '.ico': 'image/x-icon' };
http.createServer((req, res) => {
  const url = req.url || '/';
  if (url.startsWith('/reqs/api/')) {
    const opts = {
      host: API.host, port: API.port, method: req.method,
      path: url.replace('/reqs/api', '') || '/',
      headers: { ...req.headers, host: API.host + ':' + API.port, 'x-auth-request-email': 'preview-admin@nvit', 'x-auth-request-groups': 'platform-admins' },
    };
    const pr = http.request(opts, (ar) => { res.writeHead(ar.statusCode, ar.headers); ar.pipe(res); });
    pr.on('error', () => { res.writeHead(502, { 'content-type': 'application/json' }); res.end('{"error":{"code":"API_DOWN"}}'); });
    req.pipe(pr);
    return;
  }
  let p = decodeURIComponent(url.split('?')[0]);
  if (p === '/reqs' || p === '/reqs/') p = '/index.html';
  else if (p.startsWith('/reqs/')) p = p.slice('/reqs'.length);
  if (p === '/' || p === '') p = '/index.html';
  const fp = path.join(ROOT, path.normalize(p));
  if (!fp.startsWith(ROOT)) { res.writeHead(403); res.end('forbidden'); return; }
  fs.readFile(fp, (e, d) => {
    if (e) { res.writeHead(404, { 'content-type': 'text/plain' }); res.end('404 ' + p); return; }
    res.writeHead(200, { 'content-type': MIME[path.extname(fp)] || 'application/octet-stream' });
    res.end(d);
  });
}).listen(PORT, () => console.log('reqhub usage preview: http://localhost:' + PORT + '/reqs/'));
