// mock-central — sistema externo SIMULADO (prova gateway + retry/DLQ). Gerado pela Forge.
import http from 'node:http';
const seen = new Map(); let calls = 0;
const server = http.createServer((req, res) => {
  if (req.method === 'GET' && req.url === '/health') { res.end(JSON.stringify({ status: 'ok', calls })); return; }
  if (req.method !== 'POST' || req.url !== '/dispatch') { res.statusCode = 404; res.end('not found'); return; }
  let body = ''; req.on('data', (c) => (body += c)); req.on('end', () => {
    calls++; let o = {}; try { o = JSON.parse(body || '{}'); } catch {}
    const n = (seen.get(o.id) || 0) + 1; seen.set(o.id, n);
    const fail = String(o.title || '').toUpperCase().includes('FALHA') || n === 1;
    if (fail) { res.statusCode = 503; res.end(JSON.stringify({ error: 'indisponivel', attempt: n })); return; }
    res.statusCode = 200; res.end(JSON.stringify({ ref: 'EXT-' + o.id + '-' + Math.floor(Date.now()/1000) }));
  });
});
server.listen(Number(process.env.PORT) || 8090, () => console.log('[helpflow-mock-central] :8090'));
