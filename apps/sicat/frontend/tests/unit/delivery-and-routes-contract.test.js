/**
 * Trava de CONTRATO da ENTREGA e das ROTAS (checagem estática do fonte).
 *
 * `src/router.js` e `nginx.conf` não são importáveis em node:test (o primeiro
 * importa `.vue`, o segundo é configuração de servidor). Sem esta trava, apagar
 * a rota catch-all, voltar o `Cache-Control` para `no-cache` ou desligar a
 * recuperação de bundle antigo passaria verde — que é exatamente a classe de
 * regressão que gerou 14 falsos alarmes numa varredura de produção.
 *
 * Regra da casa: grep no BUNDLE não prova nada (o build minifica). Grep no
 * FONTE, com a mensagem de falha dizendo o porquê, prova a ligação.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const routerSource = readFileSync(
  fileURLToPath(new URL('../../src/router.js', import.meta.url)),
  'utf8'
);

const nginxSource = readFileSync(
  fileURLToPath(new URL('../../nginx.conf', import.meta.url)),
  'utf8'
);

// --- ENTREGA (nginx) -------------------------------------------------------

test('o documento index.html é servido com no-store', () => {
  const spaBlock = nginxSource.slice(nginxSource.indexOf('location /sicat/ {'));
  assert.match(
    spaBlock,
    /add_header\s+Cache-Control\s+"no-store"/,
    'no-cache depende de ETag — e o proxy do host público REMOVE o ETag; use no-store'
  );
  assert.doesNotMatch(
    spaBlock,
    /add_header\s+Cache-Control\s+"no-cache"/,
    'no-cache no documento reabre a janela de bundle antigo em dev.nvit.com.br'
  );
});

test('os assets com hash continuam com cache longo (immutable)', () => {
  const assetsBlock = nginxSource.slice(
    nginxSource.indexOf('location /sicat/assets/ {'),
    nginxSource.indexOf('location /sicat/ {')
  );
  assert.match(assetsBlock, /add_header\s+Cache-Control\s+"public,\s*immutable"/);
  assert.match(assetsBlock, /expires\s+1y/);
});

// --- RECUPERAÇÃO DE SESSÃO PRESA ------------------------------------------

test('o router liga a recuperação de bundle antigo (onError + preload)', () => {
  assert.match(
    routerSource,
    /from '\.\/lib\/stale-bundle-recovery\.js'/,
    'a decisão deve vir do módulo puro e testado'
  );
  assert.match(
    routerSource,
    /router\.onError\(/,
    'sem router.onError a falha de import dinâmico deixa a SPA travada sem saída'
  );
  assert.match(
    routerSource,
    /vite:preloadError/,
    'a falha de preload de chunk/CSS não passa pelo onError — precisa do evento da window'
  );
});

// --- ROTA NEGADA -----------------------------------------------------------

test('o guard ENFILEIRA o aviso e o afterEach o entrega', () => {
  const beforeEachBlock = routerSource.slice(
    routerSource.indexOf('router.beforeEach('),
    routerSource.indexOf('router.afterEach(')
  );

  assert.match(
    beforeEachBlock,
    /queueRouteDenialNotice\(/,
    'o aviso de rota negada precisa ser enfileirado no guard'
  );
  assert.doesNotMatch(
    beforeEachBlock,
    /useNotification\(\)\.warning\(/,
    'emitir o toast dentro do beforeEach faz ele expirar enquanto o destino carrega'
  );

  const afterEachBlock = routerSource.slice(routerSource.indexOf('router.afterEach('));
  assert.match(
    afterEachBlock,
    /takeRouteDenialNotice\(/,
    'o afterEach precisa consumir a fila — senão o redirect volta a ser silencioso'
  );
  assert.match(afterEachBlock, /useNotification\(\)\.warning\(/);
});

test('TODO redirect do guard enfileira aviso — nenhum sai calado', () => {
  const beforeEachBlock = routerSource.slice(
    routerSource.indexOf('router.beforeEach('),
    routerSource.indexOf('router.afterEach(')
  );

  // O redirect do admin/SRE saindo de uma tela de operador era o único que
  // devolvia o usuário para outra área sem explicar nada.
  assert.match(
    beforeEachBlock,
    /ROUTE_DENIAL_REASONS\.AUDIENCE/,
    'admin/SRE mandado para a visão de Sistema precisa saber por quê'
  );

  for (const reason of ['ADMIN', 'PERSONA', 'AUDIENCE']) {
    assert.match(
      beforeEachBlock,
      new RegExp(`reason: ROUTE_DENIAL_REASONS\\.${reason}`),
      `o guard precisa enfileirar a razão ${reason}`
    );
  }

  // `deniedPath` é o que permite entregar o aviso quando o redirect tem dois saltos.
  const queuedNotices = beforeEachBlock.match(/queueRouteDenialNotice\(/g) || [];
  const deniedPaths = beforeEachBlock.match(/deniedPath: to\.path/g) || [];
  assert.equal(
    deniedPaths.length,
    queuedNotices.length,
    'todo aviso enfileirado precisa dizer de qual rota o usuário foi barrado'
  );
});

// --- 404 -------------------------------------------------------------------

test('existe rota catch-all de 404, e ela é a ÚLTIMA', () => {
  const catchAllIndex = routerSource.indexOf("path: '/:pathMatch(.*)*'");
  assert.notEqual(catchAllIndex, -1, 'sem catch-all a URL desconhecida cai num card genérico');

  const nextRoute = routerSource.indexOf("path: '", catchAllIndex + 10);
  const routesEnd = routerSource.indexOf('const router = createRouter(');
  assert.ok(
    nextRoute === -1 || nextRoute > routesEnd,
    'o catch-all precisa ser a última rota, senão ele engole as rotas declaradas depois'
  );

  const block = routerSource.slice(catchAllIndex, routesEnd);
  assert.match(block, /component:\s*NotFoundView/);
  assert.match(
    block,
    /breadcrumb:\s*\['Página não encontrada'\]/,
    'o título da aba sai do breadcrumb — sem ele o 404 fica com título genérico'
  );
  assert.match(
    block,
    /requiresSicatAuth:\s*false/,
    'um endereço errado não pode virar "sessão expirada"'
  );
  assert.match(
    block,
    /hidePageHeader:\s*true/,
    'sem isso o shell repete o título e ainda descreve o 404 como tela de operação'
  );
});
