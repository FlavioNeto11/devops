# ADR-004 — Identidade: realm Keycloak dedicado `besc` + oidc-kit (auth no app, não na borda)

Status: DECISÃO — revisar

Contexto: O besc-api não tem nenhuma camada de identidade — zero middleware de auth e CORS `*`
(`api/src/server.js:31`); o IngressRoute serve tudo público. O marketplace exige três populações
(investidor self-service, advogado/juiz por convite, gestor provisionado — ver
[01-rbac-permissoes](../01-rbac-permissoes.md) §1), mas o portal de conhecimento
(biblioteca/jurisprudência/glossário/referência) **deve permanecer público** por ser o funil de
aquisição. A plataforma já oferece dois padrões prontos: (a) SSO de borda do Console — oauth2-proxy
ForwardAuth contra o realm `nvit` (`console/k8s/auth/`); (b) `packages/oidc-kit` — validação de
token Keycloak via `/userinfo` + sessão própria do app (padrão SICAT, `requireSession` no Express,
PKCE no browser).

Decisão: Criar um **realm Keycloak dedicado `besc`** no Keycloak existente (ns `identity`) e fazer
a autenticação **dentro do besc-api** com `@flavioneto11/oidc-kit`: a SPA obtém o token por PKCE, o
backend valida via `/userinfo` (split-horizon, URL interna do cluster) e emite **sessão própria**
(`besc_access`/`besc_refresh`, refresh persistido como hash SHA-256 em `user_sessions`). Login
local (email+senha) permanece apenas como bootstrap/fallback (`BESC_BOOTSTRAP_EMAIL/PASSWORD`). O
auto-registro do realm cria contas que o app provisiona **somente** como `investor` pendente de
aprovação; a autorização (RBAC) é 100% local em dados, nunca derivada de claims/groups do token. O
CORS `*` é substituído por allowlist do próprio host + credenciais. Nenhum ForwardAuth é adicionado
às rotas `/besc`.

Alternativas rejeitadas:
- **Realm `nvit` (o do Console/operadores)** — misturaria investidores públicos self-service com os
  operadores da plataforma; `OAUTH2_PROXY_ALLOWED_GROUPS` e as políticas do realm são calibrados
  para operadores; abrir auto-registro no realm operacional é risco direto de escalada.
- **Só contas locais (padrão SICAT puro, sem Keycloak)** — reinventa reset de senha, verificação de
  e-mail e MFA; sem SSO; pior caminho para o KYC futuro (required actions do Keycloak). Sobrevive
  apenas como fallback de bootstrap.
- **ForwardAuth de borda (padrão Console, oauth2-proxy)** — o middleware do Traefik gatearia o
  path **inteiro** `/besc`: mataria o portal público de conhecimento e o catálogo teaser do
  marketplace, que precisam responder a anônimos. A mistura público/privado é por rota, e isso só
  o app resolve. Além disso, os headers `X-Auth-Request-*` da borda dariam identidade, mas não o
  RBAC fino por recurso/escopo que o domínio exige.

Consequências: Fica mais fácil — auto-registro, verificação de e-mail e futuros flows de KYC
nativos do realm dedicado, sem contaminar o realm operacional; portal público intacto; RBAC
extensível em dados sem depender da administração do Keycloak (administrar o Keycloak não vira
escada de privilégio no app). Fica mais difícil — um realm a mais para administrar e fazer backup;
o besc-api assume o ciclo de vida de sessão (rotação de refresh, revogação); a criação do realm e
do client OIDC entra como pré-requisito da Fase 0 do [roadmap](../09-roadmap.md). Invariantes
criadas: sessão emitida só pelo besc-api; papéis qualificados jamais atribuídos automaticamente;
segredos do client OIDC via Sealed Secrets.

Revisão pendente: Confirmar com o operador (Flavio): (1) realm dedicado `besc` vs conveniência de
logar com a conta da plataforma no papel de Gestor (é possível federar depois; não bloqueia); (2)
política de auto-registro do realm (e-mail verificado obrigatório? domínios bloqueados?); (3) se o
login local de bootstrap deve ser desativável por env após o primeiro Gestor existir.
