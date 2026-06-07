'use strict';

/**
 * index.js
 * --------
 * Servidor HTTP do DevOps Console (backend SOMENTE LEITURA).
 *
 * Expoe uma API REST + um stream SSE que consultam o cluster Kubernetes local
 * (docker-desktop) para alimentar o frontend React do Console.
 *
 * Roteamento na plataforma:
 *  - O Console backend e publicado em /devops/api atraves do Traefik com um
 *    Middleware StripPrefix que remove o prefixo COMPLETO (/devops/api). Por
 *    isso, dentro do container as rotas chegam na RAIZ (ex.: GET /pods).
 *  - Para funcionar tanto atras do strip quanto em desenvolvimento direto
 *    (chamando /api/...), o MESMO router e montado em '/' e em '/api'.
 *
 * Seguranca: apenas verbos get/list/watch sao usados. O ServiceAccount
 * associado (devops-system) possui ClusterRole restrito a leitura, entao
 * qualquer tentativa de escrita falharia de qualquer forma. Aqui nao ha
 * nenhuma chamada de escrita.
 */

const express = require('express');
const cors = require('cors');

const {
  coreV1Api,
  appsV1Api,
  customObjectsApi,
  TRAEFIK_GROUP,
  TRAEFIK_VERSION,
  TRAEFIK_INGRESSROUTE_PLURAL,
} = require('./k8s');

// ---------------------------------------------------------------------------
// Constantes de configuracao
// ---------------------------------------------------------------------------

// Porta padrao do backend (alinhada ao Dockerfile e ao Service ClusterIP).
const PORT = process.env.PORT || 3001;

// Intervalo (ms) entre snapshots enviados pelo stream SSE.
const STREAM_INTERVAL_MS = 4000;

// Numero padrao de eventos retornados nas rotas que limitam por quantidade.
const DEFAULT_EVENTS_LIMIT = 50;

// Numero de linhas de log retornadas por padrao em /pods/:ns/:name/logs.
const DEFAULT_LOG_TAIL_LINES = 200;

// Namespaces inspecionados pela rota /publications (onde as apps sao implantadas
// pela plataforma, mais o namespace de sistema do proprio Console).
const PUBLICATION_NAMESPACES = ['apps', 'apps-dev', 'apps-prod-local', 'devops-system'];

// Prefixo de annotations usado pelo pipeline da plataforma para registrar
// metadados de publicacao nos Deployments.
const PUBLICATION_ANNOTATION_PREFIX = 'devops.flavioneto/';

// Labels usadas para agrupar recursos por aplicacao na rota /apps.
const LABEL_PART_OF = 'app.kubernetes.io/part-of';
const LABEL_DEVOPS_APP = 'devops.flavioneto/app';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Normaliza a resposta do @kubernetes/client-node.
 * Dependendo da versao/metodo, o objeto util pode estar em `res.body` ou ser
 * o proprio `res`. Este helper devolve sempre o payload util.
 */
function unwrap(res) {
  if (res && typeof res === 'object' && 'body' in res) {
    return res.body;
  }
  return res;
}

/**
 * Extrai uma mensagem de erro legivel de uma falha do cliente Kubernetes.
 * A lib costuma anexar o corpo da resposta em err.body.
 */
function describeK8sError(err) {
  if (!err) return 'Erro desconhecido.';
  if (err.body) {
    if (typeof err.body === 'string') return err.body;
    if (err.body.message) return err.body.message;
    try {
      return JSON.stringify(err.body);
    } catch (_) {
      /* ignora erro de serializacao */
    }
  }
  return err.message || String(err);
}

/**
 * Calcula o codigo HTTP a devolver a partir de um erro do cliente Kubernetes.
 * Se o cluster respondeu com um status (ex.: 403, 404), repassa-o; caso
 * contrario usa 500. (O contrato pede 500 para erros de K8s; mantemos os
 * status 4xx vindos da API por serem mais informativos quando existem.)
 */
function statusFromK8sError(err) {
  const code = err && (err.statusCode || (err.response && err.response.statusCode));
  if (typeof code === 'number' && code >= 400 && code < 600) {
    return code;
  }
  return 500;
}

/**
 * Wrapper para handlers assincronos: captura excecoes e responde em JSON.
 * Erros do K8s viram resposta de erro (>= 500 por padrao) com mensagem JSON.
 */
function asyncHandler(fn) {
  return async (req, res) => {
    try {
      await fn(req, res);
    } catch (err) {
      const status = statusFromK8sError(err);
      const message = describeK8sError(err);
      console.error(`[api] ${req.method} ${req.originalUrl} -> ${status}: ${message}`);
      res.status(status).json({ error: message, status });
    }
  };
}

/**
 * Calcula a "idade" humana (ex.: "3d", "5h", "12m", "30s") a partir de um
 * timestamp ISO. Retorna null se a data nao existir.
 */
function ageFrom(isoTimestamp) {
  if (!isoTimestamp) return null;
  const start = new Date(isoTimestamp).getTime();
  if (Number.isNaN(start)) return null;
  let seconds = Math.max(0, Math.floor((Date.now() - start) / 1000));
  const days = Math.floor(seconds / 86400);
  seconds -= days * 86400;
  const hours = Math.floor(seconds / 3600);
  seconds -= hours * 3600;
  const minutes = Math.floor(seconds / 60);
  seconds -= minutes * 60;
  if (days > 0) return `${days}d${hours > 0 ? hours + 'h' : ''}`;
  if (hours > 0) return `${hours}h${minutes > 0 ? minutes + 'm' : ''}`;
  if (minutes > 0) return `${minutes}m`;
  return `${seconds}s`;
}

/**
 * Resolve a imagem "atual" de um Pod. Prefere o status (imagem realmente em
 * execucao) e cai para a spec quando o status ainda nao reportou.
 */
function currentPodImage(pod) {
  const statuses = (pod.status && pod.status.containerStatuses) || [];
  if (statuses.length > 0 && statuses[0].image) {
    // Junta as imagens de todos os containers (geralmente 1).
    return statuses.map((s) => s.image).join(', ');
  }
  const specContainers = (pod.spec && pod.spec.containers) || [];
  if (specContainers.length > 0) {
    return specContainers.map((c) => c.image).join(', ');
  }
  return null;
}

/**
 * Soma o numero total de restarts de todos os containers de um Pod.
 */
function totalRestartCount(pod) {
  const statuses = (pod.status && pod.status.containerStatuses) || [];
  return statuses.reduce((acc, s) => acc + (s.restartCount || 0), 0);
}

/**
 * Determina prontidao (readiness) de um Pod: "x/y" containers prontos e um
 * booleano `ready` indicando se todos estao prontos.
 */
function podReadiness(pod) {
  const statuses = (pod.status && pod.status.containerStatuses) || [];
  const total = statuses.length;
  const ready = statuses.filter((s) => s.ready).length;
  return {
    ready: total > 0 ? ready === total : false,
    readyContainers: ready,
    totalContainers: total,
    text: `${ready}/${total}`,
  };
}

/**
 * Converte um objeto V1Pod cru no resumo enxuto consumido pelo frontend.
 */
function summarizePod(pod) {
  const meta = pod.metadata || {};
  const spec = pod.spec || {};
  const status = pod.status || {};
  const startTime = status.startTime || meta.creationTimestamp || null;
  return {
    name: meta.name,
    namespace: meta.namespace,
    phase: status.phase || 'Unknown',
    restartCount: totalRestartCount(pod),
    image: currentPodImage(pod),
    startTime,
    age: ageFrom(startTime),
    node: spec.nodeName || null,
    readiness: podReadiness(pod),
    labels: meta.labels || {},
  };
}

/**
 * Converte um objeto V1Deployment cru no resumo consumido pelo frontend.
 */
function summarizeDeployment(dep) {
  const meta = dep.metadata || {};
  const spec = dep.spec || {};
  const status = dep.status || {};
  const containers = (spec.template && spec.template.spec && spec.template.spec.containers) || [];
  return {
    name: meta.name,
    namespace: meta.namespace,
    replicas: {
      desired: typeof spec.replicas === 'number' ? spec.replicas : 0,
      available: status.availableReplicas || 0,
      ready: status.readyReplicas || 0,
      updated: status.updatedReplicas || 0,
    },
    image: containers.length > 0 ? containers.map((c) => c.image).join(', ') : null,
    creationTimestamp: meta.creationTimestamp || null,
    age: ageFrom(meta.creationTimestamp),
    labels: meta.labels || {},
    annotations: meta.annotations || {},
  };
}

/**
 * Converte um objeto V1Service cru no resumo consumido pelo frontend.
 */
function summarizeService(svc) {
  const meta = svc.metadata || {};
  const spec = svc.spec || {};
  return {
    name: meta.name,
    namespace: meta.namespace,
    type: spec.type || 'ClusterIP',
    clusterIP: spec.clusterIP || null,
    ports: (spec.ports || []).map((p) => ({
      name: p.name || null,
      port: p.port,
      targetPort: p.targetPort,
      protocol: p.protocol || 'TCP',
    })),
    selector: spec.selector || {},
    creationTimestamp: meta.creationTimestamp || null,
    age: ageFrom(meta.creationTimestamp),
  };
}

/**
 * Extrai informacoes uteis de um IngressRoute do Traefik (objeto cru do CRD):
 * hosts, paths e services referenciados, alem das rotas brutas.
 *
 * As regras (match) do Traefik usam expressoes como:
 *   Host(`xpto.localhost`) && PathPrefix(`/devops/api`)
 * Aqui aplicamos regex simples para extrair Host(...) e PathPrefix(...).
 */
function summarizeIngressRoute(item) {
  const meta = item.metadata || {};
  const spec = item.spec || {};
  const routes = Array.isArray(spec.routes) ? spec.routes : [];

  const hosts = new Set();
  const paths = new Set();
  const services = [];

  const parsedRoutes = routes.map((route) => {
    const match = route.match || '';
    // Captura todos os Host(`...`) e PathPrefix(`...`)/Path(`...`).
    const hostMatches = [...match.matchAll(/Host\(`([^`]+)`\)/g)].map((m) => m[1]);
    const pathMatches = [...match.matchAll(/Path(?:Prefix)?\(`([^`]+)`\)/g)].map((m) => m[1]);
    hostMatches.forEach((h) => hosts.add(h));
    pathMatches.forEach((p) => paths.add(p));

    const routeServices = (route.services || []).map((s) => {
      const entry = {
        name: s.name,
        port: s.port,
        namespace: s.namespace || meta.namespace || null,
      };
      services.push(entry);
      return entry;
    });

    return {
      match,
      kind: route.kind || 'Rule',
      priority: typeof route.priority === 'number' ? route.priority : null,
      hosts: hostMatches,
      paths: pathMatches,
      middlewares: (route.middlewares || []).map((m) => m.name),
      services: routeServices,
    };
  });

  return {
    name: meta.name,
    namespace: meta.namespace,
    entryPoints: spec.entryPoints || [],
    hosts: [...hosts],
    paths: [...paths],
    services,
    routes: parsedRoutes,
    creationTimestamp: meta.creationTimestamp || null,
    age: ageFrom(meta.creationTimestamp),
  };
}

// ---------------------------------------------------------------------------
// Funcoes de coleta (reutilizadas por varias rotas e pelo stream SSE)
// ---------------------------------------------------------------------------

/** Lista todos os namespaces (resumo). */
async function listNamespaces() {
  const res = await coreV1Api.listNamespace();
  const body = unwrap(res);
  return (body.items || []).map((ns) => ({
    name: ns.metadata && ns.metadata.name,
    status: ns.status && ns.status.phase,
    creationTimestamp: ns.metadata && ns.metadata.creationTimestamp,
    age: ageFrom(ns.metadata && ns.metadata.creationTimestamp),
    labels: (ns.metadata && ns.metadata.labels) || {},
  }));
}

/**
 * Lista pods. Se `ns` for informado, restringe ao namespace; caso contrario
 * lista em todos os namespaces.
 */
async function listPods(ns) {
  const res = ns
    ? await coreV1Api.listNamespacedPod(ns)
    : await coreV1Api.listPodForAllNamespaces();
  const body = unwrap(res);
  return (body.items || []).map(summarizePod);
}

/** Lista deployments (todos os namespaces ou apenas `ns`). */
async function listDeployments(ns) {
  const res = ns
    ? await appsV1Api.listNamespacedDeployment(ns)
    : await appsV1Api.listDeploymentForAllNamespaces();
  const body = unwrap(res);
  return (body.items || []).map(summarizeDeployment);
}

/** Lista services (todos os namespaces ou apenas `ns`). */
async function listServices(ns) {
  const res = ns
    ? await coreV1Api.listNamespacedService(ns)
    : await coreV1Api.listServiceForAllNamespaces();
  const body = unwrap(res);
  return (body.items || []).map(summarizeService);
}

/**
 * Lista IngressRoutes do Traefik em todo o cluster via CustomObjectsApi.
 * group=traefik.io version=v1alpha1 plural=ingressroutes.
 */
async function listIngressRoutes() {
  const res = await customObjectsApi.listClusterCustomObject(
    TRAEFIK_GROUP,
    TRAEFIK_VERSION,
    TRAEFIK_INGRESSROUTE_PLURAL,
  );
  const body = unwrap(res);
  return (body.items || []).map(summarizeIngressRoute);
}

/**
 * Lista eventos (todos os namespaces ou apenas `ns`), ordenados do mais
 * recente para o mais antigo, limitados aos ultimos `limit`.
 */
async function listEvents(ns, limit) {
  const res = ns
    ? await coreV1Api.listNamespacedEvent(ns)
    : await coreV1Api.listEventForAllNamespaces();
  const body = unwrap(res);

  const events = (body.items || []).map((e) => {
    // O timestamp util pode estar em lastTimestamp, eventTime ou no metadata.
    const ts =
      e.lastTimestamp ||
      e.eventTime ||
      (e.metadata && e.metadata.creationTimestamp) ||
      e.firstTimestamp ||
      null;
    return {
      namespace: e.metadata && e.metadata.namespace,
      name: e.metadata && e.metadata.name,
      type: e.type || null, // Normal | Warning
      reason: e.reason || null,
      message: e.message || null,
      count: e.count || 1,
      involvedObject: e.involvedObject
        ? {
            kind: e.involvedObject.kind,
            name: e.involvedObject.name,
            namespace: e.involvedObject.namespace,
          }
        : null,
      timestamp: ts,
      age: ageFrom(ts),
    };
  });

  // Ordena por tempo decrescente (mais recente primeiro).
  events.sort((a, b) => {
    const ta = a.timestamp ? new Date(a.timestamp).getTime() : 0;
    const tb = b.timestamp ? new Date(b.timestamp).getTime() : 0;
    return tb - ta;
  });

  const n = Number.isFinite(limit) && limit > 0 ? limit : DEFAULT_EVENTS_LIMIT;
  return events.slice(0, n);
}

/**
 * Monta o panorama (overview) com contagens agregadas do cluster.
 * Reutilizado pela rota /overview e pelo stream SSE.
 */
async function buildOverview() {
  const [namespaces, pods, deployments, services, ingressroutes] = await Promise.all([
    listNamespaces(),
    listPods(),
    listDeployments(),
    listServices(),
    listIngressRoutes().catch((err) => {
      // IngressRoute e CRD: se o Traefik/CRD nao estiver instalado, nao
      // queremos derrubar o overview inteiro. Loga e segue com lista vazia.
      console.warn('[overview] Falha ao listar IngressRoutes (CRD ausente?):', describeK8sError(err));
      return [];
    }),
  ]);

  // Contagem de pods por fase (Running, Pending, Succeeded, Failed, Unknown...).
  const podsByPhase = {};
  for (const p of pods) {
    const phase = p.phase || 'Unknown';
    podsByPhase[phase] = (podsByPhase[phase] || 0) + 1;
  }

  return {
    generatedAt: new Date().toISOString(),
    counts: {
      namespaces: namespaces.length,
      pods: pods.length,
      podsByPhase,
      deployments: deployments.length,
      services: services.length,
      ingressroutes: ingressroutes.length,
    },
  };
}

/**
 * Agrupa recursos por aplicacao para a rota /apps.
 * Chave de agrupamento: label app.kubernetes.io/part-of (preferida) ou
 * devops.flavioneto/app. Recursos sem nenhuma das labels sao ignorados.
 *
 * Para cada app retorna: services (nomes), images, total de restarts, age
 * (do recurso mais antigo) e URLs publicadas derivadas das IngressRoutes.
 */
async function buildApps() {
  const [pods, deployments, services, ingressroutes] = await Promise.all([
    listPods(),
    listDeployments(),
    listServices(),
    listIngressRoutes().catch((err) => {
      console.warn('[apps] Falha ao listar IngressRoutes:', describeK8sError(err));
      return [];
    }),
  ]);

  // Resolve a chave de app a partir de um mapa de labels.
  const appKeyOf = (labels) => {
    if (!labels) return null;
    return labels[LABEL_PART_OF] || labels[LABEL_DEVOPS_APP] || null;
  };

  /** @type {Record<string, any>} */
  const apps = {};
  const ensureApp = (key) => {
    if (!apps[key]) {
      apps[key] = {
        app: key,
        namespaces: new Set(),
        services: new Set(),
        images: new Set(),
        restarts: 0,
        deployments: [],
        pods: 0,
        oldestTimestamp: null,
        urls: new Set(),
      };
    }
    return apps[key];
  };

  // Mantem o timestamp mais antigo (para derivar a idade da app).
  const trackOldest = (entry, ts) => {
    if (!ts) return;
    const t = new Date(ts).getTime();
    if (Number.isNaN(t)) return;
    if (entry.oldestTimestamp === null || t < entry.oldestTimestamp) {
      entry.oldestTimestamp = t;
    }
  };

  // Deployments contribuem com images e contagem.
  for (const dep of deployments) {
    const key = appKeyOf(dep.labels);
    if (!key) continue;
    const entry = ensureApp(key);
    entry.namespaces.add(dep.namespace);
    entry.deployments.push(dep.name);
    if (dep.image) {
      dep.image.split(',').map((s) => s.trim()).forEach((img) => entry.images.add(img));
    }
    trackOldest(entry, dep.creationTimestamp);
  }

  // Pods contribuem com restarts, images (status real) e contagem.
  for (const pod of pods) {
    const key = appKeyOf(pod.labels);
    if (!key) continue;
    const entry = ensureApp(key);
    entry.namespaces.add(pod.namespace);
    entry.pods += 1;
    entry.restarts += pod.restartCount || 0;
    if (pod.image) {
      pod.image.split(',').map((s) => s.trim()).forEach((img) => entry.images.add(img));
    }
    trackOldest(entry, pod.startTime);
  }

  // Services contribuem com a lista de services da app.
  for (const svc of services) {
    const key = appKeyOf(svc.selector) || appKeyOf(svc.labels);
    if (!key) continue;
    const entry = ensureApp(key);
    entry.namespaces.add(svc.namespace);
    entry.services.add(svc.name);
  }

  // IngressRoutes -> URLs publicadas. Associa a rota a uma app pelo nome do
  // service de destino (que costuma carregar o nome da app) ou pelo namespace.
  // Construimos URLs no formato http://<host><path> a partir de cada rota.
  for (const ir of ingressroutes) {
    for (const route of ir.routes) {
      const hostList = route.hosts.length > 0 ? route.hosts : ir.hosts;
      const pathList = route.paths.length > 0 ? route.paths : ['/'];
      const urls = [];
      for (const h of hostList) {
        for (const p of pathList) {
          urls.push(`http://${h}${p}`);
        }
      }
      // Tenta casar a rota com alguma app ja conhecida via nome do service.
      for (const svc of route.services) {
        for (const key of Object.keys(apps)) {
          if (apps[key].services.has(svc.name) || svc.name.includes(key) || (key && svc.name.startsWith(key))) {
            urls.forEach((u) => apps[key].urls.add(u));
          }
        }
      }
    }
  }

  // Serializa os Sets em arrays e calcula a idade.
  return Object.values(apps)
    .map((entry) => ({
      app: entry.app,
      namespaces: [...entry.namespaces],
      services: [...entry.services].sort(),
      deployments: entry.deployments.sort(),
      images: [...entry.images].sort(),
      restarts: entry.restarts,
      pods: entry.pods,
      age: entry.oldestTimestamp ? ageFrom(new Date(entry.oldestTimestamp).toISOString()) : null,
      urls: [...entry.urls].sort(),
    }))
    .sort((a, b) => a.app.localeCompare(b.app));
}

/**
 * Le as annotations de publicacao (devops.flavioneto/*) dos Deployments nos
 * namespaces de implantacao. Retorna os metadados do pipeline por Deployment.
 */
async function buildPublications() {
  const results = [];

  // Consulta cada namespace de forma resiliente: se um namespace nao existir
  // (ex.: ainda nao criado no lab), ignora-o sem derrubar a rota.
  const perNs = await Promise.all(
    PUBLICATION_NAMESPACES.map(async (ns) => {
      try {
        return { ns, deployments: await listDeployments(ns) };
      } catch (err) {
        console.warn(`[publications] Namespace '${ns}' indisponivel:`, describeK8sError(err));
        return { ns, deployments: [] };
      }
    }),
  );

  for (const { ns, deployments } of perNs) {
    for (const dep of deployments) {
      const ann = dep.annotations || {};
      // Considera somente Deployments que tenham ao menos uma annotation do
      // prefixo devops.flavioneto/ (ou seja, publicados pelo pipeline).
      const hasPublicationData = Object.keys(ann).some((k) => k.startsWith(PUBLICATION_ANNOTATION_PREFIX));
      if (!hasPublicationData) continue;

      results.push({
        namespace: ns,
        deployment: dep.name,
        app: (dep.labels && (dep.labels[LABEL_PART_OF] || dep.labels[LABEL_DEVOPS_APP])) || null,
        commitSha: ann[`${PUBLICATION_ANNOTATION_PREFIX}commitSha`] || null,
        branch: ann[`${PUBLICATION_ANNOTATION_PREFIX}branch`] || null,
        imageTag: ann[`${PUBLICATION_ANNOTATION_PREFIX}imageTag`] || null,
        deployedAt: ann[`${PUBLICATION_ANNOTATION_PREFIX}deployedAt`] || null,
        runId: ann[`${PUBLICATION_ANNOTATION_PREFIX}runId`] || null,
        image: ann[`${PUBLICATION_ANNOTATION_PREFIX}image`] || dep.image || null,
      });
    }
  }

  // Ordena por data de deploy decrescente quando disponivel.
  results.sort((a, b) => {
    const ta = a.deployedAt ? new Date(a.deployedAt).getTime() : 0;
    const tb = b.deployedAt ? new Date(b.deployedAt).getTime() : 0;
    return tb - ta;
  });

  return results;
}

// ---------------------------------------------------------------------------
// Router (somente leitura) — montado em '/' e em '/api'
// ---------------------------------------------------------------------------

const router = express.Router();

// Saude do backend (nao consulta o cluster).
router.get(
  '/health',
  asyncHandler(async (_req, res) => {
    res.json({ status: 'ok', service: 'console-backend', time: new Date().toISOString() });
  }),
);

// Lista de namespaces.
router.get(
  '/namespaces',
  asyncHandler(async (_req, res) => {
    res.json(await listNamespaces());
  }),
);

// Pods (query opcional ?ns=).
router.get(
  '/pods',
  asyncHandler(async (req, res) => {
    const ns = req.query.ns ? String(req.query.ns) : undefined;
    res.json(await listPods(ns));
  }),
);

// Deployments (query opcional ?ns=).
router.get(
  '/deployments',
  asyncHandler(async (req, res) => {
    const ns = req.query.ns ? String(req.query.ns) : undefined;
    res.json(await listDeployments(ns));
  }),
);

// Services (query opcional ?ns=).
router.get(
  '/services',
  asyncHandler(async (req, res) => {
    const ns = req.query.ns ? String(req.query.ns) : undefined;
    res.json(await listServices(ns));
  }),
);

// IngressRoutes do Traefik (cluster inteiro).
router.get(
  '/ingressroutes',
  asyncHandler(async (_req, res) => {
    res.json(await listIngressRoutes());
  }),
);

// Eventos (query opcional ?ns= e ?limit=).
router.get(
  '/events',
  asyncHandler(async (req, res) => {
    const ns = req.query.ns ? String(req.query.ns) : undefined;
    const limit = req.query.limit ? parseInt(String(req.query.limit), 10) : DEFAULT_EVENTS_LIMIT;
    res.json(await listEvents(ns, limit));
  }),
);

// Panorama agregado.
router.get(
  '/overview',
  asyncHandler(async (_req, res) => {
    res.json(await buildOverview());
  }),
);

// Aplicacoes agrupadas por label.
router.get(
  '/apps',
  asyncHandler(async (_req, res) => {
    res.json(await buildApps());
  }),
);

// Publicacoes (metadados do pipeline lidos das annotations dos Deployments).
router.get(
  '/publications',
  asyncHandler(async (_req, res) => {
    res.json(await buildPublications());
  }),
);

// Logs de um Pod especifico (query opcional ?tailLines=).
router.get(
  '/pods/:ns/:name/logs',
  asyncHandler(async (req, res) => {
    const { ns, name } = req.params;
    const tailLines = req.query.tailLines
      ? parseInt(String(req.query.tailLines), 10)
      : DEFAULT_LOG_TAIL_LINES;
    const container = req.query.container ? String(req.query.container) : undefined;

    // Assinatura: readNamespacedPodLog(name, namespace, container?, follow?,
    // insecureSkipTLSVerifyBackend?, limitBytes?, pretty?, previous?,
    // sinceSeconds?, tailLines?, timestamps?)
    const result = await coreV1Api.readNamespacedPodLog(
      name,
      ns,
      container, // container (opcional; default = primeiro container)
      false, // follow
      undefined, // insecureSkipTLSVerifyBackend
      undefined, // limitBytes
      undefined, // pretty
      false, // previous
      undefined, // sinceSeconds
      Number.isFinite(tailLines) && tailLines > 0 ? tailLines : DEFAULT_LOG_TAIL_LINES,
      true, // timestamps
    );

    // readNamespacedPodLog retorna o log como string (em res.body ou direto).
    const logText = unwrap(result);
    res.json({
      namespace: ns,
      pod: name,
      container: container || null,
      tailLines: Number.isFinite(tailLines) && tailLines > 0 ? tailLines : DEFAULT_LOG_TAIL_LINES,
      logs: typeof logText === 'string' ? logText : String(logText || ''),
    });
  }),
);

// -------------------------------- SSE -------------------------------------
// Stream em tempo real: a cada STREAM_INTERVAL_MS envia um snapshot com
// overview + resumo de pods + ultimos eventos. Limpa o intervalo no close.
router.get('/stream', (req, res) => {
  // Cabecalhos obrigatorios para Server-Sent Events.
  res.set({
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    // Desabilita buffering em proxies (ex.: nginx) para entrega imediata.
    'X-Accel-Buffering': 'no',
  });
  // Garante o envio imediato dos cabecalhos.
  if (typeof res.flushHeaders === 'function') {
    res.flushHeaders();
  }

  let closed = false;

  // Funcao que coleta e envia um snapshot. Erros sao enviados como evento
  // 'error' (sem encerrar o stream) para o cliente reagir.
  const sendSnapshot = async () => {
    if (closed) return;
    try {
      const [overview, pods, events] = await Promise.all([
        buildOverview(),
        listPods(),
        listEvents(undefined, 20),
      ]);

      const snapshot = {
        generatedAt: new Date().toISOString(),
        overview,
        // Lista RESUMIDA de pods (campos essenciais para a UI em tempo real).
        pods: pods.map((p) => ({
          name: p.name,
          namespace: p.namespace,
          phase: p.phase,
          ready: p.readiness.text,
          restartCount: p.restartCount,
          node: p.node,
          age: p.age,
        })),
        events,
      };

      if (closed) return;
      res.write(`event: snapshot\n`);
      res.write(`data: ${JSON.stringify(snapshot)}\n\n`);
    } catch (err) {
      if (closed) return;
      const message = describeK8sError(err);
      console.error('[stream] Erro ao montar snapshot:', message);
      res.write(`event: error\n`);
      res.write(`data: ${JSON.stringify({ error: message })}\n\n`);
    }
  };

  // Envia um primeiro snapshot imediatamente e depois periodicamente.
  sendSnapshot();
  const interval = setInterval(sendSnapshot, STREAM_INTERVAL_MS);

  // Comentario-keepalive periodico para manter a conexao viva atraves de
  // proxies que encerram conexoes ociosas.
  const keepAlive = setInterval(() => {
    if (closed) return;
    res.write(`: keep-alive ${Date.now()}\n\n`);
  }, 15000);

  // Limpa os intervalos quando a conexao e encerrada pelo cliente.
  const cleanup = () => {
    if (closed) return;
    closed = true;
    clearInterval(interval);
    clearInterval(keepAlive);
  };
  req.on('close', cleanup);
  req.on('aborted', cleanup);
  res.on('error', cleanup);
});

// ---------------------------------------------------------------------------
// Aplicacao Express
// ---------------------------------------------------------------------------

const app = express();

// CORS liberado (Console e somente leitura; util para dev direto do frontend).
app.use(cors());

// Log minimalista de requisicoes.
app.use((req, _res, next) => {
  console.log(`[req] ${req.method} ${req.originalUrl}`);
  next();
});

// Monta o MESMO router em '/' (atras do StripPrefix /devops/api) e em '/api'
// (acesso direto em desenvolvimento).
app.use('/', router);
app.use('/api', router);

// 404 em JSON para rotas desconhecidas.
app.use((req, res) => {
  res.status(404).json({ error: 'Rota nao encontrada', path: req.originalUrl });
});

// Tratador de erros final (caso algo escape do asyncHandler).
// eslint-disable-next-line no-unused-vars
app.use((err, _req, res, _next) => {
  const status = statusFromK8sError(err);
  const message = describeK8sError(err);
  console.error('[error] Erro nao tratado:', message);
  res.status(status).json({ error: message, status });
});

// Sobe o servidor.
const server = app.listen(PORT, () => {
  console.log(`[console-backend] Backend somente leitura escutando na porta ${PORT}.`);
  console.log('[console-backend] Rotas montadas em "/" e "/api".');
});

// Encerramento limpo em sinais do orquestrador (graceful shutdown).
const shutdown = (signal) => {
  console.log(`[console-backend] Recebido ${signal}, encerrando...`);
  server.close(() => {
    console.log('[console-backend] Servidor encerrado.');
    process.exit(0);
  });
  // Forca saida se o close demorar demais.
  setTimeout(() => process.exit(0), 5000).unref();
};
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

module.exports = { app, server };
