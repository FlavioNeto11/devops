// Teste mínimo de conexão Node.js para 127.0.0.1:8080/health (ESM)
import http from 'http';

const options = {
  hostname: '127.0.0.1',
  port: 8080,
  path: '/health',
  method: 'GET',
};

const req = http.request(options, res => {
  let data = '';
  res.on('data', chunk => { data += chunk; });
  res.on('end', () => {
    console.log('Status:', res.statusCode);
    console.log('Body:', data);
  });
});

req.on('error', error => {
  console.error('Erro:', error);
});

req.end();
