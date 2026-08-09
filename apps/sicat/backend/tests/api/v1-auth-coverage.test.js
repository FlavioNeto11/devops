/**
 * CATRACA de autenticação da superfície HTTP.
 *
 * Não testa "algumas rotas": ENUMERA o router realmente montado por `createApp()` e exige que TODO
 * caminho fora de uma allowlist FECHADA responda 401 sem `Authorization`. Rota nova que nascer
 * aberta quebra este teste — que é exatamente o modo de falha que criou o incidente: 73 rotas `/v1`
 * (incluindo `POST /v1/manifestos/:id/submit`, irreversível na CETESB, e
 * `POST /v1/maintenance/cleanup`, destrutivo) respondiam sem nenhuma credencial em `dev.nvit.com.br`.
 *
 * Por que 401 e não "não-200": um 400 de validação de negócio JÁ É a falha original — a rota
 * respondia `integrationAccountId is required` a um anônimo, ou seja, tinha passado da autenticação.
 * Só o 401 prova que o gate rodou ANTES do handler.
 *
 * CONTROLE NEGATIVO (duas metades, ambas obrigatórias):
 *  - as rotas públicas continuam respondendo != 401 sem token — senão o medidor estaria acusando
 *    401 em tudo e o teste passaria mesmo com a app quebrada;
 *  - as rotas fechadas respondem != 401 COM token válido — senão "fechar" poderia significar
 *    "derrubei a app" e o teste não veria diferença.
 */

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { pool } from '../../src/db/pool.js';
import { ensureStartup } from '../../src/bootstrap/startup.js';
import { createApp } from '../../src/app.js';
import { createTestAccessToken } from '../helpers/sicat-token.js';

/**
 * Allowlist FECHADA de caminhos públicos, por `<VERBO> <caminho>`.
 *
 * Cada entrada existe por um motivo que NÃO se aplica ao resto da superfície: ou a credencial vai no
 * corpo (é impossível exigir Bearer de quem ainda não tem sessão), ou a autenticidade vem de outro
 * mecanismo, ou não há dado a proteger. Ampliar esta lista é uma decisão de segurança — não um
 * ajuste para fazer um teste passar.
 */
const PUBLIC_ROUTES = new Map([
  ['GET /health', 'sondado pelo Kubernetes (startup/readiness/liveness em k8s/backend.yaml)'],
  ['GET /v1/ping', 'liveness trivial; não lê banco nem devolve dado de negócio'],
  ['POST /v1/auth/login', 'credencial CETESB vai no corpo'],
  ['POST /v1/sicat/auth/login', 'credencial SICAT vai no corpo'],
  ['POST /v1/sicat/auth/register', 'cadastro público (concede apenas o papel-PISO)'],
  ['POST /v1/sicat/auth/refresh', 'o refresh token do corpo É a credencial'],
  ['POST /v1/sicat/auth/keycloak', 'o access token do Keycloak no corpo É a credencial'],
  ['GET /v1/channels/whatsapp/webhook', 'desafio de verificação do Meta; sem corpo e sem estado'],
  ['POST /v1/channels/whatsapp/webhook', 'autenticado por assinatura HMAC do provedor, na própria rota']
  // `GET /openapi.yaml` e `GET /openapi.json` SAÍRAM desta lista: o contrato interno é fechado. As
  // três superfícies de documentação (`.yaml`, `.json` e `/docs`) foram para trás do
  // `sicatAuthMiddleware` na mesma mudança — fechar só as duas enumeráveis seria teatro, já que o
  // Swagger UI serve o mesmo documento a partir do spec em memória.
]);

/**
 * `/docs` é montado por `app.use(...)`, não por `app.get(...)` — o enumerador acima só enxerga
 * `layer.route`, então esta família NUNCA apareceria na varredura e ficaria fora da catraca por
 * construção. As entradas abaixo são exercidas explicitamente, incluindo um ASSET do Swagger UI:
 * `swaggerUi.serve` monta `[swaggerInitFn, swaggerAssetMiddleware()]` sob o mesmo prefixo, e um gate
 * posto só na página deixaria os assets abertos.
 */
const DOCS_PATHS = ['/docs', '/docs/', '/docs/swagger-ui.css', '/docs/swagger-ui-bundle.js'];

/** Rotas que não podem ser exercidas às cegas: mantêm conexão aberta ou dependem de rede externa. */
const SKIP_WITH_TOKEN = new Set([
  'GET /v1/jobs/:jobId/events', // NDJSON de longa duração: abre um client pg e só fecha no terminal
  'GET /v1/ai-control/events/stream' // SSE de longa duração
]);

/**
 * Extrai (verbo, caminho) de cada camada do router do Express, incluindo sub-routers montados por
 * `app.use(prefixo, router)` — é assim que `/health/...` entra na conta.
 */
function collectRoutes(stack, prefix = '') {
  const routes = [];

  for (const layer of stack) {
    if (layer.route) {
      const routePath = prefix + layer.route.path;
      for (const [method, enabled] of Object.entries(layer.route.methods || {})) {
        if (enabled && method !== '_all') {
          routes.push({ method: method.toUpperCase(), path: routePath });
        }
      }
      continue;
    }

    if (layer.name === 'router' && layer.handle?.stack) {
      routes.push(...collectRoutes(layer.handle.stack, prefix + mountPathOf(layer)));
    }
  }

  return routes;
}

/** Reconstrói o prefixo de montagem a partir do regexp da camada (`app.use('/health', …)`). */
function mountPathOf(layer) {
  const source = layer.regexp?.source || '';
  if (source === '^\\/?(?=\\/|$)' || source === '^\\/?$') return '';
  const match = /^\^\\\/([^\\?(]+)/.exec(source);
  return match ? `/${match[1].replace(/\\\//g, '/')}` : '';
}

/** Preenche `:param` com um valor sintético — nenhuma rota deve chegar ao handler sem token. */
function fillParams(routePath) {
  return routePath.replace(/:([A-Za-z0-9_]+)/g, 'zz-param-inexistente');
}

let server;
let API_BASE = '';
let allRoutes = [];

describe('Catraca de auth — toda rota fora da allowlist exige Bearer', { concurrency: 1 }, () => {
  before(async () => {
    await ensureStartup();
    const app = createApp();
    server = await new Promise((resolve) => {
      const instance = app.listen(0, '127.0.0.1', () => resolve(instance));
    });
    API_BASE = `http://127.0.0.1:${server.address().port}`;
    allRoutes = collectRoutes(app._router.stack);
  });

  after(async () => {
    if (server) await new Promise((resolve) => server.close(resolve));
    await pool.end();
  });

  it('o enumerador enxerga o router de verdade (controle do medidor)', () => {
    // Sem esta guarda, um enumerador quebrado devolveria zero rotas e TODAS as asserções abaixo
    // passariam por vacuidade — o modo de falha clássico de um teste que varre uma coleção.
    assert.ok(allRoutes.length > 140, `esperava >140 rotas montadas, achei ${allRoutes.length}`);

    const paths = new Set(allRoutes.map((r) => `${r.method} ${r.path}`));
    for (const marco of [
      'POST /v1/manifestos/:id/submit',
      'POST /v1/maintenance/cleanup',
      'GET /v1/manifestos',
      'POST /health/maintenance/cleanup',
      'GET /health',
      'GET /v1/ping'
    ]) {
      assert.ok(paths.has(marco), `o enumerador perdeu ${marco}`);
    }

    // A allowlist não pode conter caminho fantasma: uma entrada que não casa rota nenhuma isentaria
    // silenciosamente nada — ou, pior, esconderia um typo que deixou a rota real de fora da conta.
    for (const entry of PUBLIC_ROUTES.keys()) {
      assert.ok(paths.has(entry), `allowlist cita ${entry}, que não existe no router`);
    }
  });

  it('toda rota fora da allowlist responde 401 sem Authorization', async () => {
    const vazando = [];

    for (const route of allRoutes) {
      const key = `${route.method} ${route.path}`;
      if (PUBLIC_ROUTES.has(key)) continue;

      const response = await fetch(`${API_BASE}${fillParams(route.path)}`, {
        method: route.method,
        headers: { 'Content-Type': 'application/json' },
        body: ['GET', 'DELETE', 'HEAD'].includes(route.method) ? undefined : '{}'
      });

      if (response.status !== 401) vazando.push(`${key} -> ${response.status}`);
      // Drena o corpo para não deixar sockets pendurados entre iterações.
      await response.arrayBuffer().catch(() => {});
    }

    assert.deepStrictEqual(vazando, [], `rotas sem gate de auth:\n${vazando.join('\n')}`);
  });

  it('a documentação do contrato (/openapi.* e /docs, inclusive assets) exige Bearer', async () => {
    const vazando = [];

    for (const routePath of ['/openapi.yaml', '/openapi.json', ...DOCS_PATHS]) {
      const response = await fetch(`${API_BASE}${routePath}`, { redirect: 'manual' });
      if (response.status !== 401) vazando.push(`GET ${routePath} -> ${response.status}`);
      await response.arrayBuffer().catch(() => {});
    }

    assert.deepStrictEqual(
      vazando,
      [],
      `contrato interno servido sem credencial:\n${vazando.join('\n')}`
    );
  });

  it('CONTROLE NEGATIVO: rota pública continua respondendo sem token', async () => {
    // Se isto também desse 401, o teste acima passaria por um motivo errado (app quebrada).
    for (const key of ['GET /health', 'GET /v1/ping']) {
      const [method, routePath] = key.split(' ');
      const response = await fetch(`${API_BASE}${routePath}`, { method });
      assert.notStrictEqual(response.status, 401, `${key} deveria ser público`);
      assert.strictEqual(response.status, 200, `${key} deveria responder 200`);
      await response.arrayBuffer().catch(() => {});
    }

    // O login público responde 400/401-de-negócio, nunca o 401 do gate — o corpo vazio é inválido,
    // mas a requisição CHEGA ao handler.
    const login = await fetch(`${API_BASE}/v1/sicat/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{}'
    });
    assert.ok(login.status >= 400, 'corpo vazio no login deve falhar');
    const problem = await login.json().catch(() => ({}));
    assert.notStrictEqual(
      problem?.detail,
      'Missing or invalid Authorization header. Expected SICAT Bearer token.',
      'o login público não pode estar barrado pelo gate de Bearer'
    );
  });

  it('CONTROLE NEGATIVO: com token válido as rotas fechadas NÃO respondem 401', async () => {
    // Prova que fechar não foi "derrubar": o gate deixa passar quem tem credencial. Sem esta metade,
    // um middleware que respondesse 401 para todo mundo passaria no teste principal.
    const token = createTestAccessToken();
    const barradas = [];

    // Amostra deliberadamente SEM as rotas destrutivas (`*/maintenance/cleanup`): com token elas
    // executariam de verdade contra o banco de teste. O `POST .../submit` entra porque o `:id`
    // sintético morre em 404 — prova que passou do gate sem enfileirar nada na CETESB.
    const amostra = [
      'GET /v1/manifestos',
      'POST /v1/manifestos/:id/submit',
      'GET /v1/cdf/certificates',
      'GET /v1/health/jobs/dlq',
      'GET /v1/health/system',
      'GET /v1/dmr',
      'GET /v1/mtr-provisorio',
      'GET /v1/auth/partner-info',
      'GET /v1/reports/mtrs',
      'GET /health/jobs/dlq',
      // As três recém-fechadas: sem esta metade, "fechar a documentação" poderia ter sido
      // "quebrar a documentação" e nenhum teste veria diferença.
      'GET /openapi.yaml',
      'GET /openapi.json',
      'GET /docs/'
    ];

    for (const key of amostra) {
      if (SKIP_WITH_TOKEN.has(key)) continue;
      const [method, routePath] = key.split(' ');
      const response = await fetch(`${API_BASE}${fillParams(routePath)}`, {
        method,
        redirect: 'manual',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: method === 'GET' ? undefined : '{}'
      });

      if (response.status === 401) barradas.push(`${key} -> 401 mesmo com token válido`);
      await response.arrayBuffer().catch(() => {});
    }

    assert.deepStrictEqual(barradas, [], barradas.join('\n'));
  });
});
