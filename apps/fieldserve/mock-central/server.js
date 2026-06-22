// mock-central — central externa SIMULADA ("CentralDispatch") para provar o gateway + retry/DLQ.
// Comportamento determinístico p/ demonstrar:
//   - título contém "FALHA"  -> sempre 503 (vai esgotar as tentativas -> DLQ);
//   - 1ª chamada de cada ordem -> 503 (transitório); 2ª+ -> 200 (prova o retry com sucesso).
import http from 'node:http';

const seen = new Map(); // orderId -> nº de chamadas
let calls = 0, fails = 0;

const server = http.createServer((req, res) => {
  if (req.method === 'GET' && req.url === '/health') { res.end(JSON.stringify({ status: 'ok', calls, fails })); return; }
  if (req.method !== 'POST' || req.url !== '/dispatch') { res.statusCode = 404; res.end('not found'); return; }
  let body = '';
  req.on('data', (c) => (body += c));
  req.on('end', () => {
    calls++;
    let order = {};
    try { order = JSON.parse(body || '{}'); } catch { /* */ }
    const n = (seen.get(order.orderId) || 0) + 1;
    seen.set(order.orderId, n);
    const alwaysFail = String(order.title || '').toUpperCase().includes('FALHA');
    const transientFail = n === 1; // primeira chamada falha (transitório)
    if (alwaysFail || transientFail) {
      fails++;
      res.statusCode = 503;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ error: alwaysFail ? 'indisponivel-permanente' : 'indisponivel-transitorio', attempt: n }));
      return;
    }
    res.statusCode = 200;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ ref: `CD-${order.orderId}-${Math.floor(Date.now() / 1000)}`, attempt: n }));
  });
});

const PORT = Number(process.env.PORT) || 8090;
server.listen(PORT, () => console.log(`[mock-central] :${PORT} (FALHA=>503 sempre; 1a chamada=>503 transitorio)`));
