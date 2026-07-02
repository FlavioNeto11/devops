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
//   node specs/tools/devops-compile.mjs apps/<app>/devops.yaml --env dev  # multi-env
//
// Multi-env OPT-IN e EFÊMERO (Forja 4.0 fase B2): `--env <nome>` compila o
// ambiente declarado em `environments.<nome>` do contrato v2 — namespace e
// hosts do env, MESMO basePath, nomes de recursos idênticos (o namespace
// isola), label extra devops.flavioneto/environment — e escreve em
// apps/<app>/k8s-<nome>/ (separado do k8s/ de produção). Sem --env o
// comportamento é o de sempre (produção). HARD: um env efêmero NUNCA usa os
// hosts de produção (app.host / dev.nvit.com.br). Ver docs/multi-env.md.
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

// Hosts de PRODUÇÃO do host único. NUNCA reatribuídos a um ambiente efêmero:
// dev.nvit.com.br é o host de produção VIVO (IngressRoutes, issuer do Keycloak,
// URL do Argo e túnel Cloudflare apontam para ele). Um env dev usa host NOVO
// (ex.: dev-lab.nvit.localhost) — ver docs/multi-env.md.
export const PROTECTED_PROD_HOSTS = ['dev.nvit.com.br'];

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
// Multi-env (função pura — coberta por testes)
// ---------------------------------------------------------------------------

// Resolve `environments.<envName>` do contrato v2 e aplica os invariantes HARD
// do multi-env opt-in/efêmero:
//   1) exige contrato v2 com o env declarado;
//   2) o namespace do env deve ser DIFERENTE do namespace default do app —
//      os nomes dos recursos são idênticos entre envs; o namespace é o
//      isolamento (nomes iguais no mesmo namespace = conflito no Argo);
//   3) os hosts do env NUNCA incluem os hosts de produção (app.host e
//      dev.nvit.com.br) — reatribuí-los sequestraria as rotas vivas.
// Retorna { name, namespace, hosts } ou lança erro claro.
export function resolveEnvironment(contract, envName) {
  if (!envName) return null;
  if (contractVersion(contract) !== 2) {
    throw new Error(`--env ${envName}: multi-env exige contrato v2 (version: 2 + campo environments).`);
  }
  const envs = contract.environments || {};
  const env = envs[envName];
  if (!env) {
    const declared = Object.keys(envs);
    throw new Error(
      `--env ${envName}: ambiente não declarado em environments (declarados: ${declared.length ? declared.join(', ') : 'nenhum'}).`
    );
  }
  if (env.namespace === contract.app.namespace) {
    throw new Error(
      `--env ${envName}: o namespace do ambiente (${env.namespace}) é o MESMO namespace default do app — ` +
        `esse é o destino de produção; compile SEM --env. Um env efêmero exige namespace próprio (ex.: apps-dev), ` +
        `porque os nomes dos recursos são idênticos e o namespace é o isolamento.`
    );
  }
  const hosts = Array.isArray(env.hosts) ? env.hosts : [];
  const protectedHosts = new Set([contract.app.host, ...PROTECTED_PROD_HOSTS]);
  const clash = hosts.find((h) => protectedHosts.has(h));
  if (clash) {
    throw new Error(
      `--env ${envName}: o host "${clash}" é host de PRODUÇÃO (app.host/dev.nvit.com.br) e NUNCA é reatribuído ` +
        `a um ambiente efêmero — as rotas vivas seriam sequestradas. Use um host novo (ex.: dev-lab.nvit.localhost). ` +
        `Ver docs/multi-env.md.`
    );
  }
  if (!hosts.length) {
    throw new Error(`--env ${envName}: environments.${envName}.hosts vazio — declare ao menos um host próprio do ambiente.`);
  }
  return { name: envName, namespace: env.namespace, hosts: [...hosts] };
}

// Normaliza opts.env: aceita o NOME do env (string) ou o objeto já resolvido.
function normalizeEnv(contract, env) {
  if (!env) return null;
  return typeof env === 'string' ? resolveEnvironment(contract, env) : env;
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
  // Multi-env opt-in: com env resolvido, o destino físico (namespace + hosts)
  // vem de environments.<env>; basePath e nomes de recursos NÃO mudam (o
  // namespace isola). app.hosts vira a cláusula Host(...) exata do chart e
  // app.environment vira o label devops.flavioneto/environment.
  const environment = normalizeEnv(contract, opts.env);
  const values = {
    app: {
      name: app.name,
      namespace: environment ? environment.namespace : app.namespace,
      host: environment ? environment.hosts[0] : app.host,
      basePath: app.basePath,
      ...(app.appType ? { appType: app.appType } : {}),
      ...(environment ? { hosts: environment.hosts, environment: environment.name } : {}),
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
    // Campos opcionais SEMPRE presentes (null explícito quando o contrato não
    // declara): o helm faz DEEP MERGE por CAMPO dos values — se algum default
    // do chart declarar um service homônimo, o campo não setado aqui HERDARIA
    // o valor de exemplo (regressão real pega na convergência do contaviva-pro:
    // frontend herdou env VITE_BASE_PATH: /aplicacao1/ e worker herdou health
    // do exemplo do values.yaml). null APAGA a chave no merge do helm. O
    // values.yaml do chart também ficou sem services de exemplo — dupla barreira.
    const out = {
      type: svc.type,
      image: localImageName(app.name, svc.image),
      tag: opts.imageTag ?? 'local',
      expose: Boolean(svc.expose),
      stripPrefix: Boolean(svc.stripPrefix),
      path: svc.path || null,
      port: svc.port || null,
      priority: svc.expose ? servicePriority(svc) : null,
      command: svc.command || null,
      env: svc.env && Object.keys(svc.env).length ? svc.env : null,
      health: svc.health && svc.health.path ? { path: svc.health.path } : null,
      resources: svc.resources || null,
      envFrom: null,
    };
    // v2: envFrom é lista de secretNames no contrato -> secretRef no chart.
    // Item string = Secret obrigatório; item { name, optional: true } = secretRef
    // optional (o pod sobe sem o Secret — padrão dos <app>-ai/<app>-auth da Forja).
    if (version === 2 && Array.isArray(svc.envFrom) && svc.envFrom.length) {
      out.envFrom = svc.envFrom.map((e) => {
        if (typeof e === 'string') return { secretRef: { name: e } };
        return { secretRef: { name: e.name, ...(e.optional === true ? { optional: true } : {}) } };
      });
    }
    values.services[name] = out;
  }

  // Um contrato que não declara os nomes de exemplo históricos (frontend/api/
  // worker) NUNCA pode herdá-los de um default do chart — service FANTASMA
  // (ex.: frontend "aplicacao1-frontend" roteando o basePath do app). O
  // values.yaml do chart não traz mais exemplos, mas o null explícito continua
  // como barreira caso um default volte a declará-los.
  for (const k of ['frontend', 'api', 'worker']) {
    if (!(k in values.services)) values.services[k] = null;
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

// Extrai os hosts da cláusula Host(`a`, `b`) de um match do Traefik.
export function hostsFromMatch(match) {
  const m = /Host\(([^)]*)\)/.exec(String(match || ''));
  if (!m) return [];
  return [...m[1].matchAll(/`([^`]+)`/g)].map((x) => x[1]);
}

export function checkRendered(rendered, contract, opts = {}) {
  const issues = [];
  const appName = contract.app.name;
  const basePath = contract.app.basePath;
  const environment = normalizeEnv(contract, opts.env);
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

  // 2b) Multi-env: TODO recurso no namespace do env + label de ambiente.
  if (environment) {
    for (const d of docs) {
      const name = `${d.kind}/${d.metadata && d.metadata.name}`;
      const labels = (d.metadata && d.metadata.labels) || {};
      if (labels['devops.flavioneto/environment'] !== environment.name) {
        issues.push(`${name}: label devops.flavioneto/environment != "${environment.name}" (multi-env).`);
      }
      if ((d.metadata && d.metadata.namespace) !== environment.namespace) {
        issues.push(`${name}: namespace != "${environment.namespace}" (env ${environment.name}).`);
      }
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

  // 3b) Convenção VIVA de selector (spec.selector é IMUTÁVEL no apiserver —
  // qualquer desvio bloqueia a convergência v1→v2; contrato §11.5): matchLabels
  // EXATAMENTE { app.kubernetes.io/name: <nome do Deployment> } (sem part-of —
  // adicionar chave também é mutação de campo imutável). Services seguem o
  // mesmo par para selecionar os pods do Deployment homônimo.
  const NAME_LABEL = 'app.kubernetes.io/name';
  for (const d of byKind('Deployment')) {
    const name = d.metadata.name;
    const sel = d.spec?.selector?.matchLabels || {};
    const keys = Object.keys(sel);
    if (!(keys.length === 1 && sel[NAME_LABEL] === name)) {
      issues.push(`Deployment/${name}: selector ${JSON.stringify(sel)} != { "${NAME_LABEL}": "${name}" } (convenção viva; campo imutável).`);
    }
    const podLabels = d.spec?.template?.metadata?.labels || {};
    if (podLabels[NAME_LABEL] !== name) {
      issues.push(`Deployment/${name}: pods com label ${NAME_LABEL}="${podLabels[NAME_LABEL]}" (esperado "${name}").`);
    }
  }
  for (const s of byKind('Service')) {
    const sel = s.spec?.selector;
    if (!sel) continue;
    const keys = Object.keys(sel);
    if (!(keys.length === 1 && sel[NAME_LABEL] === s.metadata.name)) {
      issues.push(`Service/${s.metadata.name}: selector ${JSON.stringify(sel)} != { "${NAME_LABEL}": "${s.metadata.name}" } (convenção viva).`);
    }
  }

  // 4) Um Deployment por service do contrato
  for (const svcName of Object.keys(contract.services || {})) {
    if (!named('Deployment', `${appName}-${svcName}`)) {
      issues.push(`Deployment/${appName}-${svcName} ausente para o service "${svcName}".`);
    }
  }

  // 4b) Nenhum Deployment FANTASMA: todo Deployment renderizado corresponde a um
  // service ou dependency do contrato (pega vazamento dos defaults de exemplo do chart).
  const knownNames = new Set(
    [...Object.keys(contract.services || {}), ...Object.keys(contract.dependencies || {})].map((n) => `${appName}-${n}`)
  );
  for (const d of byKind('Deployment')) {
    if (!knownNames.has(d.metadata?.name)) {
      issues.push(`Deployment/${d.metadata?.name}: não corresponde a nenhum service/dependency do contrato (vazamento dos defaults do chart?).`);
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
      // PVC "<app>-<dep>" SEM sufixo -data: convenção viva (rename = perda de dados via prune).
      if (!named('PersistentVolumeClaim', full)) issues.push(`PVC/${full} ausente.`);
      if (!named('Service', full)) issues.push(`Service/${full} ausente.`);
      if (dep.engine === 'postgres' && dep.secretName && deploy) {
        const envFrom = deploy.spec.template.spec.containers[0]?.envFrom || [];
        if (!envFrom.some((e) => e.secretRef?.name === dep.secretName)) {
          issues.push(`Deployment/${full}: não referencia o Secret ${dep.secretName} via envFrom.`);
        }
      }
    }
  }

  // 6) Roteamento (hard-constraints §2): Host()+PathPrefix, priorities, strip.
  // Convenção VIVA de IngressRoutes (contrato §11.5): api/api2 na IngressRoute
  // "<app>"; frontend na IngressRoute "<app>-frontend" (NUNCA consolidada — a
  // rota -frontend dos produtos vivos não pode ser podada pelo Argo).
  const exposed = Object.entries(contract.services || {}).filter(([, s]) => s.expose);
  if (exposed.length) {
    // Checks por rota valem para TODAS as IngressRoutes renderizadas.
    for (const ir of byKind('IngressRoute')) {
      const irName = ir.metadata?.name;
      for (const r of ir.spec?.routes || []) {
        if (!/Host\(/.test(r.match) || !/PathPrefix\(/.test(r.match)) {
          issues.push(`IngressRoute/${irName}: rota sem Host()+PathPrefix combinados: "${r.match}".`);
        }
        if (environment) {
          // Multi-env: a cláusula Host(...) usa EXATAMENTE os hosts do env —
          // em especial, dev.nvit.com.br (produção) NUNCA vaza para o env.
          const got = hostsFromMatch(r.match);
          const want = environment.hosts;
          const missing = want.filter((h) => !got.includes(h));
          const extra = got.filter((h) => !want.includes(h));
          if (missing.length || extra.length) {
            issues.push(
              `IngressRoute/${irName}: rota "${r.match}" com hosts [${got.join(', ')}] != hosts do env ${environment.name} [${want.join(', ')}].`
            );
          }
        }
      }
    }
    const apiExposed = exposed.filter(([, s]) => s.type === 'api' || s.type === 'api2');
    const feExposed = exposed.filter(([, s]) => s.type === 'frontend');
    const irApi = named('IngressRoute', appName);
    const irFe = named('IngressRoute', `${appName}-frontend`);
    if (apiExposed.length && !irApi) issues.push(`IngressRoute/${appName} ausente (rotas de api/api2).`);
    if (feExposed.length && !irFe) issues.push(`IngressRoute/${appName}-frontend ausente (rota do frontend tem IngressRoute PRÓPRIA — convenção viva).`);
    const routeFor = (ir, prefix) => (ir?.spec?.routes || []).find((r) => r.match.includes(`PathPrefix(\`${prefix}\`)`));
    const priorities = {};
    for (const [svcName, svc] of exposed) {
      const isFrontend = svc.type === 'frontend';
      const ir = isFrontend ? irFe : irApi;
      const irName = isFrontend ? `${appName}-frontend` : appName;
      if (!ir) continue; // ausência já reportada acima
      const prefix = isFrontend ? basePath : fullPrefix(basePath, svc.path);
      const route = routeFor(ir, prefix);
      if (!route) {
        issues.push(`IngressRoute/${irName}: sem rota PathPrefix(${prefix}) para "${svcName}".`);
        continue;
      }
      priorities[svcName] = { type: svc.type, priority: route.priority };
      const expected = servicePriority(svc);
      if (route.priority !== expected) {
        issues.push(`IngressRoute/${irName}: rota de "${svcName}" com priority ${route.priority} (esperado ${expected}).`);
      }
      // Middleware "<app>-<svc>-strip" — convenção viva (antigo chart usava -stripprefix).
      const mwName = `${appName}-${svcName}-strip`;
      const hasMw = (route.middlewares || []).some((m) => m.name === mwName);
      if (svc.stripPrefix && !hasMw) issues.push(`IngressRoute/${irName}: rota de "${svcName}" sem middleware ${mwName}.`);
      if (!svc.stripPrefix && hasMw) issues.push(`IngressRoute/${irName}: rota de "${svcName}" (sem strip) com middleware de strip.`);
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
  const environment = normalizeEnv(contract, opts.env);
  const values = deriveValues(contract, { ...opts, env: environment });
  const rendered = stripSecrets(renderWithHelm(values, contract.app.name, opts.chartPath));
  const issues = checkRendered(rendered, contract, { env: environment });
  if (issues.length) {
    throw new Error(`manifests renderizados violam invariantes da plataforma:\n${issues.map((i) => `  - ${i}`).join('\n')}`);
  }
  const relContract = path.relative(REPO_ROOT, abs).replaceAll('\\', '/');
  const envFlag = environment ? ` --env ${environment.name}` : '';
  const header = [
    '# =============================================================================',
    `# GERADO por specs/tools/devops-compile.mjs a partir de ${relContract} — NÃO EDITE À MÃO.`,
    `# Recompilar:  node specs/tools/devops-compile.mjs ${relContract}${envFlag}`,
    '# Artefato PRIMÁRIO do GitOps (contrato v2): estes manifests commitados.',
    '# Chart: templates/app-template. Segredos: criados FORA do git (hard-constraints §3).',
    ...(environment
      ? [
          `# AMBIENTE: ${environment.name} — namespace ${environment.namespace}, hosts [${environment.hosts.join(', ')}].`,
          '# Multi-env OPT-IN e EFÊMERO: criar -> usar -> destruir. Ver docs/multi-env.md.',
        ]
      : []),
    '# =============================================================================',
    '',
  ].join('\n');
  return { contract, values, manifests: header + rendered, version, environment };
}

// Destino default do artefato: k8s/ (produção) ou k8s-<env>/ (multi-env).
export function defaultOutPath(contractPath, contract, envName = null) {
  const dir = envName ? `k8s-${envName}` : 'k8s';
  return path.join(path.dirname(path.resolve(contractPath)), dir, `${contract.app.name}.yaml`);
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------
const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const args = process.argv.slice(2);
  const check = args.includes('--check');
  const outFlag = args.indexOf('--out');
  const envFlag = args.indexOf('--env');
  const envName = envFlag >= 0 ? args[envFlag + 1] : null;
  // Valores de flags (--out <f>, --env <e>) não são o caminho do contrato.
  const flagValues = new Set([outFlag >= 0 ? args[outFlag + 1] : null, envName].filter(Boolean));
  const contractPath = args.find((a) => !a.startsWith('--') && !flagValues.has(a));
  if (!contractPath) {
    console.error('uso: node specs/tools/devops-compile.mjs <apps/<app>/devops.yaml> [--out <arquivo>] [--check] [--env <nome>]');
    process.exit(2);
  }
  if (envFlag >= 0 && (!envName || envName.startsWith('--'))) {
    console.error('[devops-compile] --env exige o nome do ambiente (ex.: --env dev).');
    process.exit(2);
  }
  if (!helmAvailable()) {
    console.error('[devops-compile] helm não encontrado no PATH. PowerShell: $env:Path = [Environment]::GetEnvironmentVariable(\'Path\',\'Machine\') + \';\' + [Environment]::GetEnvironmentVariable(\'Path\',\'User\')');
    process.exit(2);
  }
  try {
    const { contract, manifests, version, environment } = compileContract(contractPath, { env: envName });
    const outPath = outFlag >= 0 ? path.resolve(args[outFlag + 1]) : defaultOutPath(contractPath, contract, environment?.name);
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
      const envMsg = environment ? ` (env ${environment.name}: ns ${environment.namespace})` : '';
      console.log(`[devops-compile] contrato v${version} compilado${envMsg} -> ${path.relative(REPO_ROOT, outPath)}`);
    }
  } catch (e) {
    console.error(`[devops-compile] ERRO: ${e.message}`);
    process.exit(1);
  }
}
