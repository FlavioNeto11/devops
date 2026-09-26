// Boot da API da Plataforma BESC: store JSON, fundação (Postgres/RBAC/auditoria), adaptador
// do marketplace legado (somente leitura, ADR-010) e listen. A montagem das rotas vive em
// app.js (createApp), importável por testes HTTP sem abrir porta nem conectar banco.
import * as store from './store.js';
import { bootFoundation } from './foundation/index.js';
import { bootMarketplace } from './marketplace/index.js';
import { createApp } from './app.js';

const app = createApp();
const PORT = process.env.PORT || 8080;

Promise.all([store.init(), bootFoundation()]).then(async ([, foundationOn]) => {
  if (foundationOn) {
    await bootMarketplace(); // adaptador simulado (Besu recusado enquanto TOKENIZATION_REAL = false)
  }
  app.listen(PORT, () => console.log(`[besc-api] ouvindo em :${PORT} (data em ${process.env.DATA_DIR || 'cwd/data'})`));
});
