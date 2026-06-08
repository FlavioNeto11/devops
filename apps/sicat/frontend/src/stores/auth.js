import { reactive, computed } from 'vue';
import {
  sicatLogin,
  keycloakLogin,
  sicatRegister,
  refreshSicatAuthSession,
  listSicatCetesbAccounts,
  addSicatCetesbAccount,
  activateSicatCetesbAccount,
  removeSicatCetesbAccount,
  getSicatSession,
  clearSicatSessionStorage,
  SICAT_ACCESS_TOKEN_KEY,
  SICAT_REFRESH_TOKEN_KEY,
  SICAT_EXPIRES_AT_KEY,
  SICAT_USER_KEY,
  SICAT_ACTIVE_ACCOUNT_KEY,
  SICAT_SESSION_CONTEXT_KEY,
  SICAT_INTEGRATION_ACCOUNT_ID_KEY
} from '../services/api.js';

const TOKEN_KEY = SICAT_ACCESS_TOKEN_KEY;
const REFRESH_TOKEN_KEY = SICAT_REFRESH_TOKEN_KEY;
const EXPIRES_AT_KEY = SICAT_EXPIRES_AT_KEY;
const USER_KEY = SICAT_USER_KEY;
const ACTIVE_ACCOUNT_KEY = SICAT_ACTIVE_ACCOUNT_KEY;
const INTEGRATION_ACCOUNT_ID_KEY = SICAT_INTEGRATION_ACCOUNT_ID_KEY;
const SESSION_CONTEXT_KEY = SICAT_SESSION_CONTEXT_KEY;
const DEFAULT_INTEGRATION_ACCOUNT_ID = (import.meta.env.VITE_INTEGRATION_ACCOUNT_ID || '').trim();
const SESSION_WARNING_SECONDS = 5 * 60;
const SICAT_SESSION_REFRESHED_EVENT = 'sicat-session-refreshed';
const SICAT_SESSION_CLEARED_EVENT = 'sicat-session-cleared';

let authValidationPromise = null;

function safeParse(rawValue) {
  try {
    return JSON.parse(rawValue || 'null');
  } catch {
    return null;
  }
}

function mapActiveAccountToPartner(activeAccount) {
  if (!activeAccount) {
    return null;
  }

  return {
    partnerCode: Number(activeAccount.partnerCode || 0),
    description: activeAccount.partnerName || '',
    tradeName: activeAccount.partnerName || '',
    document: activeAccount.partnerDocument || ''
  };
}

function normalizeSessionContext(sessionContext) {
  if (!sessionContext) {
    return null;
  }

  return {
    ...sessionContext,
    id: sessionContext.id || sessionContext.sessionContextId || null,
    sessionContextId: sessionContext.sessionContextId || sessionContext.id || null
  };
}

const state = reactive({
  token: localStorage.getItem(TOKEN_KEY) || null,
  refreshToken: localStorage.getItem(REFRESH_TOKEN_KEY) || null,
  expiresAt: localStorage.getItem(EXPIRES_AT_KEY) || null,
  user: safeParse(localStorage.getItem(USER_KEY)),
  activeAccount: safeParse(localStorage.getItem(ACTIVE_ACCOUNT_KEY)),
  partner: mapActiveAccountToPartner(safeParse(localStorage.getItem(ACTIVE_ACCOUNT_KEY))),
  integrationAccountId: localStorage.getItem(INTEGRATION_ACCOUNT_ID_KEY) || DEFAULT_INTEGRATION_ACCOUNT_ID || '',
  sessionContext: normalizeSessionContext(safeParse(localStorage.getItem(SESSION_CONTEXT_KEY))),
  accounts: [],
  loading: false,
  error: null
});

function persistSicatSession({ accessToken, refreshToken, expiresAt, user }) {
  localStorage.setItem(TOKEN_KEY, String(accessToken || ''));
  localStorage.setItem(REFRESH_TOKEN_KEY, String(refreshToken || ''));
  localStorage.setItem(EXPIRES_AT_KEY, String(expiresAt || ''));
  localStorage.setItem(USER_KEY, JSON.stringify(user || null));
}

function applySicatUser(user) {
  const hasMeaningfulIdentity = Boolean(
    user
    && typeof user === 'object'
    && (String(user.userId || '').trim() || String(user.email || '').trim() || String(user.name || '').trim())
  );

  const normalizedUser = hasMeaningfulIdentity ? user : null;

  state.user = normalizedUser;

  if (normalizedUser) {
    localStorage.setItem(USER_KEY, JSON.stringify(normalizedUser));
  } else {
    localStorage.removeItem(USER_KEY);
  }
}

function persistActiveCetesbContext(activeAccount, sessionContext) {
  const normalizedSessionContext = normalizeSessionContext(sessionContext);
  const integrationAccountId = normalizedSessionContext?.integrationAccountId || '';

  if (activeAccount) {
    localStorage.setItem(ACTIVE_ACCOUNT_KEY, JSON.stringify(activeAccount));
  } else {
    localStorage.removeItem(ACTIVE_ACCOUNT_KEY);
  }

  if (normalizedSessionContext) {
    localStorage.setItem(SESSION_CONTEXT_KEY, JSON.stringify(normalizedSessionContext));
  } else {
    localStorage.removeItem(SESSION_CONTEXT_KEY);
  }

  if (integrationAccountId) {
    localStorage.setItem(INTEGRATION_ACCOUNT_ID_KEY, integrationAccountId);
  } else {
    localStorage.removeItem(INTEGRATION_ACCOUNT_ID_KEY);
  }
}

function clearAuth() {
  clearSicatSessionStorage();
}

function applySessionTokens({ accessToken, refreshToken, expiresAt, user }) {
  state.token = String(accessToken || '') || null;
  state.refreshToken = String(refreshToken || '') || null;
  state.expiresAt = String(expiresAt || '') || null;

  if (user !== undefined) {
    applySicatUser(user || null);
  }
}

function applyLoggedOutState() {
  state.token = null;
  state.refreshToken = null;
  state.expiresAt = null;
  state.user = null;
  state.activeAccount = null;
  state.partner = null;
  state.accounts = [];
  state.integrationAccountId = '';
  state.sessionContext = null;
  state.error = null;
}

function hasValidToken() {
  if (!state.token || !state.expiresAt) {
    return false;
  }

  const expiresAtDate = new Date(state.expiresAt);
  return !Number.isNaN(expiresAtDate.getTime()) && new Date() < expiresAtDate;
}

if (typeof globalThis.addEventListener === 'function') {
  globalThis.addEventListener(SICAT_SESSION_REFRESHED_EVENT, (event) => {
    applySessionTokens(event?.detail || {});
  });

  globalThis.addEventListener(SICAT_SESSION_CLEARED_EVENT, () => {
    applyLoggedOutState();
  });
}

function applyActiveSession(activeSession) {
  const nextUser = activeSession?.user && typeof activeSession.user === 'object'
    ? activeSession.user
    : null;
  applySicatUser(nextUser || state.user || null);

  const activeAccount = activeSession?.activeAccount || null;
  const sessionContext = normalizeSessionContext(activeSession?.sessionContext || null);
  const integrationAccountId = sessionContext?.integrationAccountId || '';

  state.activeAccount = activeAccount;
  state.partner = mapActiveAccountToPartner(activeAccount);
  state.sessionContext = sessionContext;
  state.integrationAccountId = integrationAccountId;

  persistActiveCetesbContext(activeAccount, sessionContext);
}

function getRemainingSessionSeconds(expiresAt) {
  if (!expiresAt) {
    return 0;
  }

  const diff = Math.floor((new Date(expiresAt).getTime() - Date.now()) / 1000);
  return Math.max(0, diff);
}

async function ensureSessionContextReady({ force = false } = {}) {
  const alreadyReady = Boolean(state.sessionContext?.id && state.integrationAccountId);
  if (alreadyReady && !force) {
    return true;
  }

  const syncedSession = await syncSicatSession();
  if (!syncedSession) {
    return false;
  }

  return Boolean(state.sessionContext?.id && state.integrationAccountId);
}

async function login(email, password) {
  state.loading = true;
  state.error = null;

  try {
    const normalizedEmail = String(email || '').trim();
    if (!normalizedEmail) {
      throw new Error('Informe o e-mail para autenticação no SICAT.');
    }

    const payload = await sicatLogin({ email: normalizedEmail, password: String(password || '') });
    const { accessToken, refreshToken, expiresAt, user } = payload;

    state.token = accessToken;
    state.refreshToken = refreshToken;
    state.expiresAt = expiresAt;
    applySicatUser(user);
    state.activeAccount = null;
    state.partner = null;
    state.integrationAccountId = '';
    state.sessionContext = null;

    persistSicatSession({ accessToken, refreshToken, expiresAt, user });
    persistActiveCetesbContext(null, null);

    return true;
  } catch (err) {
    state.error = err?.message || 'Falha ao autenticar no SICAT.';
    return false;
  } finally {
    state.loading = false;
  }
}

async function loginWithKeycloakToken(accessToken) {
  state.loading = true;
  state.error = null;

  try {
    const payload = await keycloakLogin(String(accessToken || ''));
    const { accessToken: token, refreshToken, expiresAt, user } = payload;

    state.token = token;
    state.refreshToken = refreshToken;
    state.expiresAt = expiresAt;
    applySicatUser(user);
    state.activeAccount = null;
    state.partner = null;
    state.integrationAccountId = '';
    state.sessionContext = null;

    persistSicatSession({ accessToken: token, refreshToken, expiresAt, user });
    persistActiveCetesbContext(null, null);

    return true;
  } catch (err) {
    state.error = err?.message || 'Falha ao autenticar via Keycloak.';
    return false;
  } finally {
    state.loading = false;
  }
}

async function register(name, email, password) {
  state.loading = true;
  state.error = null;

  try {
    const normalizedName = String(name || '').trim();
    const normalizedEmail = String(email || '').trim();

    if (!normalizedName || !normalizedEmail) {
      throw new Error('Informe nome e e-mail para criar a conta SICAT.');
    }

    const payload = await sicatRegister({
      name: normalizedName,
      email: normalizedEmail,
      password: String(password || '')
    });

    const { accessToken, refreshToken, expiresAt, user } = payload;

    state.token = accessToken;
    state.refreshToken = refreshToken;
    state.expiresAt = expiresAt;
    applySicatUser(user);
    state.activeAccount = null;
    state.partner = null;
    state.integrationAccountId = '';
    state.sessionContext = null;

    persistSicatSession({ accessToken, refreshToken, expiresAt, user });
    persistActiveCetesbContext(null, null);

    return true;
  } catch (err) {
    state.error = err?.message || 'Falha ao criar usuário SICAT.';
    return false;
  } finally {
    state.loading = false;
  }
}

async function loadCetesbAccounts() {
  if (!(await checkAuth())) {
    state.accounts = [];
    return [];
  }

  state.loading = true;
  state.error = null;

  try {
    const response = await listSicatCetesbAccounts();
    state.accounts = Array.isArray(response?.accounts) ? response.accounts : [];

    const activeAccountId = response?.activeAccountId || state.activeAccount?.accountId || null;
    if (activeAccountId) {
      const active = state.accounts.find((account) => account.accountId === activeAccountId) || null;
      if (active) {
        state.activeAccount = active;
        state.partner = mapActiveAccountToPartner(active);
        localStorage.setItem(ACTIVE_ACCOUNT_KEY, JSON.stringify(active));
      }
    }

    return state.accounts;
  } catch (err) {
    state.error = err?.message || 'Falha ao listar contas CETESB.';
    return [];
  } finally {
    state.loading = false;
  }
}

async function addCetesbAccount(payload) {
  state.loading = true;
  state.error = null;

  try {
    const createdAccount = await addSicatCetesbAccount(payload);
    state.accounts = [createdAccount, ...state.accounts.filter((account) => account.accountId !== createdAccount.accountId)];
    return createdAccount;
  } catch (err) {
    state.error = err?.message || 'Falha ao adicionar conta CETESB.';
    throw err;
  } finally {
    state.loading = false;
  }
}

async function activateCetesbAccount(accountId, { refreshAccounts = true } = {}) {
  state.loading = true;
  state.error = null;

  try {
    const activeSession = await activateSicatCetesbAccount(accountId);
    applyActiveSession(activeSession);

    if (refreshAccounts) {
      await loadCetesbAccounts();
    }

    return activeSession;
  } catch (err) {
    state.error = err?.message || 'Falha ao ativar conta CETESB.';
    throw err;
  } finally {
    state.loading = false;
  }
}

async function removeCetesbAccount(accountId) {
  state.loading = true;
  state.error = null;

  try {
    await removeSicatCetesbAccount(accountId);

    const wasActive = state.activeAccount?.accountId === accountId;
    state.accounts = state.accounts.filter((account) => account.accountId !== accountId);

    if (wasActive) {
      clearActiveCetesbContext();
    }

    return true;
  } catch (err) {
    state.error = err?.message || 'Falha ao remover conta CETESB.';
    throw err;
  } finally {
    state.loading = false;
  }
}

async function syncSicatSession(options = {}) {
  const { throwOnError = false } = options;

  if (!(await checkAuth())) {
    return null;
  }

  try {
    const activeSession = await getSicatSession();
    applyActiveSession(activeSession);
    return activeSession;
  } catch (err) {
    if (throwOnError) {
      throw err;
    }
    return null;
  }
}

async function refreshOperationalContext() {
  if (!(await checkAuth())) {
    return {
      authenticated: false,
      hasActiveCetesbAccount: false,
      sessionContextId: null,
      integrationAccountId: ''
    };
  }

  state.loading = true;
  state.error = null;

  try {
    const [session] = await Promise.all([
      syncSicatSession({ throwOnError: true }),
      loadCetesbAccounts()
    ]);

    return {
      authenticated: true,
      hasActiveCetesbAccount: Boolean(state.activeAccount?.accountId && state.sessionContext?.id && state.integrationAccountId),
      sessionContextId: state.sessionContext?.id || session?.sessionContext?.sessionContextId || null,
      integrationAccountId: state.integrationAccountId || session?.sessionContext?.integrationAccountId || ''
    };
  } catch (err) {
    state.error = err?.message || 'Falha ao sincronizar sessão operacional.';
    throw err;
  } finally {
    state.loading = false;
  }
}

function clearActiveCetesbContext() {
  state.activeAccount = null;
  state.partner = null;
  state.integrationAccountId = '';
  state.sessionContext = null;
  state.error = null;

  persistActiveCetesbContext(null, null);
}

function logout() {
  applyLoggedOutState();
  clearAuth();
}

async function checkAuth(options = {}) {
  const { allowRefresh = true } = options;

  if (!hasValidToken()) {
    if (!allowRefresh || !state.refreshToken) {
      logout();
      return false;
    }

    if (!authValidationPromise) {
      authValidationPromise = (async () => {
        try {
          await refreshSicatAuthSession({ refreshToken: state.refreshToken });
          return hasValidToken();
        } catch {
          applyLoggedOutState();
          return false;
        } finally {
          authValidationPromise = null;
        }
      })();
    }

    return authValidationPromise;
  }

  return true;
}

function hasOperationalAccess() {
  return hasValidToken() && Boolean(state.activeAccount?.accountId && state.sessionContext?.id && state.integrationAccountId);
}

function getToken() {
  return state.token;
}

export function useAuthStore() {
  const isAuthenticated = computed(() => hasValidToken());
  const canAccessAdmin = computed(() => Boolean(state.user?.adminAccess?.allowed));
  const hasActiveCetesbAccount = computed(() => {
    return Boolean(state.activeAccount?.accountId && state.sessionContext?.id && state.integrationAccountId);
  });
  const sessionRemainingSeconds = computed(() => getRemainingSessionSeconds(state.expiresAt));
  const sessionExpiryState = computed(() => {
    if (!state.expiresAt) {
      return 'missing';
    }

    const remaining = sessionRemainingSeconds.value;
    if (remaining <= 0) {
      return 'expired';
    }

    if (remaining <= SESSION_WARNING_SECONDS) {
      return 'warning';
    }

    return 'healthy';
  });
  const sessionExpiryLabel = computed(() => {
    const remaining = sessionRemainingSeconds.value;
    if (remaining <= 0) {
      return 'Sessão expirada';
    }

    if (remaining < 60) {
      return `Expira em ${remaining}s`;
    }

    if (remaining < 3600) {
      return `Expira em ${Math.floor(remaining / 60)} min`;
    }

    return `Expira em ${Math.floor(remaining / 3600)}h ${Math.floor((remaining % 3600) / 60)}min`;
  });

  const conversationScope = computed(() => ({
    integrationAccountId: state.integrationAccountId || '',
    sessionContextId: state.sessionContext?.id || state.sessionContext?.sessionContextId || '',
    accountId: state.activeAccount?.accountId || '',
    userId: state.user?.userId || state.user?.email || ''
  }));

  return {
    // State
    isAuthenticated,
    hasActiveCetesbAccount,
    token: computed(() => state.token),
    refreshToken: computed(() => state.refreshToken),
    expiresAt: computed(() => state.expiresAt),
    user: computed(() => state.user),
    canAccessAdmin,
    activeAccount: computed(() => state.activeAccount),
    accounts: computed(() => state.accounts),
    partner: computed(() => state.partner),
    integrationAccountId: computed(() => state.integrationAccountId),
    sessionContext: computed(() => state.sessionContext),
    sessionRemainingSeconds,
    sessionExpiryState,
    sessionExpiryLabel,
    conversationScope,
    loading: computed(() => state.loading),
    error: computed(() => state.error),
    
    // Actions
    login,
    loginWithKeycloakToken,
    register,
    loadCetesbAccounts,
    addCetesbAccount,
    activateCetesbAccount,
    removeCetesbAccount,
    syncSicatSession,
    refreshOperationalContext,
    ensureSessionContextReady,
    clearActiveCetesbContext,
    logout,
    checkAuth,
    hasOperationalAccess,
    getToken
  };
}
