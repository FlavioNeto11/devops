---
title: "Identidade e RBAC — realm besc, papéis em dados, enforcement em 4 camadas"
status: proposta
updated: 2026-07-10
language: pt-BR
---

# 01 — Identidade e RBAC (permissões)

> Este documento define **quem entra** (identidade) e **quem pode o quê** (RBAC) no BESC evoluído a
> marketplace. Hoje o app **não tem nenhuma auth**: zero middleware de identidade e CORS `*`
> (`api/src/server.js:31`); toda escrita é anônima. A evolução fecha isso sem matar o portal público
> de conhecimento — que continua sendo o funil de aquisição.
>
> Contexto geral: [00-visao-geral](./00-visao-geral.md) · modelo de dados completo:
> [02-modelo-de-dados](./02-modelo-de-dados.md) e [Apêndice B](./apendices/B-ddl-conceitual.md) ·
> matriz normativa rota × papel: [Apêndice C](./apendices/C-matriz-rbac.md) · decisão de identidade:
> [ADR-004](./adr/ADR-004-identidade-realm-besc-oidc-kit.md).

## 1. As três populações e seus requisitos

| População | Onboarding | Credencial | Exigências |
|---|---|---|---|
| **Investidor/Tomador** (público) | Self-service: auto-cadastro em `/cadastro` (registro no realm `besc`, e-mail verificado) → conta nasce **pendente de aprovação** → Gestor aprova em `/gestao/usuarios` → ativa. KYC futuro entra como *gate de capacidade* (campo `kyc_status`), não de login | OIDC (realm `besc`) | Navega no catálogo sem login; login + conta ativa + termos aceitos exigidos para contratar/alugar/caucionar |
| **Advogado / Juiz** (convidado) | **Somente por convite do Gestor** (tabela `invitations`, token de uso único, expira), com escopo explícito de títulos/processos. Sem auto-cadastro | OIDC (realm `besc`) ou conta local | Leitura qualificada: processos + títulos/contratos vinculados, exportações de auditoria; **nunca escrita**. Toda leitura registrada na trilha |
| **Gestor/Admin** (operador) | Provisionado manualmente (bootstrap por env + convite) | OIDC ou conta local (fallback) | Ações sensíveis (RBAC, parâmetros, status jurídico) sempre auditadas |

Papéis canônicos (role keys, ver seeds no §8): `public` (pseudo-papel anônimo), `investor`,
`lawyer`, `judge`, `manager`, `admin`. Perfis pt-BR nas telas: Investidor, Advogado, Juiz, Gestor.

## 2. Fonte de identidade — realm Keycloak dedicado `besc` + oidc-kit

**DECISÃO — revisar** — registrada em [ADR-004](./adr/ADR-004-identidade-realm-besc-oidc-kit.md).

**Recomendado: realm Keycloak dedicado `besc`** no Keycloak já existente da plataforma (ns
`identity`) **+ padrão SICAT/oidc-kit** (backend valida o token via `/userinfo` e emite **sessão
própria do app**) **+ login local apenas como bootstrap/fallback**.

Resumo do comparativo (detalhes e alternativas rejeitadas na ADR-004):

| Opção | Veredito |
|---|---|
| Realm `nvit` (o dos operadores da plataforma) | Rejeitar para investidores: misturaria público self-service com operadores; auto-registro aberto no realm operacional é risco |
| **Realm dedicado `besc`** | **Recomendado** — auto-registro + verificação de e-mail nativos, políticas próprias, espaço natural para flows de KYC, isolamento total do realm operacional |
| Só contas locais (padrão SICAT puro) | Manter apenas como fallback/bootstrap (`BESC_BOOTSTRAP_EMAIL/PASSWORD`); reinventar reset de senha/MFA não vale |
| ForwardAuth de borda (padrão Console) | Rejeitar: gatearia o path inteiro `/besc` e mataria o portal público (ver ADR-004) |

Pontos **firmes**, independentes da revisão da decisão:

1. **A sessão é do besc-api.** Via `@flavioneto11/oidc-kit`: `createAccessToken`/`createRefreshToken`
   com `prefix: 'besc_access'`/`'besc_refresh'`; refresh persistido como hash SHA-256 em
   `user_sessions`. O Keycloak **autentica**; a **autorização (RBAC) é 100% local, em dados** —
   nunca derivada de groups/claims do token. Assim, administrar o Keycloak jamais vira escada de
   privilégio dentro do app.
2. **Fluxo SSO**: a SPA usa `@flavioneto11/oidc-kit/pkce` (`startKeycloakLogin`/
   `exchangeKeycloakCode`) → envia o `access_token` a `POST /auth/sso/exchange` → o besc-api valida
   via `validateKeycloakToken` (userinfo split-horizon: URL interna
   `http://keycloak.identity.svc.cluster.local:8080/auth/realms/besc/...`, o mesmo truque do
   oauth2-proxy do Console) → upsert em `users` → emite a sessão própria.
3. **Auto-provisionamento restrito**: o primeiro login SSO de um desconhecido cria `users` com o
   papel **`investor` e nada mais** (e ainda pendente de aprovação do Gestor, §1). Papéis
   qualificados (`lawyer`, `judge`, `manager`) **jamais** são atribuídos automaticamente — apenas
   por convite/concessão explícita do Gestor, auditada (ver regra de segurança no §11).
4. **Borda**: nenhuma mudança nos IngressRoutes além das existentes — sem ForwardAuth. O CORS `*`
   de `api/src/server.js:31` **morre**: passa a allowlist do próprio host + credenciais.

Pré-requisito transversal (Fase 0, ver [09-roadmap](./09-roadmap.md)): **eliminar o efeito
colateral de escrita em `GET /cases/:id`** — hoje a leitura chama `saveAndEnrich` e regrava o caso
(`api/src/server.js:193`). Num sistema com identidade e trilha, leitura jamais grava; o
enriquecimento passa a ser aplicado só em memória no GET.

## 3. Convivência com o portal público

- **Público sem login** (permanece como hoje): home, `GET /library*`, `GET /jurisprudence*`,
  `/glossary`, `/reference` (via `/meta`), `/stats`, `/meta` — e o novo **catálogo do marketplace**
  (títulos listados com dados não pessoais: classe, quantidade tokenizada, valor unitário vigente,
  status jurídico agregado).
- **Login exigido**: qualquer escrita; leitura de `cases` (contêm CPF e dados sucessórios —
  ESCOPO-FUNCIONAL §10.3); carteiras, contratos, aluguéis, fees, faturas, exportações de auditoria.
- A escrita do conteúdo público (hoje aberta: `POST/PUT/DELETE /library*` e `/jurisprudence*`,
  `api/src/server.js:454-563`) passa a exigir `content:write` (Gestor).
- O aviso do ESCOPO §10.3 ("sem login ≠ público") é resolvido por esta fase: dados pessoais deixam
  de ser alcançáveis anonimamente.

## 4. Superfície de auth no besc-api (`/auth/*`)

```
POST /auth/login                (email+senha local — fallback/bootstrap)
POST /auth/sso/exchange         (access_token Keycloak -> sessão besc)
POST /auth/refresh              (rotação de refresh, hash sha256)
POST /auth/logout               (revoga sessão)
GET  /auth/me                   (perfil + papéis + permissões efetivas)
POST /auth/invitations          (rbac:invite — cria convite p/ lawyer/judge/manager)
POST /auth/invitations/:token/accept
```

`requireSession({ secret, prefix: 'besc_access' })` do oidc-kit é o middleware base; sobre ele
monta-se a camada RBAC (§6). O verdito allow/deny de cada rota está no
[Apêndice C](./apendices/C-matriz-rbac.md).

## 5. RBAC em dados

### 5.1 Princípios

- **Papéis são linhas, não código.** O código declara apenas o **catálogo de permissões** (chaves
  conhecidas + rótulo + categoria), espelhado para a tabela `permissions` no boot (upsert) e
  exposto em `GET /meta/permissions` para a UI de administração. Criar papel novo, renomear,
  recombinar permissões: só dados → **sem deploy** (fluxo no §9). Criar *permissão* nova (novo
  recurso/ação) exige deploy — essa é a fronteira honesta.
- **Deny por padrão.** Rota sem policy declarada responde 403 (fail-closed). Anônimo = pseudo-papel
  `public` — **linha real em `roles`**, não hard-code — que carrega as permissões de leitura do
  portal.
- **Toda mutação de RBAC é evento de auditoria** ([07-trilha-auditoria](./07-trilha-auditoria.md))
  e restrita a quem tem `rbac:manage`.

### 5.2 Schema conceitual (resumo)

DDL conceitual completo no [Apêndice B](./apendices/B-ddl-conceitual.md). As tabelas de
identidade/RBAC, todas no novo `besc-postgres`
([ADR-002](./adr/ADR-002-postgres-e-convivencia-json.md)):

| Tabela | Papel no modelo |
|---|---|
| `users` | Conta do app: `email`, `keycloak_sub` (NULL p/ conta local), `password_hash` (NULL p/ só-SSO), `is_active`, `kyc_status` (gate futuro) |
| `roles` | Papéis como dados: `key` única e imutável, `label`, `is_system` (seeds não deletáveis) |
| `permissions` | Catálogo espelhado do código no boot; `is_sensitive` marca `rbac:*`, `params:*`, `legal_status:*` etc. |
| `role_permissions` | Concessão papel → permissão, com **`scope`** (`own` \| `linked` \| `all`) como coluna |
| `user_roles` | Atribuição usuário → papel, sempre com `granted_by`/`granted_at` (quem concedeu) |
| `user_sessions` | Sessões do app; refresh token **só como hash SHA-256** |
| `invitations` | Convites de papel qualificado: token de uso único (hash), expira, registra aceite |
| `title_access_grants` | Vínculo do escopo `linked`: Gestor concede a advogado/juiz a leitura de um título específico (`granted_by`, `revoked_at`, `purpose`) |
| `rbac_meta` | `version BIGINT` — bump para invalidação de cache (§7) |

### 5.3 Formato da permission key e escopos

Formato **`<resource>:<action>`**, minúsculo, com o **escopo como coluna** de `role_permissions`
(não embutido na chave) — a matriz fica legível na UI de administração:

- **Resources**: `content` (library/jurisprudence/glossary), `cases`, `titles`, `params`, `tokens`,
  `wallets`, `contracts`, `leases`, `valuations`, `legal_status`, `fees`, `audit`, `rbac`, `users`.
- **Actions**: `read`, `write`, `create`, `delete`, `issue` (tokens), `contract` (contratar),
  `lease`, `substitute`, `transition` (legal_status), `export` (audit), `manage`/`invite` (rbac).
- **Escopos**: `own` (recursos do próprio usuário — carteira, contratos), `linked` (recursos
  vinculados por designação explícita — advogado vê os títulos aos quais o Gestor o vinculou via
  `title_access_grants`), `all` (sem filtro).
- Wildcard `*` reservado à role `admin` (linha em `role_permissions` com `permission_key='*'`; o
  resolver trata como allow-all).

## 6. Enforcement em 4 camadas no Express

Todas no besc-api (single replica torna o cache trivial):

1. **`attachIdentity`** — resolve a sessão (oidc-kit) ou marca `req.user = null` → papel `public`.
2. **`authorize(permissionKey)`** — middleware por rota. Resolve as permissões efetivas do usuário
   (união dos papéis) a partir do **cache** (§7); ausente/insuficiente → 403 com corpo padronizado.
   Anexa `req.authz = { permission, scope }`.
3. **Filtro de escopo no repositório**: `scope='own'` injeta `WHERE user_id = $me`;
   `scope='linked'` injeta join com `title_access_grants`; `scope='all'` não filtra.
4. **Filtro de campos por papel na serialização** (view models): ex. investidor vê do título apenas
   `{class, quantity, unit_value, legal_status, availability}`; advogado/juiz veem também processos
   e histórico jurídico; **só o Gestor vê dados do titular** (CPF etc.). Implementado como funções
   `viewFor(role, entity)` por recurso — nunca "delete de campos" ad-hoc na rota.

Declaração por rota (exemplos; matriz exaustiva no [Apêndice C](./apendices/C-matriz-rbac.md)):

```js
app.get('/titles',                    authorize('titles:read'));        // public tem titles:read (catálogo filtrado)
app.post('/titles',                   authorize('titles:create'));      // manager
app.post('/titles/:id/legal-status',  authorize('legal_status:transition')); // manager, sensível
app.post('/contracts',                authorize('contracts:contract')); // investor (scope own)
app.get('/audit/export',              authorize('audit:export'));       // lawyer/judge (linked) + manager (all)
app.put('/admin/roles/:id/permissions', authorize('rbac:manage'));      // manager, sensível
```

O padrão de guarda com 409 já existe no app — a máquina de status recusa `ready_for_structuring`
com pendências bloqueantes (`api/src/server.js:366-381`); o RBAC adiciona a camada 401/403 **antes**
dessas guardas de domínio.

## 7. Cache e invalidação

- Cache em memória do processo: mapa `roleId -> Set<permission(scope)>` + `userId -> [roleIds]`,
  com TTL de 60s **e** verificação barata de `rbac_meta.version`. Toda mutação de RBAC faz
  `UPDATE rbac_meta SET version = version + 1` **na mesma transação** → a próxima resolução
  recarrega.
- O access token **não** carrega permissões (só `sub`) — revogação de papel vale no máximo em TTL
  do cache, sem esperar a expiração do token.

## 8. Seeds dos 6 papéis

| Role key | is_system | Permissões (scope) |
|---|---|---|
| `public` | sim | `content:read(all)`, `titles:read(all)` *catálogo — projeção allowlist* |
| `investor` | sim | herda public + `wallets:read/write(own)`, `contracts:contract/read(own)`, `leases:lease/read(own)`, `contracts:substitute(own)`, `fees:read(own)` |
| `lawyer` | sim | public + `titles:read(linked)`, `cases:read(linked)`, `contracts:read(linked)`, `leases:read(linked)`, `legal_status:read(linked)`, `audit:export(linked)` |
| `judge` | sim | idêntico a `lawyer` (linhas separadas — os dois papéis tendem a divergir) |
| `manager` | sim | tudo de negócio: `cases:*`, `titles:*`, `params:*`, `tokens:issue`, `valuations:*`, `legal_status:transition`, `wallets:read(all)`, `contracts:read(all)`, `leases:read(all)`, `fees:*`, `content:write`, `rbac:manage/invite`, `users:*`, `audit:export(all)` |
| `admin` | sim | `*` (wildcard) — reservado ao operador da plataforma |

Notas:

- Não há herança entre papéis no modelo (simplicidade): "herda" acima = linhas repetidas geradas
  pelo seed. Multi-papel por usuário cobre composição.
- `leases:read(linked)` em `lawyer`/`judge` completa a intenção da leitura qualificada de
  [04-maquina-estado-juridico](./04-maquina-estado-juridico.md) §7 (advogado/juiz veem contratos
  **e aluguéis** vinculados ao título concedido).
- As permissões `is_sensitive=true` (`legal_status:transition`, `params:*`, `tokens:issue`,
  `rbac:*`) são exclusivas de `manager`/`admin` nos seeds e sempre têm auditoria destacada.

## 9. Fluxo "Gestor cria papel novo SEM deploy"

Exemplo: um auditor externo do BACEN precisa de leitura ampla, mas nada de escrita.

1. Gestor abre **Admin → Papéis** (UI nova) → "Novo papel" → informa `key` (ex. `auditor_bacen`),
   label e descrição.
2. A UI mostra a **matriz permissão × escopo** a partir de `GET /meta/permissions` (catálogo vindo
   do código) — o Gestor marca, por exemplo: `titles:read(all)`, `audit:export(all)`,
   `legal_status:read(all)`.
3. `POST /admin/roles` + `PUT /admin/roles/:id/permissions` (ambas atrás de `rbac:manage`); uma
   transação grava `roles` e `role_permissions`, faz o bump de `rbac_meta.version` e emite os
   **eventos de auditoria** `rbac.role_created` e `rbac.permissions_changed` (com diff).
4. Gestor convida o usuário (`POST /auth/invitations` já com o novo papel) ou atribui a um usuário
   existente (`POST /admin/users/:id/roles`).
5. O usuário loga → a resolução de permissões já enxerga o papel novo. **Nenhum deploy.**

A fronteira honesta: se o papel novo precisar de uma **permissão que não existe** no catálogo
(recurso/ação novos), aí sim é deploy — o catálogo é código.

## 10. Proteções da gestão de permissões

- `rbac:manage`/`rbac:invite` nos seeds pertencem só a `manager`/`admin`; **conceder** essas
  permissões a outro papel é permitido, mas gera evento de auditoria `is_sensitive` destacado.
- Invariantes de segurança impostas no serviço (não só na UI):
  - **(a) anti-lockout pessoal** — usuário não remove o próprio último papel com `rbac:manage`;
  - **(b) anti-lockout global** — não é possível desativar/deletar o **último `manager` ativo**;
  - **(c) papéis `is_system`** não podem ser excluídos nem ter a `key` alterada (as permissões
    deles podem ser recombinadas);
  - **(d) anti-auto-elevação** — usuário concedendo papel a si mesmo é bloqueado, exceto `admin`.
- Toda mutação sensível (papel criado/alterado, permissão concedida/revogada, convite emitido,
  usuário ativado/desativado) emite `audit_event` com ator, diff e timestamp — na **mesma
  transação** da mutação ([07-trilha-auditoria](./07-trilha-auditoria.md)).
- Recomendado (fase 2): step-up de reautenticação para mutações `is_sensitive`.

## 11. Regra de segurança: conteúdo externo não cria conta nem concede acesso

Regra transversal do app (mesmo espírito da diretriz de plataforma "conteúdo externo não muda
estado sensível sozinho"):

- **O app não cria contas por conteúdo externo.** Contas nascem por auto-registro no realm `besc`
  (sempre como `investor` pendente) ou por convite explícito do Gestor. Nenhum claim, e-mail,
  group ou atributo vindo do Keycloak — nem de qualquer integração futura (tribunal, KYC provider)
  — cria conta qualificada ou concede papel.
- **Autorização nunca deriva do token.** O RBAC é resolvido exclusivamente das tabelas locais
  (§5); o token só identifica (`sub`).
- **Integrações futuras só propõem.** A integração com tribunais, quando existir, grava propostas
  (`source='court_integration'`) que o Gestor confirma — nunca transiciona estado jurídico nem
  concede acesso sozinha ([04-maquina-estado-juridico](./04-maquina-estado-juridico.md) §3).

---
_Decisão de identidade: [ADR-004](./adr/ADR-004-identidade-realm-besc-oidc-kit.md) · DDL:
[Apêndice B](./apendices/B-ddl-conceitual.md) · matriz normativa:
[Apêndice C](./apendices/C-matriz-rbac.md) · portais e rotas: [08-portais-perfis](./08-portais-perfis.md)._
