// @flavioneto11/oidc-kit — entrada Node (sessao + Keycloak + adapter Express).
// O helper de PKCE (browser) fica em '@flavioneto11/oidc-kit/pkce' (NAO importado aqui,
// para nao carregar APIs de window em runtime Node).
export * from './session.js';
export * from './keycloak.js';
export { requireSession } from './express.js';
