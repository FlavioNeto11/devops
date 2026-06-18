// Servidor estático mínimo só para PREVIEW local do Reqhub (não vai para produção).
// Respeita o <base href="/reqs/"> servindo apps/reqhub/frontend sob o prefixo /reqs/.
const http = require('http'), fs = require('fs'), path = require('path');
const ROOT = path.resolve(__dirname, '..', 'apps', 'reqhub', 'frontend');
const PORT = 5599;
const MIME = { '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.html': 'text/html', '.ico': 'image/x-icon' };
http.createServer((req, res) => {
  let p = decodeURIComponent((req.url || '/').split('?')[0]);
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
}).listen(PORT, () => console.log('reqhub preview: http://localhost:' + PORT + '/reqs/'));
