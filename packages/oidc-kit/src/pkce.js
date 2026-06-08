// PKCE (Authorization Code + PKCE) para frontend — generaliza o fluxo do SICAT.
// SOMENTE BROWSER (usa window/crypto.subtle/sessionStorage). Importe via
// '@flavioneto11/oidc-kit/pkce' (nao e carregado pelo entry Node).

function base64url(bytes) {
  const b = new Uint8Array(bytes);
  let s = '';
  for (let i = 0; i < b.length; i += 1) s += String.fromCharCode(b[i]);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
async function sha256(text) {
  return crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
}
const KEY_VERIFIER = 'oidc_pkce_verifier';
const KEY_STATE = 'oidc_pkce_state';

/** Inicia o login: gera verifier/challenge/state e redireciona ao authorize do Keycloak. */
export async function startKeycloakLogin({ authUrl, clientId, redirectUri, scope = 'openid email profile' }) {
  const verifier = base64url(crypto.getRandomValues(new Uint8Array(32)));
  const challenge = base64url(await sha256(verifier));
  const state = base64url(crypto.getRandomValues(new Uint8Array(16)));
  sessionStorage.setItem(KEY_VERIFIER, verifier);
  sessionStorage.setItem(KEY_STATE, state);
  const url = new URL(authUrl);
  url.search = new URLSearchParams({
    response_type: 'code', client_id: clientId, redirect_uri: redirectUri,
    scope, state, code_challenge: challenge, code_challenge_method: 'S256',
  }).toString();
  window.location.assign(url.toString());
}

/** Troca o code pelo token no callback. Retorna o JSON do token (access_token, ...). */
export async function exchangeKeycloakCode({ tokenUrl, clientId, redirectUri, code, state }) {
  if (state && sessionStorage.getItem(KEY_STATE) !== state) throw new Error('OIDC state mismatch');
  const verifier = sessionStorage.getItem(KEY_VERIFIER);
  if (!verifier) throw new Error('OIDC verifier ausente (sessao expirada?)');
  const body = new URLSearchParams({
    grant_type: 'authorization_code', client_id: clientId, redirect_uri: redirectUri, code, code_verifier: verifier,
  });
  const resp = await fetch(tokenUrl, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body });
  sessionStorage.removeItem(KEY_VERIFIER);
  sessionStorage.removeItem(KEY_STATE);
  if (!resp.ok) throw new Error('OIDC token exchange falhou: ' + resp.status);
  return resp.json();
}
