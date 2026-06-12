/**
 * api.js
 * ------
 * Cliente HTTP/SSE do DevOps Console.
 *
 * Base da API:
 *   import.meta.env.BASE_URL e o base path configurado no Vite ('/devops/').
 *   Concatenamos 'api' para chegar em '/devops/api'. Em producao, o Traefik aplica
 *   StripPrefix de /devops/api e o console-backend recebe as rotas na raiz
 *   (ex.: /devops/api/overview -> backend ve /overview). Em desenvolvimento, o
 *   proxy do Vite (vite.config.js) faz o mesmo strip contra http://localhost:3001.
 *
 * Todas as funcoes sao SOMENTE LEITURA (GET) — o backend nao expoe escrita.
 */

// BASE_URL sempre termina com '/', portanto BASE_URL + 'api' => '/devops/api'.
export const API_BASE = `${import.meta.env.BASE_URL}api`;

// Sessao expirada/ausente: a borda responde 401 nas rotas de API (XHR), por design
// (middleware console-auth-401). A rota de NAVEGACAO /devops passa pelo middleware
// console-auth-redirect (302 -> Keycloak). Entao, ao receber 401, recarregamos a
// navegacao: o documento e redirecionado ao login e volta para a pagina atual — em vez
// de travar mostrando "Erro 401 — Unauthorized". Guard evita loop com chamadas paralelas.
let _redirectingToLogin = false;
export function handleAuthExpired() {
  if (_redirectingToLogin) return;
  _redirectingToLogin = true;
  window.location.reload();
}

/**
 * Wrapper de fetch com JSON, timeout opcional e erros legiveis em pt-BR.
 * @param {string} path Caminho relativo a API_BASE (deve comecar com '/').
 * @param {object} [options] Opcoes extras (signal, etc.).
 * @returns {Promise<any>} Corpo da resposta ja em JSON.
 */
async function getJSON(path, options = {}) {
  const url = `${API_BASE}${path}`;
  let res;
  try {
    res = await fetch(url, {
      method: 'GET',
      headers: { Accept: 'application/json' },
      ...options,
    });
  } catch (networkErr) {
    throw new Error(
      `Falha de rede ao acessar ${url}: ${networkErr && networkErr.message ? networkErr.message : networkErr}`
    );
  }

  if (res.status === 401) {
    handleAuthExpired();
    throw new Error('Sessão expirada — redirecionando para o login…');
  }

  if (!res.ok) {
    // Tenta extrair uma mensagem do corpo de erro, se houver.
    let detail = '';
    try {
      const body = await res.text();
      detail = body ? ` — ${body.slice(0, 300)}` : '';
    } catch {
      detail = '';
    }
    throw new Error(`Erro ${res.status} (${res.statusText}) em ${path}${detail}`);
  }

  try {
    return await res.json();
  } catch (parseErr) {
    throw new Error(
      `Resposta nao-JSON em ${path}: ${parseErr && parseErr.message ? parseErr.message : parseErr}`
    );
  }
}

// ---------------------------------------------------------------------------
// Endpoints REST (todos GET, somente leitura).
// ---------------------------------------------------------------------------

/** Lista de namespaces do cluster. */
export const fetchNamespaces = (options) => getJSON('/namespaces', options);

/** Lista de pods (todos os namespaces, ou filtrados pelo backend). */
export const fetchPods = (options) => getJSON('/pods', options);

/** Lista de deployments. */
export const fetchDeployments = (options) => getJSON('/deployments', options);

/** Lista de services. */
export const fetchServices = (options) => getJSON('/services', options);

/** Lista de IngressRoutes do Traefik (CRD traefik.io/v1alpha1). */
export const fetchIngressRoutes = (options) => getJSON('/ingressroutes', options);

/** Eventos recentes do cluster. */
export const fetchEvents = (options) => getJSON('/events', options);

/** Visao agregada (contagens + pods) usada na aba Overview. */
export const fetchOverview = (options) => getJSON('/overview', options);

/** Aplicacoes agrupadas (derivadas dos descritores devops.yaml / labels). */
export const fetchApps = (options) => getJSON('/apps', options);

/** Historico de publicacoes (metadados da esteira de CI/CD). */
export const fetchPublications = (options) => getJSON('/publications', options);

/**
 * Ultimas linhas de log de um pod especifico.
 *
 * O backend expoe a rota como /pods/:ns/:name/logs (parametros de path) e aceita
 * ?tailLines= para limitar a saida. Retorna { namespace, pod, container,
 * tailLines, logs }.
 *
 * @param {string} ns Namespace do pod.
 * @param {string} name Nome do pod.
 * @param {number} [tailLines=200] Numero maximo de linhas.
 * @param {object} [options] Opcoes extras (signal, etc.).
 */
export function fetchLogs(ns, name, tailLines = 200, options) {
  if (!ns || !name) {
    return Promise.reject(new Error('fetchLogs requer namespace e nome do pod.'));
  }
  const enc = (v) => encodeURIComponent(v);
  const qs = tailLines ? `?tailLines=${enc(tailLines)}` : '';
  return getJSON(`/pods/${enc(ns)}/${enc(name)}/logs${qs}`, options);
}

/**
 * Abre um EventSource (SSE) contra API_BASE + '/stream'.
 *
 * O backend NAO usa o evento padrao "message": ele emite eventos NOMEADOS via
 * `event: snapshot` (payload agregado: { generatedAt, overview, pods, events })
 * e `event: error` em caso de falha ao montar o snapshot. Portanto o consumidor
 * deve registrar handlers com es.addEventListener('snapshot', ...) /
 * es.addEventListener('error-event'/'error', ...), e chamar .close() no unmount.
 *
 * @returns {EventSource} Conexao SSE aberta.
 */
export function openStream() {
  return new EventSource(`${API_BASE}/stream`);
}

// ---------------------------------------------------------------------------
// Modulo Projetos & Tarefas (meta-projeto) — API SEPARADA (pm-api), COM ESCRITA.
// Base /devops/api/pm (Traefik StripPrefix -> pm-api ve "/"). Totalmente isolada
// do backend read-only de cluster acima (que NUNCA escreve).
// ---------------------------------------------------------------------------
export const PM_BASE = `${import.meta.env.BASE_URL}api/pm`;

async function pmFetch(path, { method = 'GET', body } = {}) {
  const url = `${PM_BASE}${path}`;
  let res;
  try {
    res = await fetch(url, {
      method,
      headers: body
        ? { 'Content-Type': 'application/json', Accept: 'application/json' }
        : { Accept: 'application/json' },
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch (networkErr) {
    throw new Error(`Falha de rede ao acessar ${url}: ${networkErr && networkErr.message ? networkErr.message : networkErr}`);
  }
  if (res.status === 401) {
    handleAuthExpired();
    throw new Error('Sessão expirada — redirecionando para o login…');
  }
  if (res.status === 204) return null;
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((json && json.error && json.error.message) || `Erro ${res.status} em ${path}`);
  return json.data;
}

// Projetos
export const pmProjects = () => pmFetch('/projects');
export const pmCreateProject = (p) => pmFetch('/projects', { method: 'POST', body: p });
export const pmPatchProject = (id, p) => pmFetch(`/projects/${id}`, { method: 'PATCH', body: p });
export const pmDeleteProject = (id) => pmFetch(`/projects/${id}`, { method: 'DELETE' });
// Itens (bug/feature/evolution)
export const pmItems = (projectId) => pmFetch(`/projects/${projectId}/items`);
export const pmCreateItem = (projectId, item) => pmFetch(`/projects/${projectId}/items`, { method: 'POST', body: item });
export const pmPatchItem = (id, patch) => pmFetch(`/items/${id}`, { method: 'PATCH', body: patch });
export const pmDeleteItem = (id) => pmFetch(`/items/${id}`, { method: 'DELETE' });
// Tasks (ciclo begin->in_progress->done)
export const pmTasks = (itemId) => pmFetch(`/items/${itemId}/tasks`);
export const pmCreateTask = (itemId, task) => pmFetch(`/items/${itemId}/tasks`, { method: 'POST', body: task });
export const pmPatchTask = (id, patch) => pmFetch(`/tasks/${id}`, { method: 'PATCH', body: patch });
export const pmDeleteTask = (id) => pmFetch(`/tasks/${id}`, { method: 'DELETE' });

// ---------------------------------------------------------------------------
// Identidade + gestão de acesso (usuários restritos).
// /me decide o gating do frontend (admin vê tudo; member só Projetos & Tarefas).
// As rotas /admin/* são protegidas no pm-api (platform-admins).
// ---------------------------------------------------------------------------
export const pmMe = () => pmFetch('/me');
export const pmListMembers = () => pmFetch('/admin/members');
export const pmCreateMember = (body) => pmFetch('/admin/members', { method: 'POST', body });
export const pmSetMemberProjects = (email, projectIds) =>
  pmFetch(`/admin/members/${encodeURIComponent(email)}/projects`, { method: 'PUT', body: { projectIds } });
export const pmUpdateMember = (email, patch) =>
  pmFetch(`/admin/members/${encodeURIComponent(email)}`, { method: 'PATCH', body: patch });
export const pmDeleteMember = (email) =>
  pmFetch(`/admin/members/${encodeURIComponent(email)}`, { method: 'DELETE' });
export const pmResetMemberPassword = (email) =>
  pmFetch(`/admin/members/${encodeURIComponent(email)}/reset-password`, { method: 'POST' });

// Inventário de recursos compartilhados entre projetos (libs @flavioneto11/* + infra) com versões/drift.
export const pmSharedResources = () => pmFetch('/shared-resources');

// ---------------------------------------------------------------------------
// CMS (gerenciamento de conteúdo dos portais) — escrita autenticada via pm-api.
// Escopado por projeto (igual a Projetos & Tarefas): admin vê todos; member, os atribuídos.
// ---------------------------------------------------------------------------
export const pmCmsSite = (projectId) => pmFetch(`/projects/${projectId}/cms/site`);
export const pmCmsSaveSite = (projectId, data) => pmFetch(`/projects/${projectId}/cms/site`, { method: 'PUT', body: { data } });
export const pmCmsPages = (projectId) => pmFetch(`/projects/${projectId}/cms/pages`);
export const pmCmsCreatePage = (projectId, body) => pmFetch(`/projects/${projectId}/cms/pages`, { method: 'POST', body });
export const pmCmsPatchPage = (pageId, patch) => pmFetch(`/cms/pages/${pageId}`, { method: 'PATCH', body: patch });
export const pmCmsDeletePage = (pageId) => pmFetch(`/cms/pages/${pageId}`, { method: 'DELETE' });
export const pmCmsSections = (pageId) => pmFetch(`/cms/pages/${pageId}/sections`);
export const pmCmsCreateSection = (pageId, body) => pmFetch(`/cms/pages/${pageId}/sections`, { method: 'POST', body });
export const pmCmsPatchSection = (sectionId, patch) => pmFetch(`/cms/sections/${sectionId}`, { method: 'PATCH', body: patch });
export const pmCmsDeleteSection = (sectionId) => pmFetch(`/cms/sections/${sectionId}`, { method: 'DELETE' });
export const pmCmsReorderSections = (pageId, order) => pmFetch(`/cms/pages/${pageId}/sections/reorder`, { method: 'PUT', body: { order } });
// scope: 'project' (só deste portal) | 'global' (biblioteca pública) | 'all' (default)
export const pmCmsFiles = (projectId, scope = 'all') => pmFetch(`/projects/${projectId}/cms/files?scope=${scope}`);
export const pmCmsDeleteFile = (fileId) => pmFetch(`/cms/files/${fileId}`, { method: 'DELETE' });

/** Upload de arquivo (multipart) — bypassa o pmFetch JSON. Retorna { id, url, filename, mime, size }.
 *  scope 'global' publica na biblioteca pública da plataforma (somente admin). */
export async function pmCmsUpload(projectId, file, scope = 'project') {
  const fd = new FormData();
  if (scope === 'global') fd.append('scope', 'global'); // antes do file: multer lê os fields na ordem
  fd.append('file', file);
  const res = await fetch(`${PM_BASE}/projects/${projectId}/cms/files`, { method: 'POST', body: fd });
  if (res.status === 401) { handleAuthExpired(); throw new Error('Sessão expirada — redirecionando para o login…'); }
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((json && json.error && json.error.message) || `Erro ${res.status} no upload`);
  return json.data;
}
