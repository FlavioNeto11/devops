// =============================================================================
// devops-compile.test.mjs — testes do compilador do contrato devops.yaml v1|v2.
// Roda com: node --test specs/tools  (os testes de render usam helm quando
// disponível no PATH; sem helm são pulados, as funções puras rodam sempre).
// =============================================================================
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {
  REPO_ROOT,
  parseContract,
  contractVersion,
  validateContract,
  deriveValues,
  localImageName,
  servicePriority,
  fullPrefix,
  helmAvailable,
  renderWithHelm,
  stripSecrets,
  parseDocs,
  checkRendered,
  compileContract,
  resolveEnvironment,
  hostsFromMatch,
  defaultOutPath,
} from './devops-compile.mjs';

const read = (rel) => fs.readFileSync(path.join(REPO_ROOT, rel), 'utf8');
const loadYaml = (rel) => parseContract(read(rel));

const FIXTURE = 'apps/forge-pilot-v2/devops.yaml';
const FIXTURE_RENDERED = 'apps/forge-pilot-v2/k8s/forge-pilot-v2.yaml';
const FIXTURE_RENDERED_DEV = 'apps/forge-pilot-v2/k8s-dev/forge-pilot-v2.yaml';

// Contrato v2 mínimo para testes sintéticos.
function v2Contract(overrides = {}) {
  return {
    version: 2,
    app: { name: 'demo', namespace: 'apps', host: 'nvit.localhost', basePath: '/demo' },
    services: {
      frontend: { type: 'frontend', image: 'demo-frontend', port: 80, expose: true, stripPrefix: false },
      api: { type: 'api', path: '/api', image: 'demo-api', port: 8080, expose: true, stripPrefix: true },
      api2: { type: 'api2', path: '/api2', image: 'demo-api2', port: 8082, expose: true, stripPrefix: true },
    },
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Schema: retrocompat v1 + v2
// ---------------------------------------------------------------------------
test('schema: contratos v1 existentes continuam VÁLIDOS (retrocompat total)', () => {
  for (const rel of ['apps/gymops/devops.yaml', 'apps/sicat/devops.yaml', 'templates/app-template/app.yaml']) {
    const contract = loadYaml(rel);
    const { valid, errors } = validateContract(contract);
    assert.equal(valid, true, `${rel} deveria ser válido: ${JSON.stringify(errors?.slice(0, 3))}`);
    assert.equal(contractVersion(contract), 1);
  }
});

test('schema: fixture v2 (forge-pilot-v2) é válida', () => {
  const contract = loadYaml(FIXTURE);
  const { valid, errors } = validateContract(contract);
  assert.equal(valid, true, JSON.stringify(errors?.slice(0, 5)));
  assert.equal(contractVersion(contract), 2);
});

test('schema: v2 com engine desconhecida é INVÁLIDA', () => {
  const bad = v2Contract({ dependencies: { db: { engine: 'cassandra' } } });
  assert.equal(validateContract(bad).valid, false);
});

test('schema: v2 exige version: 2 e rejeita campos desconhecidos', () => {
  assert.equal(validateContract(v2Contract({ version: 3 })).valid, false);
  assert.equal(validateContract(v2Contract({ unknownField: true })).valid, false);
  // environments malformado (host sem array)
  assert.equal(validateContract(v2Contract({ environments: { local: { namespace: 'apps', hosts: 'nvit.localhost' } } })).valid, false);
});

test('schema: v1 com campo version é inválido (v1 não conhece version)', () => {
  const v1 = loadYaml('templates/app-template/app.yaml');
  assert.equal(validateContract({ ...v1, version: 1 }).valid, false);
});

test('schema: engines reservadas (mongodb/nats) são válidas no schema...', () => {
  const withMongo = v2Contract({ dependencies: { db: { engine: 'mongodb' } } });
  assert.equal(validateContract(withMongo).valid, true);
});

test('...mas o compilador FALHA com erro claro (sem template ainda)', () => {
  const withMongo = v2Contract({ dependencies: { db: { engine: 'mongodb' } } });
  assert.throws(() => deriveValues(withMongo), /RESERVADA.*sem template|não tem template/i);
});

// ---------------------------------------------------------------------------
// Derivação de values (funções puras)
// ---------------------------------------------------------------------------
test('deriveValues: regra de ouro das priorities (api2 40 > api 30 > frontend 10)', () => {
  const values = deriveValues(v2Contract());
  assert.equal(values.services.frontend.priority, 10);
  assert.equal(values.services.api.priority, 30);
  assert.equal(values.services.api2.priority, 40);
});

test('deriveValues: priority explícita do contrato é preservada', () => {
  const c = v2Contract();
  c.services.api.priority = 55;
  assert.equal(deriveValues(c).services.api.priority, 55);
  assert.equal(servicePriority({ type: 'api', priority: 55 }), 55);
});

test('localImageName: imagem GHCR vira <app>-<svc> (:local)', () => {
  assert.equal(localImageName('gymops', 'ghcr.io/flavioneto11/gymops/api'), 'gymops-api');
  assert.equal(localImageName('demo', 'demo-api'), 'demo-api');
  assert.equal(localImageName('demo', 'demo-api:latest'), 'demo-api');
});

test('deriveValues: envFrom (v2) vira secretRef; sem vazamento de segredo', () => {
  const c = v2Contract();
  c.services.api.envFrom = ['demo-db', 'demo-config'];
  const values = deriveValues(c);
  assert.deepEqual(values.services.api.envFrom, [
    { secretRef: { name: 'demo-db' } },
    { secretRef: { name: 'demo-config' } },
  ]);
});

test('deriveValues: dependência postgres exige secretName (hard-constraints §3)', () => {
  const c = v2Contract({ dependencies: { postgres: { engine: 'postgres' } } });
  assert.throws(() => deriveValues(c), /secretName/);
});

test('deriveValues: dependências suportadas passam com tipos normalizados', () => {
  const c = v2Contract({
    dependencies: {
      postgres: { engine: 'postgres', flavor: 'pgvector', version: 16, storage: '2Gi', secretName: 'demo-db' },
      redis: { engine: 'redis' },
    },
  });
  const values = deriveValues(c);
  assert.equal(values.dependencies.postgres.version, '16'); // number -> string
  assert.equal(values.dependencies.postgres.flavor, 'pgvector');
  assert.equal(values.dependencies.redis.engine, 'redis');
});

test('fullPrefix: espelha o helper do chart (normaliza //)', () => {
  assert.equal(fullPrefix('/demo', '/api'), '/demo/api');
  assert.equal(fullPrefix('/demo/', '/api'), '/demo/api');
  assert.equal(fullPrefix('/demo', ''), '/demo');
});

// ---------------------------------------------------------------------------
// Multi-env OPT-IN e EFÊMERO (Forja 4.0 fase B2) — funções puras
// ---------------------------------------------------------------------------
const DEV_ENV = { dev: { namespace: 'apps-dev', hosts: ['dev-lab.nvit.localhost'] } };

test('resolveEnvironment: env dev declarado resolve namespace + hosts', () => {
  const c = v2Contract({ environments: DEV_ENV });
  const env = resolveEnvironment(c, 'dev');
  assert.deepEqual(env, { name: 'dev', namespace: 'apps-dev', hosts: ['dev-lab.nvit.localhost'] });
});

test('resolveEnvironment: sem envName retorna null (comportamento default)', () => {
  assert.equal(resolveEnvironment(v2Contract(), null), null);
});

test('resolveEnvironment: env não declarado falha com erro claro', () => {
  const c = v2Contract({ environments: DEV_ENV });
  assert.throws(() => resolveEnvironment(c, 'staging'), /não declarado.*dev/);
  assert.throws(() => resolveEnvironment(v2Contract(), 'dev'), /não declarado/);
});

test('resolveEnvironment: contrato v1 não tem multi-env', () => {
  const v1 = loadYaml('templates/app-template/app.yaml');
  assert.throws(() => resolveEnvironment(v1, 'dev'), /exige contrato v2/);
});

test('resolveEnvironment: env no MESMO namespace do app é rejeitado (é o destino de produção)', () => {
  // "local" da fixture documenta o default — compilar como env separado
  // colidiria os recursos (nomes idênticos) no mesmo namespace.
  const c = v2Contract({ environments: { local: { namespace: 'apps', hosts: ['nvit.localhost'] } } });
  assert.throws(() => resolveEnvironment(c, 'local'), /MESMO namespace.*compile SEM --env/s);
});

test('resolveEnvironment: HARD — host de produção NUNCA é reatribuído a um env', () => {
  // dev.nvit.com.br é o host de produção VIVO (Keycloak/Argo/túnel Cloudflare).
  const hijackReal = v2Contract({ environments: { dev: { namespace: 'apps-dev', hosts: ['dev.nvit.com.br'] } } });
  assert.throws(() => resolveEnvironment(hijackReal, 'dev'), /host de PRODUÇÃO/);
  const hijackLocal = v2Contract({ environments: { dev: { namespace: 'apps-dev', hosts: ['dev-lab.nvit.localhost', 'nvit.localhost'] } } });
  assert.throws(() => resolveEnvironment(hijackLocal, 'dev'), /host de PRODUÇÃO/);
});

test('deriveValues com env: namespace/hosts do env, MESMO basePath, label de ambiente', () => {
  const c = v2Contract({ environments: DEV_ENV });
  const values = deriveValues(c, { env: 'dev' });
  assert.equal(values.app.namespace, 'apps-dev');
  assert.equal(values.app.host, 'dev-lab.nvit.localhost');
  assert.deepEqual(values.app.hosts, ['dev-lab.nvit.localhost']);
  assert.equal(values.app.environment, 'dev');
  assert.equal(values.app.basePath, '/demo', 'basePath NÃO muda entre envs');
  // sem env: nada de hosts/environment nos values (render default intacto)
  const plain = deriveValues(c);
  assert.equal(plain.app.namespace, 'apps');
  assert.equal(plain.app.hosts, undefined);
  assert.equal(plain.app.environment, undefined);
});

test('hostsFromMatch: extrai os hosts da cláusula Host(...)', () => {
  assert.deepEqual(hostsFromMatch('Host(`a.local`, `b.com`) && PathPrefix(`/x`)'), ['a.local', 'b.com']);
  assert.deepEqual(hostsFromMatch('PathPrefix(`/x`)'), []);
});

test('defaultOutPath: k8s/ (default) vs k8s-<env>/ (multi-env)', () => {
  const c = v2Contract();
  const base = path.join(REPO_ROOT, 'apps', 'demo', 'devops.yaml');
  assert.equal(defaultOutPath(base, c), path.join(REPO_ROOT, 'apps', 'demo', 'k8s', 'demo.yaml'));
  assert.equal(defaultOutPath(base, c, 'dev'), path.join(REPO_ROOT, 'apps', 'demo', 'k8s-dev', 'demo.yaml'));
});

test('checkRendered com env: pega dev.nvit.com.br vazando, label e namespace errados', () => {
  const contract = v2Contract({ environments: DEV_ENV });
  delete contract.services.api2;
  const bad = [
    '---',
    'kind: Deployment\nmetadata: { name: demo-frontend, namespace: apps, labels: { app.kubernetes.io/part-of: demo } }\nspec: { template: { spec: { containers: [ { name: f, resources: { requests: {}, limits: {} } } ] } } }',
    '---',
    'kind: Deployment\nmetadata: { name: demo-api, namespace: apps-dev, labels: { app.kubernetes.io/part-of: demo, devops.flavioneto/environment: dev } }\nspec: { template: { spec: { containers: [ { name: a, resources: { requests: {}, limits: {} } } ] } } }',
    '---',
    'kind: IngressRoute\nmetadata: { name: demo, namespace: apps-dev, labels: { app.kubernetes.io/part-of: demo, devops.flavioneto/environment: dev } }\nspec: { routes: [ { match: "Host(`dev-lab.nvit.localhost`, `dev.nvit.com.br`) && PathPrefix(`/demo/api`)", priority: 30, middlewares: [ { name: demo-api-stripprefix } ] }, { match: "Host(`dev-lab.nvit.localhost`) && PathPrefix(`/demo`)", priority: 10 } ] }',
    '---',
    'kind: Middleware\nmetadata: { name: demo-api-stripprefix, namespace: apps-dev, labels: { app.kubernetes.io/part-of: demo, devops.flavioneto/environment: dev } }\nspec: { stripPrefix: { prefixes: ["/demo/api"] } }',
  ].join('\n');
  const issues = checkRendered(bad, contract, { env: 'dev' });
  assert.ok(issues.some((i) => /dev\.nvit\.com\.br.*!= hosts do env/.test(i)), 'deveria acusar host de produção vazando na rota:\n' + issues.join('\n'));
  assert.ok(issues.some((i) => /demo-frontend.*label devops\.flavioneto\/environment/.test(i)), 'deveria acusar label de ambiente ausente');
  assert.ok(issues.some((i) => /demo-frontend.*namespace != "apps-dev"/.test(i)), 'deveria acusar namespace fora do env');
});

test('fixture k8s-dev COMMITADA passa em todos os invariantes (com env)', () => {
  const rendered = read(FIXTURE_RENDERED_DEV);
  const contract = loadYaml(FIXTURE);
  const issues = checkRendered(rendered, contract, { env: 'dev' });
  assert.deepEqual(issues, [], issues.join('\n'));
  const docs = parseDocs(rendered).map((d) => d.obj);
  assert.equal(docs.filter((d) => d.kind === 'Secret').length, 0, 'NENHUM Secret pode ser commitado');
  // Hosts CERTOS por env: só dev-lab.nvit.localhost — nunca dev.nvit.com.br.
  const ir = docs.find((d) => d.kind === 'IngressRoute');
  for (const r of ir.spec.routes) {
    assert.match(r.match, /Host\(`dev-lab\.nvit\.localhost`\) && PathPrefix\(/);
    assert.ok(!r.match.includes('dev.nvit.com.br'), 'host de produção NUNCA aparece no env dev');
  }
  // MESMO basePath (strip do prefixo COMPLETO, idêntico ao de produção).
  const mw = docs.find((d) => d.kind === 'Middleware');
  assert.deepEqual(mw.spec.stripPrefix.prefixes, ['/forge-pilot-v2/api']);
  // Namespace isola: nomes idênticos aos de produção, tudo em apps-dev.
  for (const d of docs) {
    assert.equal(d.metadata.namespace, 'apps-dev', `${d.kind}/${d.metadata.name} fora de apps-dev`);
    assert.equal(d.metadata.labels['devops.flavioneto/environment'], 'dev');
  }
  const prodDocs = parseDocs(read(FIXTURE_RENDERED)).map((d) => d.obj);
  assert.deepEqual(
    docs.map((d) => `${d.kind}/${d.metadata.name}`).sort(),
    prodDocs.map((d) => `${d.kind}/${d.metadata.name}`).sort(),
    'dev tem os MESMOS recursos (nomes idênticos) de produção — só o namespace muda'
  );
});

// ---------------------------------------------------------------------------
// Verificação dos manifests renderizados
// ---------------------------------------------------------------------------
test('checkRendered: fixture COMMITADA passa em todos os invariantes', () => {
  const rendered = read(FIXTURE_RENDERED);
  const contract = loadYaml(FIXTURE);
  const issues = checkRendered(rendered, contract);
  assert.deepEqual(issues, [], issues.join('\n'));
});

test('fixture commitada: sem Secret, com Host()+PathPrefix e strip completo', () => {
  const rendered = read(FIXTURE_RENDERED);
  const docs = parseDocs(rendered).map((d) => d.obj);
  assert.equal(docs.filter((d) => d.kind === 'Secret').length, 0, 'NENHUM Secret pode ser commitado');
  const ir = docs.find((d) => d.kind === 'IngressRoute');
  for (const r of ir.spec.routes) {
    assert.match(r.match, /Host\(`nvit\.localhost`, `dev\.nvit\.com\.br`\) && PathPrefix\(/);
  }
  const mw = docs.find((d) => d.kind === 'Middleware');
  assert.deepEqual(mw.spec.stripPrefix.prefixes, ['/forge-pilot-v2/api']);
  // dependências: Recreate + PVC + resources default do incidente OOM
  const pg = docs.find((d) => d.kind === 'Deployment' && d.metadata.name === 'forge-pilot-v2-postgres');
  assert.equal(pg.spec.strategy.type, 'Recreate');
  assert.equal(pg.spec.template.spec.containers[0].image, 'pgvector/pgvector:pg16');
  assert.equal(pg.spec.template.spec.containers[0].resources.limits.memory, '1Gi');
});

test('checkRendered: pega container sem resources e strip incompleto', () => {
  const contract = v2Contract();
  delete contract.services.api2;
  const bad = [
    '---',
    'apiVersion: apps/v1',
    'kind: Deployment',
    'metadata: { name: demo-api, namespace: apps, labels: { app.kubernetes.io/part-of: demo } }',
    'spec:',
    '  template:',
    '    spec:',
    '      containers: [ { name: api, image: demo-api:local } ]',
    '---',
    'apiVersion: traefik.io/v1alpha1',
    'kind: IngressRoute',
    'metadata: { name: demo, namespace: apps, labels: { app.kubernetes.io/part-of: demo } }',
    'spec:',
    '  routes:',
    '    - { kind: Rule, match: "PathPrefix(`/demo/api`)", priority: 30, middlewares: [ { name: demo-api-stripprefix } ] }',
    '    - { kind: Rule, match: "Host(`nvit.localhost`) && PathPrefix(`/demo`)", priority: 10 }',
    '---',
    'apiVersion: traefik.io/v1alpha1',
    'kind: Middleware',
    'metadata: { name: demo-api-stripprefix, namespace: apps, labels: { app.kubernetes.io/part-of: demo } }',
    'spec: { stripPrefix: { prefixes: ["/api"] } }',
  ].join('\n');
  const issues = checkRendered(bad, contract);
  assert.ok(issues.some((i) => /sem resources/.test(i)), 'deveria acusar resources ausentes');
  assert.ok(issues.some((i) => /sem Host\(\)\+PathPrefix|rota sem Host/.test(i)), 'deveria acusar rota sem Host()');
  assert.ok(issues.some((i) => /prefixo COMPLETO/.test(i)), 'deveria acusar strip incompleto (/api em vez de /demo/api)');
  assert.ok(issues.some((i) => /Deployment\/demo-frontend ausente/.test(i)), 'deveria acusar deployment do frontend ausente');
});

test('checkRendered: pega priority invertida (api <= frontend)', () => {
  const contract = v2Contract();
  delete contract.services.api2;
  contract.services.api.priority = 5; // menor que frontend=10 — violação
  const rendered = [
    '---',
    'kind: Deployment\nmetadata: { name: demo-frontend, namespace: apps, labels: { app.kubernetes.io/part-of: demo } }\nspec: { template: { spec: { containers: [ { name: f, resources: { requests: {}, limits: {} } } ] } } }',
    '---',
    'kind: Deployment\nmetadata: { name: demo-api, namespace: apps, labels: { app.kubernetes.io/part-of: demo } }\nspec: { template: { spec: { containers: [ { name: a, resources: { requests: {}, limits: {} } } ] } } }',
    '---',
    'kind: IngressRoute\nmetadata: { name: demo, labels: { app.kubernetes.io/part-of: demo } }\nspec: { routes: [ { match: "Host(`h`) && PathPrefix(`/demo/api`)", priority: 5, middlewares: [ { name: demo-api-stripprefix } ] }, { match: "Host(`h`) && PathPrefix(`/demo`)", priority: 10 } ] }',
    '---',
    'kind: Middleware\nmetadata: { name: demo-api-stripprefix, labels: { app.kubernetes.io/part-of: demo } }\nspec: { stripPrefix: { prefixes: ["/demo/api"] } }',
  ].join('\n');
  const issues = checkRendered(rendered, contract);
  assert.ok(issues.some((i) => /api deve ser MAIOR que frontend/.test(i)), issues.join('\n'));
});

test('stripSecrets: remove documentos kind Secret do render', () => {
  const rendered = '---\nkind: Secret\nmetadata: { name: leak }\n---\nkind: ConfigMap\nmetadata: { name: ok }\n';
  const out = stripSecrets(rendered);
  assert.ok(!/kind: Secret/.test(out));
  assert.ok(/kind: ConfigMap/.test(out));
});

// ---------------------------------------------------------------------------
// Render real via helm (pulado quando helm não está no PATH)
// ---------------------------------------------------------------------------
const hasHelm = helmAvailable();

test('helm: chart renderiza contrato v2 com dependências sem erro', { skip: !hasHelm && 'helm indisponível no PATH' }, () => {
  const contract = loadYaml(FIXTURE);
  const rendered = stripSecrets(renderWithHelm(deriveValues(contract), contract.app.name));
  assert.deepEqual(checkRendered(rendered, contract), []);
});

test('helm: contrato v1 (exemplo canônico) continua renderizando', { skip: !hasHelm && 'helm indisponível no PATH' }, () => {
  const contract = loadYaml('templates/app-template/app.yaml');
  const rendered = stripSecrets(renderWithHelm(deriveValues(contract), contract.app.name));
  const issues = checkRendered(rendered, contract);
  assert.deepEqual(issues, [], issues.join('\n'));
});

test('helm: manifests commitados da fixture NÃO têm drift', { skip: !hasHelm && 'helm indisponível no PATH' }, () => {
  const { manifests } = compileContract(path.join(REPO_ROOT, FIXTURE));
  const committed = read(FIXTURE_RENDERED);
  assert.equal(committed.replaceAll('\r\n', '\n'), manifests.replaceAll('\r\n', '\n'), 'recompile: node specs/tools/devops-compile.mjs apps/forge-pilot-v2/devops.yaml');
});

test('helm: manifests commitados do env dev (k8s-dev) NÃO têm drift', { skip: !hasHelm && 'helm indisponível no PATH' }, () => {
  const { manifests, environment } = compileContract(path.join(REPO_ROOT, FIXTURE), { env: 'dev' });
  assert.equal(environment.namespace, 'apps-dev');
  const committed = read(FIXTURE_RENDERED_DEV);
  assert.equal(committed.replaceAll('\r\n', '\n'), manifests.replaceAll('\r\n', '\n'), 'recompile: node specs/tools/devops-compile.mjs apps/forge-pilot-v2/devops.yaml --env dev');
});

test('helm: compile com env inválido falha fail-closed (nada é escrito)', { skip: !hasHelm && 'helm indisponível no PATH' }, () => {
  assert.throws(() => compileContract(path.join(REPO_ROOT, FIXTURE), { env: 'staging' }), /não declarado/);
  // "local" da fixture aponta para o destino de produção — --env local é rejeitado.
  assert.throws(() => compileContract(path.join(REPO_ROOT, FIXTURE), { env: 'local' }), /MESMO namespace/);
});
