// =============================================================================
// platform-shell — a CASCA GLOBAL da plataforma NovaIT, como Web Component vanilla.
// Framework-agnóstico (vanilla + React), CSP-safe (DOM só via createElement/textContent,
// zero innerHTML/zero inline/zero CDN — passa na CSP estrita do reqhub). Estilo vem do
// arquivo irmão platform-shell.css (same-origin). Distribuído por codegen-sync (build.mjs)
// para dentro de cada app + drift-gate, igual aos design-tokens.
//
// Uso (vanilla):  <link rel="stylesheet" href="assets/platform-shell.css">
//                 <platform-shell surface="reqs" me-url="/reqs/api/v1/me"></platform-shell>
//                 <script type="module" src="assets/platform-shell.js"></script>
// Uso (React):    import './platform-shell.css'; import './platform-shell.js';
//                 <platform-shell surface="devops" me-url="/devops/api/me"></platform-shell>
// =============================================================================

// ---- manifesto canônico dos surfaces (a fonte da verdade da navegação global) ----
export const SURFACES = [
  { key: 'portal', label: 'Portal', sub: 'início da plataforma', path: '/', group: 'Plataforma', glyph: '◇', external: false },
  { key: 'devops', label: 'DevOps Console', sub: 'cluster ao vivo', path: '/devops', group: 'Plataforma', glyph: '▥', external: false },
  { key: 'reqs', label: 'Reqhub', sub: 'requisitos · fonte da verdade', path: '/reqs', group: 'Plataforma', glyph: '◷', external: false },
  { key: 'portal-rec', label: 'Portal Recorder', sub: 'captura de portais', path: '/portal-rec', group: 'Ferramentas', glyph: '⦿', external: false },
  { key: 'grafana', label: 'Grafana', sub: 'métricas & dashboards', path: '/grafana', group: 'Ferramentas', glyph: '◔', external: true },
  { key: 'argocd', label: 'Argo CD', sub: 'GitOps', path: '/argocd', group: 'Ferramentas', glyph: '⟳', external: true },
  { key: 'auth', label: 'Keycloak', sub: 'identidade (SSO)', path: '/auth', group: 'Ferramentas', glyph: '⚷', external: true },
];

// ---- funções PURAS (testáveis em node:test; sem DOM) ----
// (E1, Forja 4.1) TABELA CANÔNICA de deep-links entre superfícies — o CONTEXTO DE PRODUTO
// viaja SEMPRE por URL (nada de sessionStorage): cada destino lê o parâmetro no próprio
// roteador (reqhub: applyHashRoute lê #/forge?product=; console: bloco A4 lê #logs?app= /
// #publications?app= / #conteudo?projeto=[&novo=1]). Formatos validados contra os roteadores
// reais — mudar aqui exige mudar lá (e vice-versa).
export function surfaceLink(key, view, ctx) {
  const c = ctx || {};
  const enc = encodeURIComponent;
  if (key === 'studio' && view === 'produto') return '/reqs/#/forge' + (c.product ? '?product=' + enc(c.product) : '');
  if (key === 'console' && view === 'logs') return '/devops/#logs' + (c.product ? '?app=' + enc(c.product) : '');
  if (key === 'console' && view === 'pubs') return '/devops/#publications' + (c.product ? '?app=' + enc(c.product) : '');
  if (key === 'console' && view === 'conteudo') {
    const qp = [];
    if (c.product) qp.push('projeto=' + enc(c.product));
    if (c.novo) qp.push('novo=1');
    return '/devops/#conteudo' + (qp.length ? '?' + qp.join('&') : '');
  }
  if (key === 'rec' && view === 'captura') return '/portal-rec/';
  return null;
}
// links da seção "Neste produto" do launcher (contexto de produto). Puro/testável: o componente
// só pinta. Na superfície reqs o link do Studio é omitido (é o Studio que anuncia o contexto —
// linkar para si mesmo é ruído); Conteúdo (CMS) só entra quando o produto é um portal (kind).
export function productLinks(product, surfaceKey, opts) {
  if (!product) return [];
  const o = opts || {};
  const items = [];
  if (surfaceKey !== 'reqs') items.push({ key: 'studio', label: 'Studio do produto', sub: 'brief · requisitos · trilho', glyph: '◷', href: surfaceLink('studio', 'produto', { product }) });
  items.push({ key: 'logs', label: 'Logs', sub: 'pods do app no cluster', glyph: '▤', href: surfaceLink('console', 'logs', { product }) });
  items.push({ key: 'pubs', label: 'Publicações', sub: 'deploys da esteira', glyph: '⇪', href: surfaceLink('console', 'pubs', { product }) });
  if (o.kind === 'portal') items.push({ key: 'conteudo', label: 'Conteúdo (CMS)', sub: 'editor visual do portal', glyph: '✎', href: surfaceLink('console', 'conteudo', { product }) });
  return items;
}
// identidade normalizada a partir do /me (eco dos headers X-Auth-Request-* ou /v1/me).
export function normalizeMe(json) {
  // aceita tanto o eco básico { email, groups, isAdmin } quanto o rico do pm-api
  // ({ data: { email, isAdmin, isMember, projects } }) — desembrulha o `data` se houver.
  const j = (json && json.data && typeof json.data === 'object') ? json.data : (json || {});
  const email = (j.email || j.user || '').trim();
  const groups = Array.isArray(j.groups) ? j.groups : (typeof j.groups === 'string' && j.groups ? j.groups.split(',').map((s) => s.trim()).filter(Boolean) : []);
  const isAdmin = j.isAdmin === true || groups.includes('platform-admins');
  const isMember = j.isMember === true || groups.includes('project-members');
  const projects = Array.isArray(j.projects) ? j.projects : [];
  return { email, groups, isAdmin, isMember, projects, initial: (email[0] || '?').toUpperCase(), authed: !!email };
}
// rótulo de papel a partir da identidade normalizada (admin > membro > 1º grupo > sessão).
export function roleLabel(me) {
  if (!me) return '';
  if (me.isAdmin) return 'platform-admin';
  if (me.isMember) return 'acesso a projetos';
  return me.groups && me.groups.length ? me.groups[0] : 'sessão autenticada';
}
// saúde a partir de um status HTTP de probe (null = erro de rede). 404/5xx = fora; demais = no ar.
export function healthFromStatus(status) {
  if (status == null) return 'unknown';
  if (status === 404 || status >= 500) return 'down';
  return 'up'; // 2xx/3xx/401/403 = roteado/alcançável
}
// agrupa os surfaces preservando a ordem dos grupos de aparição.
export function groupSurfaces(surfaces) {
  const order = [];
  const map = new Map();
  for (const s of surfaces) { if (!map.has(s.group)) { map.set(s.group, []); order.push(s.group); } map.get(s.group).push(s); }
  return order.map((g) => ({ group: g, items: map.get(g) }));
}
// o surface ativo, casando o pathname mais específico (maior prefixo).
export function activeSurfaceKey(surfaces, pathname) {
  let best = null;
  for (const s of surfaces) {
    if (s.path === '/') { if (pathname === '/' && !best) best = s; continue; }
    if (pathname === s.path || pathname.startsWith(s.path + '/') || pathname.startsWith(s.path + '?')) {
      if (!best || s.path.length > best.path.length) best = s;
    }
  }
  return best ? best.key : null;
}

// ---- Web Component (browser only). Guarda p/ node:test importar as puras sem DOM. ----
const Base = typeof HTMLElement !== 'undefined' ? HTMLElement : class {};

function el(tag, attrs, ...kids) {
  const n = document.createElement(tag);
  if (attrs) for (const [k, v] of Object.entries(attrs)) {
    if (v == null) continue;
    if (k === 'text') n.textContent = v;
    else if (k === 'onclick') n.addEventListener('click', v);
    else if (k === 'href' || k === 'class' || k === 'type' || k === 'title' || k === 'target' || k === 'rel' || k.startsWith('aria-') || k === 'role' || k === 'id' || k === 'tabindex') n.setAttribute(k, v);
    else n.setAttribute(k, v);
  }
  for (const c of kids) { if (c == null) continue; n.appendChild(typeof c === 'string' ? document.createTextNode(c) : c); }
  return n;
}

class PlatformShell extends Base {
  // (E1, Forja 4.1) o componente segue BUILD-ONCE; só o CONTEXTO DE PRODUTO é reativo
  // (chip "em <produto>" + seção "Neste produto" do launcher). O contexto viaja por URL —
  // estes atributos apenas REFLETEM o estado da superfície atual (quem seta é o app, ex.: Studio).
  static get observedAttributes() { return ['product', 'product-label', 'product-kind']; }
  attributeChangedCallback(_name, oldV, newV) {
    if (!this._built || oldV === newV) return;
    this._syncProduct();
  }

  connectedCallback() {
    if (this._built) return; this._built = true;
    this.surfaceKey = this.getAttribute('surface') || activeSurfaceKey(SURFACES, location.pathname) || '';
    this.meUrl = this.getAttribute('me-url') || '';
    this.brandHref = this.getAttribute('brand-href') || '/';
    this._launcherOpen = false; this._menuOpen = false;
    this._health = {}; // cache das sondas (repintar o launcher não re-sonda)
    this.classList.add('pshell-host');
    this._render();
    // aplica a ESCOLHA explícita salva (nvit-theme) na conexão; sem escolha, deixa o CSS
    // resolver (claro padrão + preferência do sistema). Assim o tema persiste entre reloads.
    try { const s = localStorage.getItem('nvit-theme'); if (s === 'dark' || s === 'light') this._applyTheme(s); } catch { /* ignore */ }
    this._loadIdentity();
    this._probeHealth();
    document.addEventListener('click', (e) => { if (!this.contains(e.target)) this._closeAll(); });
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape') this._closeAll(); });
  }

  _render() {
    const bar = el('div', { class: 'pshell', role: 'navigation', 'aria-label': 'Navegação da plataforma' });
    // launcher button
    this.launchBtn = el('button', { class: 'pshell-launch', type: 'button', 'aria-label': 'Abrir o menu de aplicações', 'aria-expanded': 'false', onclick: (e) => { e.stopPropagation(); this._toggleLauncher(); } },
      el('span', { class: 'pshell-grid', 'aria-hidden': 'true' }));
    // brand
    const brand = el('a', { class: 'pshell-brand', href: this.brandHref, 'aria-label': 'NovaIT — início da plataforma' },
      el('span', { class: 'pshell-logo', 'aria-hidden': 'true', text: 'N' }),
      el('span', { class: 'pshell-brand-txt' }, el('strong', { text: 'NovaIT' }), el('span', { class: 'pshell-brand-sub', text: 'plataforma' })));
    // active surface chip
    const cur = SURFACES.find((s) => s.key === this.surfaceKey);
    const chip = cur ? el('span', { class: 'pshell-here', title: 'Você está em ' + cur.label }, el('span', { class: 'pshell-here-g', 'aria-hidden': 'true', text: cur.glyph }), el('span', { text: cur.label })) : null;
    // slot do chip de CONTEXTO DE PRODUTO ("em <produto>") — preenchido por _syncProduct (reativo)
    this.ctxSlot = el('span', { class: 'pshell-ctx' });
    // right: theme + identity
    this.themeBtn = el('button', { class: 'pshell-icon', type: 'button', 'aria-label': 'Alternar tema claro/escuro', title: 'Tema', onclick: () => this._toggleTheme() }, el('span', { class: 'pshell-theme-ic', 'aria-hidden': 'true' }));
    this.identitySlot = el('div', { class: 'pshell-identity' });
    const right = el('div', { class: 'pshell-right' }, this.themeBtn, this.identitySlot);
    bar.append(this.launchBtn, brand, chip || document.createTextNode(''), this.ctxSlot, el('span', { class: 'pshell-spacer' }), right);
    // launcher panel (oculto)
    this.launcher = el('div', { class: 'pshell-launcher', hidden: 'hidden', role: 'menu', 'aria-label': 'Aplicações da plataforma' });
    this._fillLauncher();
    this.replaceChildren(bar, this.launcher);
    this._syncTheme();
    if (this.getAttribute('product')) this._syncProduct(); // atributo já presente na conexão
  }

  // ----- contexto de produto (reativo): chip na barra + seção "Neste produto" no launcher -----
  _syncProduct() {
    const product = this.getAttribute('product') || '';
    const label = this.getAttribute('product-label') || product;
    if (this.ctxSlot) {
      this.ctxSlot.replaceChildren();
      if (product) {
        this.ctxSlot.append(el('span', { class: 'pshell-here pshell-here-prod', title: 'Contexto de produto: ' + label },
          el('span', { class: 'pshell-here-g', 'aria-hidden': 'true', text: '◈' }),
          el('span', { text: 'em ' + label })));
      }
    }
    if (this.launcher) { this._fillLauncher(); this._applyHealth(); }
  }

  _fillLauncher() {
    this.launcher.replaceChildren();
    this.launcher.append(el('div', { class: 'pshell-launcher-h', text: 'Plataforma NovaIT' }));
    // seção contextual "Neste produto": deep-links canônicos (surfaceLink) — contexto por URL
    const product = this.getAttribute('product') || '';
    if (product) {
      const label = this.getAttribute('product-label') || product;
      this.launcher.append(el('div', { class: 'pshell-launcher-g', text: 'Neste produto — ' + label }));
      const grid = el('div', { class: 'pshell-launcher-grid' });
      for (const l of productLinks(product, this.surfaceKey, { kind: this.getAttribute('product-kind') || '' })) {
        grid.append(el('a', { class: 'pshell-app', href: l.href, target: '_blank', rel: 'noopener noreferrer', role: 'menuitem' },
          el('span', { class: 'pshell-app-ic', 'aria-hidden': 'true', text: l.glyph }),
          el('span', { class: 'pshell-app-tx' },
            el('span', { class: 'pshell-app-n' }, document.createTextNode(l.label), el('span', { class: 'pshell-ext', 'aria-hidden': 'true', text: ' ↗' })),
            el('span', { class: 'pshell-app-s', text: l.sub }))));
      }
      this.launcher.append(grid);
    }
    for (const { group, items } of groupSurfaces(SURFACES)) {
      this.launcher.append(el('div', { class: 'pshell-launcher-g', text: group }));
      const grid = el('div', { class: 'pshell-launcher-grid' });
      for (const s of items) {
        const active = s.key === this.surfaceKey;
        const card = el(s.external ? 'a' : 'button',
          s.external
            ? { class: 'pshell-app' + (active ? ' is-active' : ''), href: s.path, target: '_blank', rel: 'noopener noreferrer', role: 'menuitem' }
            : { class: 'pshell-app' + (active ? ' is-active' : ''), type: 'button', role: 'menuitem', onclick: () => { location.href = s.path; } },
          el('span', { class: 'pshell-app-ic', 'aria-hidden': 'true', text: s.glyph }),
          el('span', { class: 'pshell-app-tx' }, el('span', { class: 'pshell-app-n' }, document.createTextNode(s.label), s.external ? el('span', { class: 'pshell-ext', 'aria-hidden': 'true', text: ' ↗' }) : null), el('span', { class: 'pshell-app-s', text: s.sub })),
          el('span', { class: 'pshell-dot', 'data-key': s.key, title: 'verificando…', 'aria-hidden': 'true' }));
        grid.append(card);
      }
      this.launcher.append(grid);
    }
  }

  _toggleLauncher() { this._launcherOpen = !this._launcherOpen; this.launcher.hidden = !this._launcherOpen; this.launchBtn.setAttribute('aria-expanded', this._launcherOpen ? 'true' : 'false'); if (this._launcherOpen) { this._menuOpen = false; const first = this.launcher.querySelector('.pshell-app'); if (first) first.focus(); } }
  _closeAll() { if (this._launcherOpen) { this._launcherOpen = false; this.launcher.hidden = true; this.launchBtn.setAttribute('aria-expanded', 'false'); } const m = this.identitySlot.querySelector('.pshell-menu'); if (m) m.hidden = true; this._menuOpen = false; }

  // ----- tema: [data-theme] + .dark no <html>, chave única nvit-theme -----
  _currentTheme() {
    const el0 = document.documentElement;
    if (el0.getAttribute('data-theme')) return el0.getAttribute('data-theme');
    if (el0.classList.contains('dark')) return 'dark';
    try { const s = localStorage.getItem('nvit-theme'); if (s) return s; } catch { /* ignore */ }
    return (typeof matchMedia !== 'undefined' && matchMedia('(prefers-color-scheme: dark)').matches) ? 'dark' : 'light';
  }
  _applyTheme(t) {
    const el0 = document.documentElement;
    el0.setAttribute('data-theme', t);
    el0.classList.toggle('dark', t === 'dark');
    try { localStorage.setItem('nvit-theme', t); } catch { /* ignore */ }
    this._syncTheme();
  }
  _syncTheme() { const dark = this._currentTheme() === 'dark'; if (this.themeBtn) { this.themeBtn.setAttribute('aria-label', dark ? 'Mudar para tema claro' : 'Mudar para tema escuro'); this.classList.toggle('pshell-dark', dark); } }
  _toggleTheme() { this._applyTheme(this._currentTheme() === 'dark' ? 'light' : 'dark'); }

  // ----- identidade: cadeia me-url (preferida, ex.: pm/me rica) -> me-url-fallback (eco
  //       básico); usa a 1ª resposta AUTENTICADA. Fail-soft total -> "Entrar". -----
  async _loadIdentity() {
    const urls = [this.meUrl, this.getAttribute('me-url-fallback')].filter(Boolean);
    let me = null;
    for (const u of urls) {
      try {
        const r = await fetch(u, { headers: { Accept: 'application/json' } });
        if (r.ok) { const m = normalizeMe(await r.json()); if (m.authed) { me = m; break; } }
      } catch { /* tenta o próximo da cadeia */ }
    }
    this._renderIdentity(me);
  }
  _renderIdentity(me) {
    this.identitySlot.replaceChildren();
    if (!me || !me.authed) {
      const rd = encodeURIComponent(location.pathname + location.search);
      this.identitySlot.append(el('a', { class: 'pshell-enter', href: '/oauth2/start?rd=' + rd, text: 'Entrar' }));
      return;
    }
    const role = roleLabel(me);
    const btn = el('button', { class: 'pshell-user', type: 'button', 'aria-haspopup': 'menu', 'aria-expanded': 'false', 'aria-label': 'Menu do usuário (' + me.email + ')', onclick: (e) => { e.stopPropagation(); this._toggleMenu(); } },
      el('span', { class: 'pshell-avatar', text: me.initial }), el('span', { class: 'pshell-user-e', text: me.email }));
    const head = el('div', { class: 'pshell-menu-h' }, el('span', { class: 'pshell-avatar pshell-avatar-lg', text: me.initial }), el('div', {}, el('div', { class: 'pshell-menu-e', text: me.email }), el('div', { class: 'pshell-menu-r', text: role })));
    const menu = el('div', { class: 'pshell-menu', role: 'menu', hidden: 'hidden' }, head);
    // toque rico (quando vem do pm/me): nº de projetos do membro
    if (me.projects && me.projects.length) menu.append(el('div', { class: 'pshell-menu-meta', text: me.projects.length + ' projeto' + (me.projects.length === 1 ? '' : 's') }));
    menu.append(el('a', { class: 'pshell-menu-i', href: '/oauth2/sign_out', role: 'menuitem', text: 'Sair' }));
    this.identityBtn = btn; this.identityMenu = menu;
    this.identitySlot.append(btn, menu);
  }
  _toggleMenu() { if (!this.identityMenu) return; this._menuOpen = !this._menuOpen; this.identityMenu.hidden = !this._menuOpen; this.identityBtn.setAttribute('aria-expanded', this._menuOpen ? 'true' : 'false'); if (this._menuOpen) this._launcherOpen = false, this.launcher.hidden = true; }

  // ----- saúde dos surfaces (HEAD probe same-origin, best-effort, nunca bloqueia).
  //       Resultado fica em cache (this._health): re-render do launcher (contexto de
  //       produto) só REPINTA via _applyHealth, sem re-sondar a cada mudança de atributo. -----
  _probeHealth() {
    this._health = this._health || {};
    for (const s of SURFACES) {
      if (this._health[s.key]) { this._paintDot(s, this._health[s.key]); continue; }
      this._probe(s.path).then((h) => { this._health[s.key] = h; this._paintDot(s, h); });
    }
  }
  _applyHealth() {
    for (const s of SURFACES) if (this._health && this._health[s.key]) this._paintDot(s, this._health[s.key]);
  }
  _paintDot(s, h) {
    const dot = this.launcher && this.launcher.querySelector('.pshell-dot[data-key="' + s.key + '"]');
    if (!dot) return;
    dot.classList.add('is-' + h);
    const t = h === 'up' ? 'no ar' : h === 'down' ? 'fora' : 'desconhecido';
    dot.setAttribute('title', t);
    // status acessível na PRÓPRIA opção (a cor do dot sozinha falha WCAG 1.4.1)
    const card = dot.closest && dot.closest('.pshell-app');
    if (card) card.setAttribute('aria-label', s.label + ' — ' + t);
  }
  async _probe(path) {
    try {
      const ctrl = typeof AbortController !== 'undefined' ? new AbortController() : null;
      const t = ctrl ? setTimeout(() => ctrl.abort(), 4000) : null;
      const r = await fetch(path, { method: 'HEAD', signal: ctrl ? ctrl.signal : undefined });
      if (t) clearTimeout(t);
      return healthFromStatus(r.status);
    } catch { return 'down'; }
  }
}

if (typeof customElements !== 'undefined' && typeof document !== 'undefined' && !customElements.get('platform-shell')) {
  customElements.define('platform-shell', PlatformShell);
}
