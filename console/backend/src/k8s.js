'use strict';

/**
 * k8s.js
 * ------
 * Configuracao centralizada do cliente Kubernetes (@kubernetes/client-node).
 *
 * Estrategia de carregamento da kubeconfig:
 *  - Quando o backend roda DENTRO do cluster (Pod), a variavel de ambiente
 *    KUBERNETES_SERVICE_HOST esta presente. Nesse caso usamos
 *    kc.loadFromCluster(), que le o ServiceAccount montado em
 *    /var/run/secrets/kubernetes.io/serviceaccount.
 *  - Caso contrario (desenvolvimento local, fora do cluster), usamos
 *    kc.loadFromDefault(), que respeita $KUBECONFIG ou ~/.kube/config
 *    (contexto esperado: docker-desktop).
 *
 * Este modulo expoe clientes ja prontos para as APIs que o Console consulta:
 *  - CoreV1Api      -> namespaces, pods, services, events, logs
 *  - AppsV1Api      -> deployments
 *  - CustomObjectsApi -> CRDs do Traefik (IngressRoute, traefik.io/v1alpha1)
 *
 * IMPORTANTE: o Console e SOMENTE LEITURA. Mesmo que os clientes possuam
 * metodos de escrita, eles nunca sao chamados aqui nem nas rotas.
 */

const k8s = require('@kubernetes/client-node');

// KubeConfig unico, compartilhado por todos os clientes.
const kc = new k8s.KubeConfig();

try {
  if (process.env.KUBERNETES_SERVICE_HOST) {
    // Executando dentro do cluster: usa o ServiceAccount montado no Pod.
    kc.loadFromCluster();
    console.log('[k8s] kubeconfig carregada via loadFromCluster() (in-cluster).');
  } else {
    // Execucao local: usa $KUBECONFIG ou ~/.kube/config (contexto docker-desktop).
    kc.loadFromDefault();
    const ctx = kc.getCurrentContext();
    console.log(`[k8s] kubeconfig carregada via loadFromDefault() (contexto: ${ctx || 'desconhecido'}).`);
  }
} catch (err) {
  // Falha ao carregar a kubeconfig e fatal: sem ela nao ha o que servir.
  console.error('[k8s] ERRO FATAL ao carregar a kubeconfig:', err && err.message ? err.message : err);
  throw err;
}

// Clientes de API derivados do mesmo KubeConfig.
let coreV1Api;
let appsV1Api;
let customObjectsApi;

try {
  coreV1Api = kc.makeApiClient(k8s.CoreV1Api);
  appsV1Api = kc.makeApiClient(k8s.AppsV1Api);
  customObjectsApi = kc.makeApiClient(k8s.CustomObjectsApi);
} catch (err) {
  console.error('[k8s] ERRO FATAL ao criar os clientes de API:', err && err.message ? err.message : err);
  throw err;
}

// Constantes do grupo de CRDs do Traefik usadas nas consultas de IngressRoute.
const TRAEFIK_GROUP = 'traefik.io';
const TRAEFIK_VERSION = 'v1alpha1';
const TRAEFIK_INGRESSROUTE_PLURAL = 'ingressroutes';

module.exports = {
  kc,
  coreV1Api,
  appsV1Api,
  customObjectsApi,
  TRAEFIK_GROUP,
  TRAEFIK_VERSION,
  TRAEFIK_INGRESSROUTE_PLURAL,
};
