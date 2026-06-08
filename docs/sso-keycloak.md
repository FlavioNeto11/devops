# SSO (Keycloak) + Cofre de Segredos (Sealed Secrets)

Identidade/SSO e gestão de segredos da plataforma NovaIT.

## 1. Keycloak — Identidade/SSO (OIDC)

- **Onde**: namespace `identity` (Deployment `keycloak` + Postgres `keycloak-postgres`), servido em **`/auth`**.
- **Console admin**: `https://dev.nvit.com.br/auth/admin/` (realm **master**, usuário `admin`). Senha no Secret `keycloak-secrets` (selado): `kubectl -n identity get secret keycloak-secrets -o jsonpath="{.data.KC_BOOTSTRAP_ADMIN_PASSWORD}" | base64 -d`.
- **Realm de aplicações**: **`nvit`**. Issuer OIDC: **`https://dev.nvit.com.br/auth/realms/nvit`**.
- **Discovery**: `https://dev.nvit.com.br/auth/realms/nvit/.well-known/openid-configuration`.
- **Grupo**: `platform-admins` (mapeado para admin no Grafana, Argo CD **e DevOps Console**).
- **Usuário admin da plataforma**: **`admin@nvit.com.br`** (realm `nvit`, no grupo `platform-admins`) — a MESMA credencial entra no **Grafana**, **Argo CD** e **DevOps Console**. A senha do admin do realm **master** (usuário `admin`, Console admin do Keycloak) foi alinhada à mesma senha para unificar o acesso. Senhas reais nunca ficam no git (definidas via `kcadm`/SealedSecret).
- **Config-chave** (subpath atrás do Traefik/Cloudflare): `KC_HOSTNAME=https://dev.nvit.com.br/auth`, `KC_HTTP_RELATIVE_PATH=/auth`, `KC_PROXY_HEADERS=xforwarded`, `KC_HTTP_ENABLED=true`. Probes em `:9000/auth/health/{ready,live}`.

> Keycloak é **identidade**, não cofre de segredos. API keys (OpenAI, etc.) vão no **Sealed Secrets** (seção 3).

## 2. Onboardar um app/ferramenta ao SSO

1. **Criar o client** no realm `nvit` (Console admin → Clients → Create, OIDC, confidential, *Standard flow*), com o **Valid redirect URI** do app (ex.: `https://dev.nvit.com.br/<app>/...callback`).
2. **Pegar o client secret** (aba Credentials) e **guardar como Secret + selar** (não versionar plaintext):
   ```powershell
   kubectl create secret generic <app>-oidc -n <ns> --from-literal=client_secret=<secret> --dry-run=client -o yaml | kubectl apply -f -
   # selar (ver secao 3)
   ```
3. **Configurar o OIDC do app** apontando para o issuer `https://dev.nvit.com.br/auth/realms/nvit` (clientID, clientSecret, scopes `openid email profile groups`).
4. **Mapear papéis** via grupo `platform-admins` (claim `groups` — já há um *group membership mapper* nos clients).
5. **Manter o login local** como fallback (não desabilitar).

### Já integrados
| Ferramenta | Como | Fallback local |
|---|---|---|
| **Grafana** (`/grafana`) | `grafana.ini` → `auth.generic_oauth` (realm nvit); `role_attribute_path` mapeia `platform-admins`→Admin; client secret via `envFromSecret: grafana-oidc` | `admin` / `admin` |
| **Argo CD** (`/argocd`) | `argocd-cm.oidc.config` (sem dex); `clientSecret: $argocd-oidc:client_secret`; `argocd-rbac-cm`: `g, platform-admins, role:admin` | usuário `admin` |
| **SICAT** (`/sicat`, login próprio) | OIDC no app (PKCE): backend valida o token no `/userinfo` e emite a sessão SICAT; frontend tem botão "Entrar com Keycloak" | login local + **auth SIGOR/CETESB intacta** |
| **DevOps Console** (`/devops`, SEM login próprio) | Gate no **EDGE**: `oauth2-proxy` (ns `devops-system`) + Traefik **ForwardAuth** protege TODO o `/devops` (SPA, API, pm-api). Client `devops-console` (confidential); restrito a `platform-admins`. Manifests: `console/k8s/auth/` | — (é só Keycloak; sem login local) |

### Padrão para apps com LOGIN PRÓPRIO (referência: SICAT)
Apps que já têm login próprio integram o Keycloak de forma **ADITIVA**, sem quebrar o
login local nem outras autenticações do app (ex.: SIGOR/CETESB). Use o SICAT como template:

- **Client Keycloak**: `publicClient: true` + PKCE `S256`, redirect `https://dev.nvit.com.br/<app>/login/keycloak/callback` (+ `http://localhost:5173/...` p/ dev).
- **Backend** (`apps/sicat/backend/src/services/sicat-auth-service.ts` → `loginSicatViaKeycloak`; rota `POST /v1/sicat/auth/keycloak` em `api-routes.ts`; `config.ts` → `keycloak*`): recebe o `access_token` do frontend, **valida no `/userinfo`** do realm `nvit`, faz **upsert do usuário por e-mail** e emite a MESMA sessão do app (zero mudança no resto).
- **Frontend** (`apps/sicat/frontend/src/services/keycloak.js` = fluxo Authorization Code + PKCE; `views/LoginKeycloakCallbackView.vue` = callback; botão na `LoginView.vue`; action `loginWithKeycloakToken` no store; `api.keycloakLogin`).
- **Regra de ouro**: o login local **continua como fallback** e nenhuma outra auth do app é tocada.

### Apps SEM login próprio — gate no EDGE (referência: DevOps Console)
Apps/painéis sem login próprio são protegidos por um **oauth2-proxy** + Traefik **ForwardAuth**,
sem tocar no código do app. Implementação de referência em `console/k8s/auth/`:

- **oauth2-proxy** (`oauth2-proxy.yaml`, ns `devops-system`): `provider=oidc`, issuer `…/auth/realms/nvit`.
  *Split-horizon*: **login/redirect** usam as URLs públicas (`https://dev.nvit.com.br`, via Cloudflare/Traefik);
  as chamadas **server-to-server** (redeem/jwks/userinfo) vão direto ao Service interno do Keycloak
  (`keycloak.identity.svc:8080/auth/...`). Restringe por `OAUTH2_PROXY_ALLOWED_GROUPS=platform-admins`
  (claim `groups`). Modo ForwardAuth: `--upstreams=static://202` + `--reverse-proxy`.
- **Middlewares** (`auth-routes.yaml`): `console-auth-redirect` (navegação → **302** p/ login do Keycloak)
  e `console-auth-401` (API/XHR → **401**). A rota `/oauth2` (callback/start/auth) aponta para o oauth2-proxy.
- **Segredos** (`sealed-devops-console-oauth.yaml`): `client-secret` + `cookie-secret` (32 bytes) como
  **SealedSecret**. O client `devops-console` (confidential, redirect `…/oauth2/callback`) e o usuário
  `admin@nvit.com.br` (grupo `platform-admins`) são criados via `kcadm` (fora do git).
- **Onboardar outro painel**: criar client confidential no realm → selar os secrets → subir um oauth2-proxy
  análogo → anexar os Middlewares ForwardAuth à IngressRoute do app.

## 3. Sealed Secrets — Cofre de segredos (GitOps)

Permite **versionar segredos criptografados** no git com segurança (só o controller no cluster decifra).

- **Controller**: `kube-system/sealed-secrets-controller`. **CLI**: `kubeseal` (`%LOCALAPPDATA%\kubeseal\kubeseal.exe`).
- **Selar um Secret existente** (criptografa → seguro p/ commit):
  ```powershell
  $ks='%LOCALAPPDATA%\kubeseal\kubeseal.exe'
  kubectl -n <ns> get secret <nome> -o yaml | & $ks --controller-namespace kube-system --controller-name sealed-secrets-controller -o yaml > sealed-<nome>.yaml
  kubectl apply -f sealed-<nome>.yaml   # controller recria/gerencia o Secret
  ```
- **Adotar um Secret já existente** (criado via kubectl): anote `sealedsecrets.bitnami.com/managed=true` e reinicie o controller (`kubectl -n kube-system rollout restart deploy/sealed-secrets-controller`) → o controller assume a posse (ownerReference → SealedSecret).
- **Fluxo de update de segredo** (ex.: nova OpenAI key): editar o `.env` → recriar o Secret → `kubeseal` → commit do `sealed-*.yaml` → Argo/controller aplicam.
- **Já selados**: `sicat-config`, `sicat-db` (apps/sicat/k8s), `keycloak-secrets` (platform/keycloak), `grafana-oidc` (platform/observability), `argocd-oidc` (platform/argocd).

> ⚠️ **Backup da chave do controller**: os SealedSecrets só são decifráveis por ESTE controller. Faça backup:
> `kubectl -n kube-system get secret -l sealedsecrets.bitnami.com/sealed-secrets-key -o yaml > sealed-secrets-key-backup.yaml` (guarde fora do git).

## 4. Login (realm nvit)

Usuário inicial: `admin@nvit.com.br` (grupo `platform-admins`). Crie/gerencie mais usuários no Console admin (`/auth/admin/`, realm nvit). Grafana e Argo CD mostram o botão **"Sign in with Keycloak" / "LOG IN VIA KEYCLOAK"**.
