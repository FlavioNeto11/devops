// =============================================================================
// scaffold-compile.test.mjs — GATE SEMÂNTICO da convergência scaffold -> compilador
// (Forja 4.0 — B6/convergência). Scaffolda produtos de TESTE em diretório temporário
// e verifica que os manifests COMPILADOS (devops.yaml v2 -> devops-compile.mjs ->
// chart app-template) preservam os INVARIANTES que o buildK8s()/dep() aposentado garantia:
//   * nomes de recurso <app>-<svc> (Deployments/Services/PVC/IngressRoute)
//   * label app.kubernetes.io/part-of em TODO recurso (contrato do Console)
//   * selectors na CONVENÇÃO VIVA: matchLabels EXATAMENTE
//     { app.kubernetes.io/name: <app>-<svc> } (spec.selector é IMUTÁVEL no
//     apiserver — o chart adota a convenção dos produtos vivos, §11.5)
//   * PVC de dependência <app>-<dep> (SEM -data) e Middleware <app>-<svc>-strip
//     — idênticos aos vivos (rename de PVC = perda de dados via prune)
//   * IngressRoutes na convenção viva: api/api2 em "<app>", frontend em
//     "<app>-frontend" (a rota -frontend NUNCA é consolidada/podada)
//   * portas, envFrom (com Secrets opcionais -ai/-auth), env, command, Recreate
//   * roteamento: PathPrefix(<base>/api) priority 40 + StripPrefix COMPLETO
//   * suplementos: observabilidade (ServiceMonitor/PrometheusRule/*-metrics) e
//     SSO de borda (rota sombra priority 41, bloco oidc-sessao)
//
// DELTAS DELIBERADOS vs o buildK8s antigo (documentados em
// docs/new-project-contract.md §11.5 — aceitáveis, NÃO tocam recurso stateful
// nem selector: a convergência v1 -> v2 de produto vivo fica DESBLOQUEADA):
//   * worker não ganha Service próprio (métricas via <app>-worker-metrics)
//   * resources/probes ADICIONADOS em tudo; Host() na match das rotas
//   * ConfigMaps novos <app>-meta e <app>-healthchecks
//
// Requer helm no PATH (pulado sem ele — mesmo padrão do devops-compile.test.mjs).
// =============================================================================
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import {
  parseContract,
  contractVersion,
  validateContract,
  parseDocs,
  checkRendered,
  helmAvailable,
} from '../tools/devops-compile.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const hasHelm = helmAvailable();
const skip = !hasHelm && 'helm indisponível no PATH (o scaffold compila o k8s pelo chart)';

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------
function scaffold(script, productJson, extraRuns = []) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'forge-parity-'));
  const productsDir = path.join(tmp, 'products');
  const dest = path.join(tmp, 'apps');
  fs.mkdirSync(path.join(productsDir, productJson.name), { recursive: true });
  fs.writeFileSync(path.join(productsDir, productJson.name, 'product.json'), JSON.stringify(productJson, null, 2));
  const run = (s) =>
    spawnSync(process.execPath, [path.join(__dirname, s), '--product', productJson.name, '--products-dir', productsDir, '--dest', dest], {
      encoding: 'utf8',
      maxBuffer: 16 * 1024 * 1024,
    });
  const results = [run(script), ...extraRuns.map(run)];
  return { tmp, appDir: path.join(dest, productJson.name), results };
}

function loadApp(appDir, name) {
  const contract = parseContract(fs.readFileSync(path.join(appDir, 'devops.yaml'), 'utf8'));
  const rendered = fs.readFileSync(path.join(appDir, 'k8s', `${name}.yaml`), 'utf8');
  const docs = parseDocs(rendered).map((d) => d.obj);
  return { contract, rendered, docs };
}

const byKind = (docs, kind) => docs.filter((d) => d.kind === kind);
const named = (docs, kind, name) => byKind(docs, kind).find((d) => d.metadata?.name === name);

// selector ⊆ labels (todo par do selector existe nos labels alvo)
function selects(selector, labels) {
  return Object.entries(selector || {}).every(([k, v]) => labels?.[k] === v);
}

function assertSelectorsConsistent(docs, appName) {
  for (const dep of byKind(docs, 'Deployment')) {
    const sel = dep.spec.selector.matchLabels;
    const podLabels = dep.spec.template.metadata.labels;
    // Convenção VIVA (campo imutável): selector EXATAMENTE { name: <app>-<svc> } —
    // sem part-of no selector (adicionar chave também é mutação de campo imutável).
    assert.deepEqual(sel, { 'app.kubernetes.io/name': dep.metadata.name },
      `Deployment/${dep.metadata.name}: selector fora da convenção viva`);
    assert.ok(selects(sel, podLabels), `Deployment/${dep.metadata.name}: selector não casa os próprios pods`);
    assert.equal(podLabels['app.kubernetes.io/part-of'], appName, `Deployment/${dep.metadata.name}: pods sem part-of`);
    const svc = named(docs, 'Service', dep.metadata.name);
    if (svc) assert.ok(selects(svc.spec.selector, podLabels), `Service/${svc.metadata.name}: selector não casa os pods do Deployment homônimo`);
  }
}

// ---------------------------------------------------------------------------
// gymops-style (redis-bullmq + rbac-multitenant => worker, redis, contas, oidc)
// ---------------------------------------------------------------------------
test('scaffold-gymops: devops.yaml v2 + k8s compilado preservam os invariantes do buildK8s', { skip }, (t) => {
  const name = 'parity-gym';
  const { tmp, appDir, results } = scaffold('scaffold-gymops.mjs', {
    name,
    display_name: 'Parity Gym',
    base_path: `/${name}`,
    stack: 'gymops',
    interfaces: ['api', 'web'],
    capability_blocks: ['redis-bullmq', 'rbac-multitenant'],
  }, ['scaffold-frontend.mjs']);
  t.after(() => fs.rmSync(tmp, { recursive: true, force: true }));
  for (const r of results) assert.equal(r.status, 0, `scaffold falhou:\n${r.stdout}\n${r.stderr}`);

  const { contract, rendered, docs } = loadApp(appDir, name);

  // contrato: v2 VÁLIDO contra o schema (inclusive após o append do frontend)
  assert.equal(contractVersion(contract), 2);
  const v = validateContract(contract);
  assert.equal(v.valid, true, JSON.stringify(v.errors?.slice(0, 5)));

  // gate do próprio compilador (labels part-of, resources, Host()+PathPrefix, priorities, strip)
  assert.deepEqual(checkRendered(rendered, contract), []);

  // nomes <app>-<svc> — mesmo conjunto de unidades que o buildK8s antigo gerava
  const deployNames = byKind(docs, 'Deployment').map((d) => d.metadata.name).sort();
  assert.deepEqual(deployNames, [`${name}-api`, `${name}-frontend`, `${name}-postgres`, `${name}-redis`, `${name}-worker`]);
  for (const svc of ['api', 'frontend', 'postgres', 'redis']) assert.ok(named(docs, 'Service', `${name}-${svc}`), `Service/${name}-${svc} ausente`);
  // DELTA deliberado: worker sem Service próprio (métricas via Service suplementar *-metrics)
  assert.equal(named(docs, 'Service', `${name}-worker`), undefined);

  // part-of em TODO recurso + selectors internamente consistentes
  for (const d of docs) assert.equal(d.metadata.labels['app.kubernetes.io/part-of'], name, `${d.kind}/${d.metadata.name} sem part-of`);
  assertSelectorsConsistent(docs, name);

  // api: imagem :local, envFrom com -db obrigatório e -ai/-auth OPCIONAIS (paridade com o antigo)
  const api = named(docs, 'Deployment', `${name}-api`).spec.template.spec.containers[0];
  assert.equal(api.image, `${name}-api:local`);
  assert.deepEqual(api.envFrom, [
    { secretRef: { name: `${name}-db` } },
    { secretRef: { name: `${name}-ai`, optional: true } },
    { secretRef: { name: `${name}-auth`, optional: true } },
  ]);
  const envMap = Object.fromEntries((api.env || []).map((e) => [e.name, e.value]));
  assert.equal(envMap.REDIS_URL, `redis://${name}-redis:6379`);
  assert.equal(envMap.METRICS_PORT, '9464');
  assert.equal(envMap.AUTO_MIGRATE, 'true');
  assert.equal(envMap.AUTO_SEED, 'true');

  // worker: mesma imagem da api + command do modo worker + AUTO_MIGRATE false
  const worker = named(docs, 'Deployment', `${name}-worker`).spec.template.spec.containers[0];
  assert.equal(worker.image, `${name}-api:local`);
  assert.deepEqual(worker.command, ['npm', 'run', 'worker']);
  assert.equal(Object.fromEntries(worker.env.map((e) => [e.name, e.value])).AUTO_MIGRATE, 'false');

  // dependências: Recreate + PVC <app>-<dep> (MESMO nome do vivo — sem -data)
  const pg = named(docs, 'Deployment', `${name}-postgres`);
  assert.equal(pg.spec.strategy.type, 'Recreate');
  assert.equal(pg.spec.template.spec.containers[0].image, 'postgres:16-alpine');
  assert.ok(named(docs, 'PersistentVolumeClaim', `${name}-postgres`), 'PVC do postgres ausente');
  assert.equal(named(docs, 'PersistentVolumeClaim', `${name}-postgres-data`), undefined, 'PVC não pode ter sufixo -data (convenção viva)');
  assert.equal(named(docs, 'Deployment', `${name}-redis`).spec.template.spec.containers[0].image, 'redis:7-alpine');

  // roteamento (convenção viva): api priority 40 com strip COMPLETO na IngressRoute
  // "<app>"; frontend priority 10 sem strip na IngressRoute PRÓPRIA "<app>-frontend"
  const ir = named(docs, 'IngressRoute', name);
  const apiRoute = ir.spec.routes.find((r) => r.match.includes(`PathPrefix(\`/${name}/api\`)`));
  assert.equal(apiRoute.priority, 40);
  assert.deepEqual(apiRoute.middlewares, [{ name: `${name}-api-strip` }]);
  const irFe = named(docs, 'IngressRoute', `${name}-frontend`);
  assert.ok(irFe, `IngressRoute/${name}-frontend ausente (rota do frontend é PRÓPRIA — não pode ser consolidada)`);
  const feRoute = irFe.spec.routes.find((r) => r.match.endsWith(`PathPrefix(\`/${name}\`)`));
  assert.equal(feRoute.priority, 10);
  assert.equal(feRoute.middlewares, undefined);
  assert.deepEqual(named(docs, 'Middleware', `${name}-api-strip`).spec.stripPrefix.prefixes, [`/${name}/api`]);

  // NENHUM Secret no artefato commitado (hard-constraints §3)
  assert.equal(byKind(docs, 'Secret').length, 0);

  // suplemento de observabilidade: ServiceMonitor + PrometheusRule + Services *-metrics
  const obs = parseDocs(fs.readFileSync(path.join(appDir, 'k8s', `${name}-observability.yaml`), 'utf8')).map((d) => d.obj);
  const sm = named(obs, 'ServiceMonitor', name);
  assert.deepEqual(sm.spec.selector.matchLabels, { 'app.kubernetes.io/part-of': name });
  assert.equal(sm.spec.endpoints[0].port, 'metrics');
  assert.ok(named(obs, 'PrometheusRule', `${name}-slo`));
  for (const svc of ['api', 'worker']) {
    const ms = named(obs, 'Service', `${name}-${svc}-metrics`);
    assert.ok(ms, `Service/${name}-${svc}-metrics ausente`);
    assert.equal(ms.spec.ports[0].port, 9464);
    // o Service de métricas precisa selecionar os pods COMPILADOS (selector do chart)
    const podLabels = named(docs, 'Deployment', `${name}-${svc}`).spec.template.metadata.labels;
    assert.ok(selects(ms.spec.selector, podLabels), `Service/${name}-${svc}-metrics não seleciona os pods compilados`);
  }

  // suplemento SSO (bloco oidc-sessao via rbac-multitenant): rota sombra 41 > 40 com ForwardAuth
  const sso = parseDocs(fs.readFileSync(path.join(appDir, 'k8s', `${name}-sso.yaml`), 'utf8')).map((d) => d.obj);
  const ssoRoute = named(sso, 'IngressRoute', `${name}-sso`).spec.routes[0];
  assert.equal(ssoRoute.priority, 41);
  assert.ok(ssoRoute.match.includes(`PathPrefix(\`/${name}/api\`)`));
  assert.deepEqual(ssoRoute.middlewares, [
    { name: 'console-auth-401', namespace: 'devops-system' },
    { name: `${name}-api-strip` },
  ]);

  // o k8s aditivo LEGADO do frontend NÃO existe no contrato v2 (frontend entra compilado)
  assert.equal(fs.existsSync(path.join(appDir, 'k8s', `${name}-frontend.yaml`)), false);
});

// ---------------------------------------------------------------------------
// sicat-style (worker-queue-transacional + gateway-externo => worker + mock-central)
// ---------------------------------------------------------------------------
test('scaffold-sicat: devops.yaml v2 + k8s compilado preservam os invariantes do buildK8s', { skip }, (t) => {
  const name = 'parity-sic';
  const { tmp, appDir, results } = scaffold('scaffold-sicat.mjs', {
    name,
    display_name: 'Parity Sic',
    base_path: `/${name}`,
    stack: 'sicat',
    interfaces: ['api'],
    capability_blocks: ['worker-queue-transacional', 'gateway-externo'],
  });
  t.after(() => fs.rmSync(tmp, { recursive: true, force: true }));
  for (const r of results) assert.equal(r.status, 0, `scaffold falhou:\n${r.stdout}\n${r.stderr}`);

  const { contract, rendered, docs } = loadApp(appDir, name);
  assert.equal(contractVersion(contract), 2);
  assert.equal(validateContract(contract).valid, true);
  assert.deepEqual(checkRendered(rendered, contract), []);

  // unidades do buildK8s antigo: api + worker + mock-central + postgres
  const deployNames = byKind(docs, 'Deployment').map((d) => d.metadata.name).sort();
  assert.deepEqual(deployNames, [`${name}-api`, `${name}-mock-central`, `${name}-postgres`, `${name}-worker`]);
  assertSelectorsConsistent(docs, name);

  // mock-central: interno (sem rota), Service 8090 — a api fala http://<app>-mock-central:8090
  const mockSvc = named(docs, 'Service', `${name}-mock-central`);
  assert.equal(mockSvc.spec.ports[0].port, 8090);
  const ir = named(docs, 'IngressRoute', name);
  assert.equal(ir.spec.routes.length, 1, 'só a api é exposta (mock-central e worker são internos)');
  assert.equal(named(docs, 'IngressRoute', `${name}-frontend`), undefined, 'sem frontend exposto não há IngressRoute -frontend');
  const api = named(docs, 'Deployment', `${name}-api`).spec.template.spec.containers[0];
  assert.equal(Object.fromEntries(api.env.map((e) => [e.name, e.value])).EXTERNAL_BASE_URL, `http://${name}-mock-central:8090`);
  assert.deepEqual(api.envFrom, [
    { secretRef: { name: `${name}-db` } },
    { secretRef: { name: `${name}-ai`, optional: true } },
  ]);

  // observabilidade suplementar com o alerta de DLQ (worker) e métrica sanitizada (sem '-')
  const obsText = fs.readFileSync(path.join(appDir, 'k8s', `${name}-observability.yaml`), 'utf8');
  const obs = parseDocs(obsText).map((d) => d.obj);
  assert.ok(named(obs, 'Service', `${name}-worker-metrics`));
  const rules = named(obs, 'PrometheusRule', `${name}-slo`).spec.groups[0].rules;
  const dlq = rules.find((r) => r.alert === `${name}QueueDlq`);
  assert.ok(dlq, 'alerta de DLQ ausente');
  assert.match(dlq.expr, /parity_sic_queue_depth/, 'métrica Prometheus deve ser sanitizada (hífen quebra o prom-client)');
});
