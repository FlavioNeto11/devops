// Validacao de token Keycloak via /userinfo — padrao SICAT generalizado.
// O app envia o access_token do Keycloak; validamos chamando o /userinfo do realm
// (so aceita tokens daquele IdP) e devolvemos os claims. O app entao provisiona seu
// usuario e emite a PROPRIA sessao (aditivo; nao toca outras auths).

/**
 * @param {string} accessToken access_token do Keycloak (enviado pelo frontend).
 * @param {object} opts { userinfoUrl, fetchImpl? } — fetchImpl injetavel p/ testes.
 * @returns {Promise<{ok:true,claims:object}|{ok:false,code:string}>}
 */
export async function validateKeycloakToken(accessToken, { userinfoUrl, fetchImpl } = {}) {
  const token = String(accessToken || '').trim();
  if (!token) return { ok: false, code: 'MISSING_TOKEN' };
  if (!userinfoUrl) return { ok: false, code: 'NO_USERINFO_URL' };
  const doFetch = fetchImpl || fetch;
  let resp;
  try {
    resp = await doFetch(userinfoUrl, { headers: { Authorization: `Bearer ${token}` } });
  } catch {
    return { ok: false, code: 'KEYCLOAK_UNAVAILABLE' };
  }
  if (!resp.ok) return { ok: false, code: 'INVALID_TOKEN' };
  let claims;
  try { claims = await resp.json(); } catch { return { ok: false, code: 'INVALID_TOKEN' }; }
  return { ok: true, claims };
}

/** Extrai e-mail/nome dos claims do Keycloak (convencao da plataforma). */
export function claimsToProfile(claims) {
  const email = String((claims && claims.email) || '').trim().toLowerCase();
  const name = String((claims && (claims.name || claims.preferred_username)) || email);
  return { email, name };
}
