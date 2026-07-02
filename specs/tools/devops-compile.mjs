#!/usr/bin/env node
// =============================================================================
// devops-compile.mjs — compilador do contrato devops.yaml (v1 | v2) -> manifests
// -----------------------------------------------------------------------------
// Fluxo:  devops.yaml -> valida contra schema/devops-schema.json (ajv)
//                     -> deriva values do chart templates/app-template
//                     -> `helm template` -> filtra Secrets (hard-constraints §3)
//                     -> checa invariantes (labels part-of, resources, Host()+
//                        PathPrefix, priorities api2>api>frontend, StripPrefix)
//                     -> escreve apps/<app>/k8s/<app>.yaml (COMMITADO no git)
//
// Decisão de arquitetura (Forja 4.0 fase B1): manifests RENDERIZADOS no git são
// o artefato primário do GitOps (nada de multi-source $values no Argo). O chart
// nunca renderiza Secret — segredos são criados imperativamente fora do git.
//
// Uso:
//   node specs/tools/devops-compile.mjs apps/<app>/devops.yaml            # compila
//   node specs/tools/devops-compile.mjs apps/<app>/devops.yaml --check    # drift
//   node specs/tools/devops-compile.mjs apps/<app>/devops.yaml --out <f>  # destino
//
// Requer: helm no PATH (PowerShell: recarregue com
//   $env:Path = [Environment]::GetEnvironmentVariable('Path','Machine') + ';' +
//               [Environment]::GetEnvironmentVariable('Path','User')  ).
// Testes: specs/tools/devops-compile.test.mjs (node --test).
// =============================================================================
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import YAML from 'yaml';
import Ajv from 'ajv';
import addFormats from 'ajv-formats';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const REPO_ROOT = path.resolve(__dirname, '..', '..');
export const SCHEMA_PATH = path.join(REPO_ROOT, 'schema', 'devops-schema.json');
export const CHART_PATH = path.join(REPO_ROOT, 'templates', 'app-template');

// Engines com template real no chart. mongodb/nats são RESERVADOS no schema
// (sem template ainda; adicionar quando houver consumidor real) — falhamos com
// erro claro em vez de renderizar nada em silêncio.
export const SUPPORTED_ENGINES = ['postgres', 'redis'];
export const RESERVED_ENGINES = ['mongodb', 'nats'];

// Regra de ouro do roteamento (hard-constraints §2): api2 > api > frontend.
export const DEFAULT_PRIORITIES = { frontend: 10, api: 30, api2: 40 };

// ---------------------------------------------------------------------------
// Parse + validação
// ---------------------------------------------------------------------------
export function parseContract(text) {
  const doc = YAML.parse(text);
  if (!doc || typeof doc !== 'object') throw new Error('devops.yaml vazio ou inválido (esperado um mapeamento YAML).');
  return doc;
}

export function contractVersion(contract) {
  return contract && contract.version === 2 ? 2 : 1;
}

export function loadSchema(schemaPath = SCHEMA_PATH) {
  return JSON.parse(fs.readFileSync(schemaPath, 'utf8'));
}

export function validateContract(contract, schema = loadSchema()) {
  const ajv = new Ajv({ allErrors: true, strict: false });
  addFormats(ajv);
  const validate = ajv.compile(schema);
  const valid = validate(contract);
  return { valid: Boolean(valid), errors: validate.errors || [] };
}

// ---------------------------------------------------------------------------
// Derivação dos values do chart (função pura — coberta por testes)
// ---------------------------------------------------------------------------

// Imagem :local do laboratório: contratos podem declarar a imagem GHCR completa
// (ex.: ghcr.io/flavioneto11/gymops/api). Para o render :local usamos
// <app>-<ultimo segmento> (gymops-api), convenção provada de sicat/gymops.
export function localImageName(appName, image) {
  if (typeof image !== 'string' || !image) return image;
  if (!image.includes('/')) return image.replace(/:.*$/, '');
  const last = image.split('/').filter(Boolean).pop().replace(/:.*$/, '');
  return `${appName}-${last}`;
}

export function servicePriority(svc) {
  if (Number.isInteger(svc.priority)) return svc.priority;
  return DEFAULT_PRIORITIES[svc.type] ?? 10;
}

// Prefixo COMPLETO de roteamento (espelha o helper app-template.fullPrefix).
export function fullPrefix(basePath, svcPath) {
  return `${basePath || '/'}${svcPath || ''}`.replaceAll('//', '/');
}

export function deriveValues(contract, opts = {}) {
  const version = contractVersion(contract);
  const app = contract.app;
  const values = {
    app: {
      name: app.name,
      namespace: app.namespace,
      host: app.host,
      basePath: app.basePath,
      ...(app.appType ? { appType: app.appType } : {}),
    },
    registry: opts.registry ?? '',
    defaults: {
      imagePullPolicy: 'IfNotPresent',
      resources: {
        requests: { cpu: '50m', memory: '64Mi' },
        limits: { cpu: '250m', memory: '256Mi' },
      },
    },
    publish: {
      commitSha: opts.commitSha ?? 'local',
      branch: opts.branch ?? 'local',
      imageTag: opts.imageTag ?? 'local',
      deployedAt: '',
      runId: '',
    },
    services: {},
  };

  for (const [name, svc] of Object.entries(contract.services || {})) {
    const out = {
      type: svc.type,
      image: localImageName(app.name, svc.image),
      tag: opts.imageTag ?? 'local',
      expose: Boolean(svc.expose),
      stripPrefix: Boolean(svc.stripPrefix),
    };
    if (svc.path) out.path = svc.path;
    if (svc.port) out.port = svc.port;
    if (svc.expose) out.priority = servicePriority(svc);
    if (svc.command) out.command = svc.command;
    if (svc.env && Object.keys(svc.env).length) out.env = svc.env;
    if (svc.health && svc.health.path) out.health = { path: svc.health.path };
    if (svc.resources) out.resources = svc.resources;
    // v2: envFrom é lista de secretNames no contrato -> secretRef no chart.
    if (version === 2 && Array.isArray(svc.envFrom) && svc.envFrom.length) {
      out.envFrom = svc.envFrom.map((n) => ({ secretRef: { name: n } }));
    }
    values.services[name] = out;
  }

  if (version === 2 && contract.dependencies) {
    values.dependencies = {};
    for (const [name, dep] of Object.entries(contract.dependencies)) {
      if (RESERVED_ENGINES.includes(dep.engine)) {
        throw new Error(
          `dependencies.${name}: engine "${dep.engine}" é RESERVADA no schema mas ainda não tem template no app-template — adicionar quando houver consumidor real.`
        );
      }
      if (!SUPPORTED_ENGINES.includes(dep.engine)) {
        throw new Error(`dependencies.${name}: engine desconhecida "${dep.engine}" (suportadas: ${SUPPORTED_ENGINES.join(', ')}).`);
      }
      if (dep.engine === 'postgres' && !dep.secretName) {
        throw new Error(`dependencies.${name}: secretName é obrigatório para engine postgres (Secret criado fora do git — hard-constraints §3).`);
      }
      const out = { engine: dep.engine };
      if (dep.flavor) out.flavor = dep.flavor;
      if (dep.version !== undefined) out.version = String(dep.version);
      if (dep.storage) out.storage = dep.storage;
      if (dep.database) out.database = dep.database;
      if (dep.secretName) out.secretName = dep.secretName;
      if (dep.resources) out.resources = dep.resources;
      values.dependencies[name] = out;
    }
  }

  return values;
}

// ---------------------------------------------------------------------------
// Render (helm) + pós-processamento
// ---------------------------------------------------------------------------
export function helmAvailable() {
  const r = spawnSync('helm', ['version', '--short'], { encoding: 'utf8', shell: process.platform === 'win32' });
  return r.status === 0;
}

export function renderWithHelm(values, releaseName, chartPath = CHART_PATH) {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'devops-compile-'));
  const valuesFile = path.join(tmpDir, 'values.yaml');
  try {
    fs.writeFileSync(valuesFile, YAML.stringify(values), 'utf8');
    const r = spawnSync('helm', ['template', releaseName, chartPath, '-f', valuesFile], {
      encoding: 'utf8',
      shell: process.platform === 'win32',
      maxBuffer: 32 * 1024 * 1024,
    });
    if (r.status !== 0) {
      throw new Error(`helm template falhou (exit ${r.status}):\n${r.stderr || r.stdout}`);
    }
    return r.stdout;
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}

export function splitDocs(rendered) {
  return String(rendered)
    .split(/^---\s*$/m)
    .map((s) => s.trim())
    .filter(Boolean);
}

export function parseDocs(rendered) {
  return splitDocs(rendered)
    .map((text) => {
      try {
        return { text, obj: YAML.parse(text) };
      } catch {
        return { text, obj: null };
      }
    })
    .filter((d) => d.obj && typeof d.obj === 'object');
}

// hard-constraints §3: NENHUM Secret no artefato commitado. O chart carrega um
// secret.example.yaml estático (placeholders) que o `helm template` emite — o
// gotcha conhecido: Secret de exemplo no path do Argo CLOBBERA o secret real.
export function stripSecrets(rendered) {
  const kept = parseDocs(rendered).filter((d) => d.obj.kind !== 'Secret');
  return kept.map((d) => `---\n${d.text}`).join('\n') + '\n';
}

// ---------------------------------------------------------------------------
// Verificação dos manifests renderizados (função pura — coberta por testes)
// ---------------------------------------------------------------------------
export function checkRendered(rendered, contract) {
  const issues = [];
  const appName = contract.app.name;
  const basePath = contract.app.basePath;
  const docs = parseDocs(rendered).map((d) => d.obj);
  const byKind = (kind) => docs.filter((d) => d.kind === kind);
  const named = (kind, name) => byKind(kind).find((d) => d.metadata && d.metadata.name === name);

  // 1) Nenhum Secret no artefato (hard-constraints §3)
  if (byKind('Secret').length) issues.push('Secret renderizado no artefato commitado (hard-constraints §3).');

  // 2) Labels part-of em TODO recurso (hard-constraints §1)
  for (const d of docs) {
    const labels = (d.metadata && d.metadata.labels) || {};
    if (labels['app.kubernetes.io/part-of'] !== appName) {
      issues.push(`${d.kind}/${d.metadata && d.metadata.name}: label app.kubernetes.io/part-of != "${appName}".`);
    }
  }

  // 3) Deployments: nome <app>-<x>, resources requests+limits em todo container
  for (const d of byKind('Deployment')) {
    const name = d.metadata.name;
    if (!name.startsWith(`${appName}-`)) issues.push(`Deployment/${name}: nome fora do padrão ${appName}-<svc>.`);
    const containers = d.spec?.template?.spec?.containers || [];
    for (const c of containers) {
      if (!c.resources || !c.resources.requests || !c.resources.limits) {
        issues.push(`Deployment/${name} container ${c.name}: sem resources.requests/limits (hard-constraints §6).`);
      }
    }
  }

  // 4) Um Deployment por service do contrato
  for (const svcName of Object.keys(contract.services || {})) {
    if (!named('Deployment', `${appName}-${svcName}`)) {
      issues.push(`Deployment/${appName}-${svcName} ausente para o service "${svcName}".`);
    }
  }

  // 5) Dependências v2: PVC + Deployment Recreate + Service
  if (contractVersion(contract) === 2) {
    for (const [depName, dep] of Object.entries(contract.dependencies || {})) {
      if (!SUPPORTED_ENGINES.includes(dep.engine)) continue;
      const full = `${appName}-${depName}`;
      const deploy = named('Deployment', full);
      if (!deploy) issues.push(`Deployment/${full} ausente para a dependência "${depName}" (${dep.engine}).`);
      else if (deploy.spec?.strategy?.type !== 'Recreate') issues.push(`Deployment/${full}: strategy != Recreate.`);
      if (!named('PersistentVolumeClaim', `${full}-data`)) issues.push(`PVC/${full}-data ausente.`);
      if (!named('Service', full)) issues.push(`Service/${full} ausente.`);
      if (dep.engine === 'postgres' && dep.secretName && deploy) {
        const envFrom = deploy.spec.template.spec.containers[0]?.envFrom || [];
        if (!envFrom.some((e) => e.secretRef?.name === dep.secretName)) {
          issues.push(`Deployment/${full}: não referencia o Secret ${dep.secretName} via envFrom.`);
        }
      }
    }
  }

  // 6) Roteamento (hard-constraints §2): Host()+PathPrefix, priorities, strip
  const exposed = Object.entries(contract.services || {}).filter(([, s]) => s.expose);
  if (exposed.length) {
    const ir = named('IngressRoute', appName);
    if (!ir) {
      issues.push(`IngressRoute/${appName} ausente.`);
    } else {
      const routes = ir.spec?.routes || [];
      for (const r of routes) {
        if (!/Host\(/.test(r.match) || !/PathPrefix\(/.test(r.match)) {
          issues.push(`IngressRoute/${appName}: rota sem Host()+PathPrefix combinados: "${r.match}".`);
        }
      }
      const routeFor = (prefix) => routes.find((r) => r.match.includes(`PathPrefix(\`${prefix}\`)`));
      const priorities = {};
      for (const [svcName, svc] of exposed) {
        const prefix = svc.type === 'frontend' ? basePath : fullPrefix(basePath, svc.path);
        const route = routeFor(prefix);
        if (!route) {
          issues.push(`IngressRoute/${appName}: sem rota PathPrefix(${prefix}) para "${svcName}".`);
          continue;
        }
        priorities[svcName] = { type: svc.type, priority: route.priority };
        const expected = servicePriority(svc);
        if (route.priority !== expected) {
          issues.push(`IngressRoute/${appName}: rota de "${svcName}" com priority ${route.priority} (esperado ${expected}).`);
        }
        const mwName = `${appName}-${svcName}-stripprefix`;
        const hasMw = (route.middlewares || []).some((m) => m.name === mwName);
        if (svc.stripPrefix && !hasMw) issues.push(`IngressRoute/${appName}: rota de "${svcName}" sem middleware ${mwName}.`);
        if (!svc.stripPrefix && hasMw) issues.push(`IngressRoute/${appName}: rota de "${svcName}" (sem strip) com middleware de strip.`);
        if (svc.stripPrefix) {
          const mw = named('Middleware', mwName);
          if (!mw) issues.push(`Middleware/${mwName} ausente.`);
          else {
            const prefixes = mw.spec?.stripPrefix?.prefixes || [];
            if (!(prefixes.length === 1 && prefixes[0] === prefix)) {
              issues.push(`Middleware/${mwName}: prefixes ${JSON.stringify(prefixes)} != ["${prefix}"] (strip do prefixo COMPLETO).`);
            }
          }
        }
      }
      // api2 > api > frontend
      const p = (t) => Object.values(priorities).filter((x) => x.type === t).map((x) => x.priority);
      const maxOr = (arr, v) => (arr.length ? Math.max(...arr) : v);
      const minOr = (arr, v) => (arr.length ? Math.min(...arr) : v);
      if (p('api').length && p('frontend').length && minOr(p('api'), 0) <= maxOr(p('frontend'), 0)) {
        issues.push('priorities: api deve ser MAIOR que frontend.');
      }
      if (p('api2').length && p('api').length && minOr(p('api2'), 0) <= maxOr(p('api'), 0)) {
        issues.push('priorities: api2 deve ser MAIOR que api.');
      }
    }
  }

  return issues;
}

// ---------------------------------------------------------------------------
// Compilação ponta-a-ponta
// ---------------------------------------------------------------------------
export function compileContract(contractPath, opts = {}) {
  const abs = path.resolve(contractPath);
  const contract = parseContract(fs.readFileSync(abs, 'utf8'));
  const { valid, errors } = validateContract(contract);
  if (!valid) {
    const msgs = errors.slice(0, 12).map((e) => `  - ${e.instancePath || '/'} ${e.message}`).join('\n');
    throw new Error(`devops.yaml inválido contra schema/devops-schema.json:\n${msgs}`);
  }
  const version = contractVersion(contract);
  if (version === 1 && contract.dependencies) {
    console.warn('[devops-compile] AVISO: dependencies no contrato v1 são legadas/informativas — o provisioning real exige version: 2.');
  }
  const values = deriveValues(contract, opts);
  const rendered = stripSecrets(renderWithHelm(values, contract.app.name, opts.chartPath));
  const issues = checkRendered(rendered, contract);
  if (issues.length) {
    throw new Error(`manifests renderizados violam invariantes da plataforma:\n${issues.map((i) => `  - ${i}`).join('\n')}`);
  }
  const relContract = path.relative(REPO_ROOT, abs).replaceAll('\\', '/');
  const header = [
    '# =============================================================================',
    `# GERADO por specs/tools/devops-compile.mjs a partir de ${relContract} — NÃO EDITE À MÃO.`,
    `# Recompilar:  node specs/tools/devops-compile.mjs ${relContract}`,
    '# Artefato PRIMÁRIO do GitOps (contrato v2): estes manifests commitados.',
    '# Chart: templates/app-template. Segredos: criados FORA do git (hard-constraints §3).',
    '# =============================================================================',
    '',
  ].join('\n');
  return { contract, values, manifests: header + rendered, version };
}

export function defaultOutPath(contractPath, contract) {
  return path.join(path.dirname(path.resolve(contractPath)), 'k8s', `${contract.app.name}.yaml`);
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------
const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const args = process.argv.slice(2);
  const contractPath = args.find((a) => !a.startsWith('--'));
  const check = args.includes('--check');
  const outFlag = args.indexOf('--out');
  if (!contractPath) {
    console.error('uso: node specs/tools/devops-compile.mjs <apps/<app>/devops.yaml> [--out <arquivo>] [--check]');
    process.exit(2);
  }
  if (!helmAvailable()) {
    console.error('[devops-compile] helm não encontrado no PATH. PowerShell: $env:Path = [Environment]::GetEnvironmentVariable(\'Path\',\'Machine\') + \';\' + [Environment]::GetEnvironmentVariable(\'Path\',\'User\')');
    process.exit(2);
  }
  try {
    const { contract, manifests, version } = compileContract(contractPath);
    const outPath = outFlag >= 0 ? path.resolve(args[outFlag + 1]) : defaultOutPath(contractPath, contract);
    if (check) {
      const current = fs.existsSync(outPath) ? fs.readFileSync(outPath, 'utf8') : '';
      if (current.replaceAll('\r\n', '\n') !== manifests.replaceAll('\r\n', '\n')) {
        console.error(`[devops-compile] DRIFT: ${path.relative(REPO_ROOT, outPath)} está desatualizado em relação ao devops.yaml. Recompile e commite.`);
        process.exit(1);
      }
      console.log(`[devops-compile] OK (sem drift): ${path.relative(REPO_ROOT, outPath)}`);
    } else {
      fs.mkdirSync(path.dirname(outPath), { recursive: true });
      fs.writeFileSync(outPath, manifests, 'utf8');
      console.log(`[devops-compile] contrato v${version} compilado -> ${path.relative(REPO_ROOT, outPath)}`);
    }
  } catch (e) {
    console.error(`[devops-compile] ERRO: ${e.message}`);
    process.exit(1);
  }
}
