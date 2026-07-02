// Store de autenticacao (Pinia). Access token no localStorage; /auth/me hidrata a sessao.
import { defineStore } from 'pinia';
import { ref, computed } from 'vue';

const TOKEN_KEY = 'imobia_token';
const BASE = import.meta.env.VITE_API_BASE_URL || '/imobia/api';

async function apiFetch(path, { method = 'GET', body, token } = {}) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      ...(body ? { 'Content-Type': 'application/json' } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  const data = text ? JSON.parse(text) : null;
  if (!res.ok) throw new Error((data && (data.message || data.error)) || `HTTP ${res.status}`);
  return data;
}

export const useAuthStore = defineStore('auth', () => {
  const token = ref(localStorage.getItem(TOKEN_KEY) || '');
  const user = ref(null);
  const organization = ref(null);
  const role = ref('');
  const ready = ref(false);

  const isAuthenticated = computed(() => Boolean(token.value && user.value));

  function persist(t) {
    token.value = t;
    if (t) localStorage.setItem(TOKEN_KEY, t);
    else localStorage.removeItem(TOKEN_KEY);
  }

  function applyAuth(result) {
    persist(result.token);
    user.value = { id: result.principal.userId, email: result.principal.email, name: result.principal.name };
    organization.value = result.organization;
    role.value = result.principal.role;
  }

  async function register(payload) {
    applyAuth(await apiFetch('/auth/register', { method: 'POST', body: payload }));
  }
  async function login(payload) {
    applyAuth(await apiFetch('/auth/login', { method: 'POST', body: payload }));
  }
  async function loginKeycloak(kcToken) {
    applyAuth(await apiFetch('/auth/keycloak', { method: 'POST', body: { token: kcToken } }));
  }

  async function hydrate() {
    if (!token.value) {
      ready.value = true;
      return;
    }
    try {
      const me = await apiFetch('/auth/me', { token: token.value });
      user.value = me.user;
      organization.value = me.organization;
      role.value = me.role;
    } catch {
      persist('');
      user.value = null;
      organization.value = null;
      role.value = '';
    } finally {
      ready.value = true;
    }
  }

  // Hidratacao idempotente (promise cacheada) — o guard do router AGUARDA isso antes de
  // decidir, senao o refresh/deep-link derruba o usuario logado (a navegacao inicial do
  // Vue Router roda antes do hydrate terminar).
  let hydratePromise = null;
  function ensureReady() {
    if (!hydratePromise) hydratePromise = hydrate();
    return hydratePromise;
  }

  function logout() {
    persist('');
    user.value = null;
    organization.value = null;
    role.value = '';
  }

  return { token, user, organization, role, ready, isAuthenticated, register, login, loginKeycloak, hydrate, ensureReady, logout };
});
