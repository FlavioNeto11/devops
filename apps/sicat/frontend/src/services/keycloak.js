// OIDC Authorization Code + PKCE com o Keycloak (realm nvit) para o login PROPRIO
// do SICAT. NAO afeta a autenticacao SIGOR/CETESB (essa continua igual).
const REALM_URL = import.meta.env.VITE_KEYCLOAK_REALM_URL || 'https://dev.nvit.com.br/auth/realms/nvit';
const CLIENT_ID = import.meta.env.VITE_KEYCLOAK_CLIENT_ID || 'sicat';
const AUTH_URL = `${REALM_URL}/protocol/openid-connect/auth`;
const TOKEN_URL = `${REALM_URL}/protocol/openid-connect/token`;
const STATE_KEY = 'sicat_oidc_state';
const VERIFIER_KEY = 'sicat_oidc_verifier';

// BASE_URL = '/sicat/' em producao e '/' em dev -> casa com o redirect do client.
function redirectUri() {
  return `${window.location.origin}${import.meta.env.BASE_URL}login/keycloak/callback`;
}

function base64url(bytes) {
  const str = btoa(String.fromCharCode(...new Uint8Array(bytes)));
  return str.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function randomString(len = 48) {
  const arr = new Uint8Array(len);
  crypto.getRandomValues(arr);
  return base64url(arr);
}

async function sha256Base64Url(text) {
  const data = new TextEncoder().encode(text);
  const hash = await crypto.subtle.digest('SHA-256', data);
  return base64url(hash);
}

// Inicia o fluxo: gera PKCE/state, guarda em sessionStorage e redireciona ao Keycloak.
export async function startKeycloakLogin() {
  const verifier = randomString(48);
  const challenge = await sha256Base64Url(verifier);
  const state = randomString(16);
  sessionStorage.setItem(STATE_KEY, state);
  sessionStorage.setItem(VERIFIER_KEY, verifier);

  const params = new URLSearchParams({
    client_id: CLIENT_ID,
    redirect_uri: redirectUri(),
    response_type: 'code',
    scope: 'openid email profile',
    state,
    code_challenge: challenge,
    code_challenge_method: 'S256'
  });
  window.location.assign(`${AUTH_URL}?${params.toString()}`);
}

// No callback: valida o state e troca o code pelo access_token (client publico + PKCE).
export async function exchangeKeycloakCode(code, returnedState) {
  const state = sessionStorage.getItem(STATE_KEY);
  const verifier = sessionStorage.getItem(VERIFIER_KEY);
  sessionStorage.removeItem(STATE_KEY);
  sessionStorage.removeItem(VERIFIER_KEY);

  if (!code || !state || returnedState !== state || !verifier) {
    throw new Error('Estado OIDC invalido ou expirado.');
  }

  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    client_id: CLIENT_ID,
    code,
    redirect_uri: redirectUri(),
    code_verifier: verifier
  });
  const resp = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body
  });
  if (!resp.ok) {
    throw new Error('Falha ao trocar o codigo no Keycloak.');
  }
  const data = await resp.json();
  if (!data?.access_token) {
    throw new Error('Keycloak nao retornou access_token.');
  }
  return data.access_token;
}
