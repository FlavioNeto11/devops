import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { startKeycloakLogin, exchangeKeycloakCode } from '@flavioneto11/oidc-kit/pkce';
import { api, setTokens, clearTokens, getAccessToken, getRefreshToken } from './api.js';

// Sessão do app (Fase 0 — RBAC/permissões). O Keycloak (realm besc) apenas AUTENTICA;
// a autorização vem 100% da API (user.permissions). Guards de UI são só UX — a API é a autoridade.

const AuthCtx = createContext(null);

// Redirect do PKCE: precisa bater com o client OIDC do realm besc.
function ssoRedirectUri() {
  return `${window.location.origin}/besc/entrar/callback`;
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  // só "carrega" se existe sessão guardada para validar
  const [loading, setLoading] = useState(() => !!(getAccessToken() || getRefreshToken()));

  // Boot: valida a sessão guardada — /auth/me; falhou → tenta UM refresh; falhou → limpa.
  useEffect(() => {
    let alive = true;
    if (!getAccessToken() && !getRefreshToken()) return undefined;
    (async () => {
      try {
        const data = await api.auth.me();
        if (alive) setUser(data.user || null);
      } catch {
        try {
          const rt = getRefreshToken();
          if (!rt) throw new Error('sem refresh token');
          const t = await api.auth.refresh(rt);
          setTokens(t.accessToken, t.refreshToken);
          const data = await api.auth.me();
          if (alive) setUser(data.user || null);
        } catch {
          clearTokens();
          if (alive) setUser(null);
        }
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, []);

  const login = useCallback(async (email, password) => {
    const data = await api.auth.login(email, password);
    setTokens(data.accessToken, data.refreshToken);
    setUser(data.user || null);
    return data.user;
  }, []);

  // Auto-cadastro: cria a conta (pendente, sem papel) e ja loga. O Gestor concede o acesso depois.
  const register = useCallback(async (name, email, password) => {
    const data = await api.auth.register(name, email, password);
    setTokens(data.accessToken, data.refreshToken);
    setUser(data.user || null);
    return data.user;
  }, []);

  // Login SSO (Keycloak realm besc, PKCE): busca a config pública e redireciona.
  const loginSso = useCallback(async () => {
    const cfg = await api.auth.config();
    if (!cfg || !cfg.ssoEnabled) throw new Error('O login com SSO não está disponível neste ambiente.');
    await startKeycloakLogin({ authUrl: cfg.authUrl, clientId: cfg.clientId, redirectUri: ssoRedirectUri() });
  }, []);

  // Callback do SSO: troca o code pelo token do Keycloak e o token pela sessão do app.
  const completeSsoCallback = useCallback(async ({ code, state }) => {
    const cfg = await api.auth.config();
    if (!cfg || !cfg.ssoEnabled) throw new Error('O login com SSO não está disponível neste ambiente.');
    const tok = await exchangeKeycloakCode({
      tokenUrl: cfg.tokenUrl, clientId: cfg.clientId, redirectUri: ssoRedirectUri(), code, state,
    });
    const data = await api.auth.ssoExchange(tok.access_token);
    setTokens(data.accessToken, data.refreshToken);
    setUser(data.user || null);
    return data.user;
  }, []);

  const logout = useCallback(async () => {
    const rt = getRefreshToken();
    try { if (rt) await api.auth.logout(rt); } catch { /* revogação é melhor-esforço */ }
    clearTokens();
    setUser(null);
  }, []);

  // A API é a autoridade; isto só decide o que a UI mostra. '*' = wildcard do admin.
  const hasPerm = useCallback((key) => {
    const perms = (user && Array.isArray(user.permissions)) ? user.permissions : [];
    return perms.some((p) => p && (p.key === key || p.key === '*'));
  }, [user]);

  const isManager = !!(user && Array.isArray(user.roles)
    && (user.roles.includes('manager') || user.roles.includes('admin')));

  // usuário logado sem nenhum papel = conta recém-criada aguardando o Gestor conceder acesso
  const isPending = !!(user && (!Array.isArray(user.roles) || user.roles.length === 0));

  const value = useMemo(
    () => ({ user, loading, login, register, loginSso, completeSsoCallback, logout, hasPerm, isManager, isPending }),
    [user, loading, login, register, loginSso, completeSsoCallback, logout, hasPerm, isManager, isPending],
  );
  return <AuthCtx.Provider value={value}>{children}</AuthCtx.Provider>;
}

export function useAuth() {
  return useContext(AuthCtx);
}
