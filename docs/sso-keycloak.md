# SSO (Keycloak) + Cofre de Segredos (Sealed Secrets)

Identidade/SSO e gestão de segredos da plataforma NovaIT.

## 1. Keycloak — Identidade/SSO (OIDC)

- **Onde**: namespace `identity` (Deployment `keycloak` + Postgres `keycloak-postgres`), servido em **`/auth`**.
- **Console admin**: `https://dev.nvit.com.br/auth/admin/` (realm **master**, usuário `admin`). Senha no Secret `keycloak-secrets` (selado): `kubectl -n identity get secret keycloak-secrets -o jsonpath="{.data.KC_BOOTSTRAP_ADMIN_PASSWORD}" | base64 -d`.
- **Realm de aplicações**: **`nvit`**. Issuer OIDC: **`https://dev.nvit.com.br/auth/realms/nvit`**.
- **Discovery**: `https://dev.nvit.com.br/auth/realms/nvit/.well-known/openid-configuration`.
- **Grupo**: `platform-admins` (mapeado para admin no Grafana e no Argo CD).
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

### Padrão para apps com LOGIN PRÓPRIO (referência: SICAT)
Apps que já têm login próprio integram o Keycloak de forma **ADITIVA**, sem quebrar o
login local nem outras autenticações do app (ex.: SIGOR/CETESB). Use o SICAT como template:

- **Client Keycloak**: `publicClient: true` + PKCE `S256`, redirect `https://dev.nvit.com.br/<app>/login/keycloak/callback` (+ `http://localhost:5173/...` p/ dev).
- **Backend** (`apps/sicat/backend/src/services/sicat-auth-service.ts` → `loginSicatViaKeycloak`; rota `POST /v1/sicat/auth/keycloak` em `api-routes.ts`; `config.ts` → `keycloak*`): recebe o `access_token` do frontend, **valida no `/userinfo`** do realm `nvit`, faz **upsert do usuário por e-mail** e emite a MESMA sessão do app (zero mudança no resto).
- **Frontend** (`apps/sicat/frontend/src/services/keycloak.js` = fluxo Authorization Code + PKCE; `views/LoginKeycloakCallbackView.vue` = callback; botão na `LoginView.vue`; action `loginWithKeycloakToken` no store; `api.keycloakLogin`).
- **Regra de ouro**: o login local **continua como fallback** e nenhuma outra auth do app é tocada.

### Apps SEM login próprio
Mais simples: gatear no edge (futuro: **oauth2-proxy / Traefik ForwardAuth**) — opt-in por
Middleware na IngressRoute, sem mexer no código do app (assim novas apps não quebram).

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
