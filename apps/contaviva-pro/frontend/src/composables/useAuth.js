// useAuth.js — sessão própria do app (bloco contas-acesso). SINGLETON reativo: a fonte do access
// token é o api.js (localStorage, chave única); aqui guardamos o refresh token + o usuário em memória
// (refresh persistido em localStorage p/ sobreviver a reload). login/register/logout/me + bootstrap.
// O api.js dispara 'auth:logout' no 401 -> derrubamos a sessão reativa. SSO Keycloak é aditivo/opcional.
import { ref, computed } from 'vue';
import { auth as authApi, getToken, setToken, getRefresh, setRefresh } from '../api.js';

const user = ref(null);
const ready = ref(false); // true após a 1ª tentativa de hidratar (bootstrap)
const isAdmin = computed(() => !!user.value && user.value.role === 'admin');
let bootPromise = null;

// refresh token: fonte única no api.js (mesma chave/store do access token). Reusamos os helpers p/
// que o interceptor de 401 do api.js possa renovar a sessão antes de deslogar.
function readRefresh() { return getRefresh(); }
function writeRefresh(t) { setRefresh(t); }

// guarda tokens + usuário a partir da resposta de register/login/sso.
function applySession(res) {
  if (!res) return null;
  if (res.accessToken) setToken(res.accessToken);
  if (res.refreshToken) writeRefresh(res.refreshToken);
  if (res.user) user.value = res.user;
  return user.value;
}

function clearSession() { setToken(null); writeRefresh(null); user.value = null; }

async function login(email, password) { return applySession(await authApi.login({ email, password })); }
async function register(payload) { return applySession(await authApi.register(payload)); }
async function ssoExchange(accessToken) { return applySession(await authApi.ssoExchange(accessToken)); }

async function logout() {
  const rt = readRefresh();
  try { if (rt) await authApi.logout(rt); } catch {} // best-effort; derruba a sessão local de qualquer jeito
  clearSession();
}

// refresca o usuário a partir do /me (usa o Bearer guardado). Limpa a sessão se o token não valer.
async function fetchMe() {
  if (!getToken()) { user.value = null; return null; }
  try { user.value = await authApi.me(); return user.value; }
  catch (e) { if (e && e.status === 401) clearSession(); else user.value = user.value || null; return null; }
}

// hidrata a sessão 1x (idempotente): se há access token, busca /me; senão tenta o refresh guardado.
async function bootstrap() {
  if (ready.value) return user.value;
  if (bootPromise) return bootPromise;
  bootPromise = (async () => {
    try {
      if (getToken()) { await fetchMe(); }
      else { const rt = readRefresh(); if (rt) { try { const r = await authApi.refresh(rt); if (r && r.accessToken) { setToken(r.accessToken); await fetchMe(); } } catch { clearSession(); } } }
    } finally { ready.value = true; }
    return user.value;
  })();
  return bootPromise;
}

// atualiza o próprio perfil (nome/senha) e reflete o nome no estado reativo.
async function updateMe(payload) { const r = await authApi.updateMe(payload); if (r && r.user) user.value = r.user; return user.value; }

// Sessão derrubada de fato (refresh ausente/inválido): manda o usuário ao /login preservando a rota
// atual em ?redirect= — sem acoplar o router aqui (navegação por URL sob o base do app). Idempotente:
// não redireciona se já estamos no login (evita loop quando duas 401 disparam o evento).
function redirectToLogin() {
  if (typeof window === 'undefined') return;
  const base = import.meta.env.BASE_URL || '/';
  const loc = window.location;
  const full = loc.pathname + loc.search;
  const appPath = full.indexOf(base) === 0 ? full.slice(base.length - 1) : full; // mantém a '/' inicial
  if (appPath.indexOf('/login') === 0) return; // já no login — nada a fazer
  try { loc.assign(base + 'login?redirect=' + encodeURIComponent(appPath)); } catch {}
}

// o api.js só emite este evento quando o refresh falhou/está ausente: sincroniza o estado reativo
// (uma vez) e tira o usuário do beco sem saída, levando-o ao /login (fim de UX-CVPRO-003/004).
if (typeof window !== 'undefined' && !window.__authLogoutWired) {
  window.__authLogoutWired = true;
  window.addEventListener('auth:logout', () => { writeRefresh(null); user.value = null; redirectToLogin(); });
}

export function useAuth() {
  return { user, ready, isAdmin, login, register, logout, fetchMe, bootstrap, updateMe, ssoExchange };
}
