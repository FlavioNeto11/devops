# @flavioneto11/oidc-kit

Kit OIDC/Keycloak + sessão da plataforma. **Zero dependências de runtime** (node:crypto + fetch global).
Generaliza o padrão SICAT (validação aditiva no `/userinfo` + sessão própria do app).

## Entry Node (`@flavioneto11/oidc-kit`)
- `validateKeycloakToken(accessToken, { userinfoUrl })` → `{ ok, claims }` · `claimsToProfile(claims)` → `{ email, name }`
- Sessão (port byte-a-byte do SICAT; `prefix` configurável p/ compatibilidade): `createAccessToken`, `verifyAccessToken`, `createRefreshToken`, `hashPassword`/`verifyPassword`, `hashTokenSha256`, `encryptSecret`/`decryptSecret`
- `requireSession({ secret, prefix })` — middleware Express

```js
import { validateKeycloakToken, createAccessToken } from '@flavioneto11/oidc-kit';
const r = await validateKeycloakToken(token, { userinfoUrl: cfg.keycloakUserinfoUrl });
if (!r.ok) throw new Error(r.code);
const session = createAccessToken({ sub: user.id, email }, { secret, ttlSeconds, prefix: 'sicat_access' });
```

## Frontend PKCE (`@flavioneto11/oidc-kit/pkce`)
```js
import { startKeycloakLogin, exchangeKeycloakCode } from '@flavioneto11/oidc-kit/pkce';
await startKeycloakLogin({ authUrl, clientId, redirectUri });           // botao "Entrar com SSO"
const tokens = await exchangeKeycloakCode({ tokenUrl, clientId, redirectUri, code, state }); // no callback
```

## Compatibilidade de sessão (SICAT)
A cripto é **idêntica** à de `apps/sicat/.../lib/sicat-security.ts`; passando `prefix: 'sicat_access'`/`'sicat_refresh'`, os tokens são byte-compatíveis → **sessões vivas continuam válidas** ao adotar o kit.

## Testes
`npm test` (node --test, zero deps). Ver [`docs/standards/shared-libraries-and-versioning.md`](../../docs/standards/shared-libraries-and-versioning.md).
