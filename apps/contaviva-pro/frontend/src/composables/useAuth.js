// useAuth.js — sessão própria do app (bloco contas-acesso). SINGLETON reativo: a fonte do access
// token é o api.js (localStorage, chave única); aqui guardamos o refresh token + o usuário em memória
// (refresh persistido em localStorage p/ sobreviver a reload). login/register/logout/me + bootstrap.
// O api.js dispara 'auth:logout' no 401 -> derrubamos a sessão reativa. SSO Keycloak é aditivo/opcional.
import { ref, computed } from 'vue';
import { auth as authApi, getToken, setToken } from '../api.js';

const REFRESH_KEY = 'contaviva-pro.refreshToken';
const user = ref(null);
const ready = ref(false); // true após a 1ª tentativa de hidratar (bootstrap)
const isAdmin = computed(() => !!user.value && user.value.role === 'admin');
let bootPromise = null;

function readRefresh() { try { return localStorage.getItem(REFRESH_KEY) || ''; } catch { return ''; } }
function writeRefresh(t) { try { if (t) localStorage.setItem(REFRESH_KEY, t); else localStorage.removeItem(REFRESH_KEY); } catch {} }

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

// o api.js derruba o token no 401 e emite este evento — sincroniza o estado reativo (uma vez).
if (typeof window !== 'undefined' && !window.__authLogoutWired) {
  window.__authLogoutWired = true;
  window.addEventListener('auth:logout', () => { writeRefresh(null); user.value = null; });
}

export function useAuth() {
  return { user, ready, isAdmin, login, register, logout, fetchMe, bootstrap, updateMe, ssoExchange };
}
