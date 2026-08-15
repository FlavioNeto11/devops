---
title: "Apêndice C — Matriz RBAC normativa (endpoint/rota × papel)"
status: proposta
updated: 2026-07-10
language: pt-BR
---

# Apêndice C — Matriz RBAC normativa

> Matriz **normativa** allow/deny de cada endpoint da API e cada rota do frontend contra os papéis
> canônicos. É o gabarito do teste "matriz rota × papel" da Fase 2 do [roadmap](../09-roadmap.md)
> e a referência de implementação do middleware `authorize()` descrito em
> [01-rbac-permissoes](../01-rbac-permissoes.md) §6.

## Convenções de leitura

- **Colunas** = papéis canônicos: `public` (anônimo), `investor`, `lawyer`, `judge`, `manager`,
  `admin`.
- **Células**: `allow(all)` · `allow(own)` · `allow(linked)` · `allow` (endpoint aberto por
  natureza, ex. login) · `deny`. Escopos conforme
  [01-rbac-permissoes](../01-rbac-permissoes.md) §5.3: `own` = recursos do próprio usuário;
  `linked` = vinculados via `title_access_grants`; `all` = sem filtro.
- **`admin` = wildcard `*`** (allow em tudo) — as células estão preenchidas mesmo assim, por ser
  matriz de teste.
- **Deny por padrão (fail-closed)**: rota existente sem policy declarada → 403; anônimo em rota
  autenticada → 401. Toda rota nova DEVE ganhar uma linha aqui antes de existir.
- `lawyer` e `judge` são idênticos nos seeds (linhas separadas — divergirão); os papéis logados
  herdam as permissões de `public` (leitura do portal e do catálogo).
- Linhas da API atual citam `api/src/server.js:<linha>` (estado de hoje: **tudo é público** — a
  coluna-alvo desta matriz é o estado pós-Fase 0/2).

---

## 1. API — rotas atuais

### 1.1 Health e meta

| Endpoint | Permissão | public | investor | lawyer | judge | manager | admin |
|---|---|---|---|---|---|---|---|
| `GET /health` (`server.js:131`) | — (probe k8s) | allow | allow | allow | allow | allow | allow |
| `GET /meta` (`server.js:133`) | — (enums p/ SPA) | allow | allow | allow | allow | allow | allow |

### 1.2 Cases (levantamento) — deixa de ser público

| Endpoint | Permissão | public | investor | lawyer | judge | manager | admin |
|---|---|---|---|---|---|---|---|
| `GET /cases` (`server.js:152`) | `cases:read` | deny | deny | allow(linked)¹ | allow(linked)¹ | allow(all) | allow |
| `POST /cases` (`server.js:158`) | `cases:create` | deny | deny | deny | deny | allow(all) | allow |
| `GET /cases/:id` (`server.js:193`)² | `cases:read` | deny | deny | allow(linked)¹ | allow(linked)¹ | allow(all) | allow |
| `PUT /cases/:id` (`server.js:199`) | `cases:write` | deny | deny | deny | deny | allow(all) | allow |
| `DELETE /cases/:id` (`server.js:206`) | `cases:delete` | deny | deny | deny | deny | allow(all) | allow |
| `POST /cases/:id/lawsuits` (`server.js:213`) | `cases:write` | deny | deny | deny | deny | allow(all) | allow |
| `PUT /cases/:id/lawsuits/:lid` (`server.js:222`) | `cases:write` | deny | deny | deny | deny | allow(all) | allow |
| `DELETE /cases/:id/lawsuits/:lid` (`server.js:231`) | `cases:write` | deny | deny | deny | deny | allow(all) | allow |
| `PUT /cases/:id/documents/:key` (`server.js:239`) | `cases:write` | deny | deny | deny | deny | allow(all) | allow |
| `POST /cases/:id/documents/:key/attachments` (`server.js:259`) | `cases:write` | deny | deny | deny | deny | allow(all) | allow |
| `GET /cases/:id/documents/:key/attachments/:attId/download` (`server.js:286`) | `cases:read` | deny | deny | allow(linked)¹ | allow(linked)¹ | allow(all) | allow |
| `DELETE /cases/:id/documents/:key/attachments/:attId` (`server.js:298`) | `cases:write` | deny | deny | deny | deny | allow(all) | allow |
| `PUT /cases/:id/legal/:key` (`server.js:313`) | `cases:write` | deny | deny | deny | deny | allow(all) | allow |
| `PUT /cases/:id/tokenization/:key` (`server.js:326`) | `cases:write` | deny | deny | deny | deny | allow(all) | allow |
| `PUT /cases/:id/collateral` (`server.js:340`) | `cases:write` | deny | deny | deny | deny | allow(all) | allow |
| `PUT /cases/:id/pericia` (`server.js:353`) | `cases:write` | deny | deny | deny | deny | allow(all) | allow |
| `POST /cases/:id/status` (`server.js:366`) | `cases:write` | deny | deny | deny | deny | allow(all) | allow |
| `GET /cases/:id/report` (`server.js:390`) | `cases:read` | deny | deny | allow(linked)¹ | allow(linked)¹ | allow(all) | allow |
| `GET /cases/:id/report.html` (`server.js:397`) | `cases:read` | deny | deny | allow(linked)¹ | allow(linked)¹ | allow(all) | allow |

¹ `linked` para cases = o case referenciado por um `security_title` concedido ao usuário via
`title_access_grants` (`security_title.case_id` é a ponte —
[02-modelo-de-dados](../02-modelo-de-dados.md)). A leitura qualificada devolve a **projeção por
papel** (`viewFor`, [01-rbac-permissoes](../01-rbac-permissoes.md) §6 camada 4) e é registrada na
trilha ([07-trilha-auditoria](../07-trilha-auditoria.md)).
² Pré-requisito da Fase 0: `GET /cases/:id` hoje **grava** o caso na leitura
(`saveAndEnrich`, `api/src/server.js:193`) — isso morre antes do gating.

### 1.3 Conteúdo do portal (library / jurisprudence / glossary / stats) — leitura segue pública

| Endpoint | Permissão | public | investor | lawyer | judge | manager | admin |
|---|---|---|---|---|---|---|---|
| `GET /library` (`server.js:428`) | `content:read` | allow(all) | allow(all) | allow(all) | allow(all) | allow(all) | allow |
| `GET /library/:id` (`server.js:438`) | `content:read` | allow(all) | allow(all) | allow(all) | allow(all) | allow(all) | allow |
| `GET /library/:id/file` (`server.js:444`) | `content:read` | allow(all) | allow(all) | allow(all) | allow(all) | allow(all) | allow |
| `POST /library` (`server.js:454`) | `content:write` | deny | deny | deny | deny | allow(all) | allow |
| `PUT /library/:id` (`server.js:461`) | `content:write` | deny | deny | deny | deny | allow(all) | allow |
| `DELETE /library/:id` (`server.js:469`) | `content:write` | deny | deny | deny | deny | allow(all) | allow |
| `POST /library/:id/file` (`server.js:475`) | `content:write` | deny | deny | deny | deny | allow(all) | allow |
| `GET /jurisprudence` (`server.js:501`) | `content:read` | allow(all) | allow(all) | allow(all) | allow(all) | allow(all) | allow |
| `GET /jurisprudence/:id` (`server.js:516`) | `content:read` | allow(all) | allow(all) | allow(all) | allow(all) | allow(all) | allow |
| `GET /jurisprudence/:id/file` (`server.js:522`) | `content:read` | allow(all) | allow(all) | allow(all) | allow(all) | allow(all) | allow |
| `POST /jurisprudence` (`server.js:531`) | `content:write` | deny | deny | deny | deny | allow(all) | allow |
| `PUT /jurisprudence/:id` (`server.js:539`) | `content:write` | deny | deny | deny | deny | allow(all) | allow |
| `DELETE /jurisprudence/:id` (`server.js:547`) | `content:write` | deny | deny | deny | deny | allow(all) | allow |
| `POST /jurisprudence/:id/file` (`server.js:553`) | `content:write` | deny | deny | deny | deny | allow(all) | allow |
| `GET /glossary` (`server.js:566`) | `content:read` | allow(all) | allow(all) | allow(all) | allow(all) | allow(all) | allow |
| `GET /stats` (`server.js:583`) | `content:read` | allow(all) | allow(all) | allow(all) | allow(all) | allow(all) | allow |

---

## 2. API — superfícies novas

### 2.1 Auth (`/auth/*`)

| Endpoint | Permissão | public | investor | lawyer | judge | manager | admin |
|---|---|---|---|---|---|---|---|
| `POST /auth/login` | — (aberto) | allow | allow | allow | allow | allow | allow |
| `POST /auth/sso/exchange` | — (aberto) | allow | allow | allow | allow | allow | allow |
| `POST /auth/refresh` | — (portador de refresh válido) | allow | allow | allow | allow | allow | allow |
| `POST /auth/logout` | sessão | deny (401) | allow(own) | allow(own) | allow(own) | allow(own) | allow(own) |
| `GET /auth/me` | sessão | deny (401) | allow(own) | allow(own) | allow(own) | allow(own) | allow(own) |
| `POST /auth/invitations` | `rbac:invite` | deny | deny | deny | deny | allow(all) | allow |
| `POST /auth/invitations/:token/accept` | — (token de uso único) | allow | allow | allow | allow | allow | allow |

### 2.2 Títulos (`/titles*`)

| Endpoint | Permissão | public | investor | lawyer | judge | manager | admin |
|---|---|---|---|---|---|---|---|
| `GET /titles` | `titles:read` | allow(all)³ | allow(all)³ | allow(linked)⁴ | allow(linked)⁴ | allow(all) | allow |
| `GET /titles/:id` | `titles:read` | allow(all)³ | allow(all)³ | allow(linked)⁴ | allow(linked)⁴ | allow(all)⁵ | allow |
| `POST /titles` | `titles:create` | deny | deny | deny | deny | allow(all) | allow |
| `PUT /titles/:id/listing` (publicar/despublicar) | `titles:write` | deny | deny | deny | deny | allow(all) | allow |
| `GET /titles/:id/legal-status` (histórico) | `legal_status:read` | deny | allow(all)³ | allow(linked) | allow(linked) | allow(all) | allow |
| `POST /titles/:id/legal-status` (transição) | `legal_status:transition` **sensível** | deny | deny | deny | deny | allow(all) | allow |
| `GET /titles/:id/batches` (emissões) | `titles:read` | deny | deny | allow(linked) | allow(linked) | allow(all) | allow |
| `POST /titles/:id/batches` (emitir) | `tokens:issue` **sensível** | deny | deny | deny | deny | allow(all) | allow |

³ **Projeção allowlist** — nunca a entidade inteira: `public` vê o catálogo teaser (classe,
quantidade tokenizada, valor unitário vigente, status jurídico agregado — sem valores contratuais
nem dossiê); `investor` vê o dossiê completo do título publicado (allowlist SEM PII do titular);
`legal-status` para investor = histórico do dossiê sem `evidence_ref`. Catálogo em dois níveis
(teaser público × dossiê gated) e allowlist do dossiê: **DECISÃO — revisar** — registrada em
[ADR-003](../adr/ADR-003-spa-unica-areas-gated.md).
⁴ Advogado/juiz: visão qualificada completa (incl. processos e histórico jurídico com evidências)
dos títulos concedidos via `title_access_grants`; para os demais títulos, enxergam a mesma
projeção pública de `public`. Toda leitura qualificada gera registro na trilha.
⁵ Só `manager`/`admin` veem dados do titular (CPF etc.) — camada 4 do enforcement
([01-rbac-permissoes](../01-rbac-permissoes.md) §6).

### 2.3 Parâmetros e avaliações (`/params*`, `/valuations*`)

| Endpoint | Permissão | public | investor | lawyer | judge | manager | admin |
|---|---|---|---|---|---|---|---|
| `GET /titles/:id/params` (versões) | `params:read` | deny | deny | allow(linked) | allow(linked) | allow(all) | allow |
| `POST /titles/:id/params` (nova versão draft) | `params:write` | deny | deny | deny | deny | allow(all) | allow |
| `POST /params/:id/activate` | `params:activate` **sensível** | deny | deny | deny | deny | allow(all) | allow |
| `GET /titles/:id/valuations` | `valuations:read` | deny | deny | allow(linked) | allow(linked) | allow(all) | allow |
| `POST /titles/:id/valuations` | `valuations:write` | deny | deny | deny | deny | allow(all) | allow |

### 2.4 Contratos, carteiras e aluguéis (`/contracts*`, `/wallets*`, `/leases*`)

| Endpoint | Permissão | public | investor | lawyer | judge | manager | admin |
|---|---|---|---|---|---|---|---|
| `GET /contracts` | `contracts:read` | deny | allow(own) | allow(linked) | allow(linked) | allow(all) | allow |
| `GET /contracts/:id` | `contracts:read` | deny | allow(own) | allow(linked) | allow(linked) | allow(all) | allow |
| `POST /contracts` (contratar) | `contracts:contract` | deny | allow(own)⁶ | deny | deny | deny⁷ | allow |
| `POST /contracts/:id/substitution` | `contracts:substitute` | deny | allow(own)⁶ | deny | deny | deny⁷ | allow |
| `GET /wallets`⁸ | `wallets:read` | deny | allow(own) | deny | deny | allow(all) | allow |
| `GET /leases` | `leases:read` | deny | allow(own) | allow(linked) | allow(linked) | allow(all) | allow |
| `GET /leases/:id` | `leases:read` | deny | allow(own) | allow(linked) | allow(linked) | allow(all) | allow |
| `POST /leases` (alugar) | `leases:lease` | deny | allow(own)⁶ | deny | deny | deny⁷ | allow |

⁶ Além do RBAC, o serviço exige conta ativa (aprovada pelo Gestor), termos aceitos e — pós-gate
regulatório — `kyc_status='approved'` ([10-gate-regulatorio](../10-gate-regulatorio.md)).
⁷ O Gestor **não contrata em nome de terceiros** nos seeds (tem apenas `contracts:read(all)`) —
separação operador × parte. O write-off por decurso de prazo é rotina do sistema parametrizada,
não uma contratação ([04-maquina-estado-juridico](../04-maquina-estado-juridico.md) §5).
⁸ Nome final das rotas de carteira definido em [02-modelo-de-dados](../02-modelo-de-dados.md);
a decisão allow/deny por papel desta linha é normativa seja qual for o path.

### 2.5 Receita (`/fees*`, `/invoices*`)

| Endpoint | Permissão | public | investor | lawyer | judge | manager | admin |
|---|---|---|---|---|---|---|---|
| `GET /fees` | `fees:read` | deny | allow(own) | deny⁹ | deny⁹ | allow(all) | allow |
| `POST /fees/:id/waive` (isenção manual) | `fees:write` **sensível** | deny | deny | deny | deny | allow(all) | allow |
| `GET /invoices` | `fees:read` | deny | allow(own) | deny⁹ | deny⁹ | allow(all) | allow |
| `POST /invoices` (emitir / fechar competência) | `fees:write` | deny | deny | deny | deny | allow(all) | allow |
| `POST /invoices/:id/mark-paid` | `fees:write` | deny | deny | deny | deny | allow(all) | allow |

⁹ Advogado/juiz não navegam o financeiro vivo; a visão deles é o **export de auditoria** (linha
abaixo), que inclui os eventos de fee/fatura dos títulos concedidos.

### 2.6 Auditoria e administração (`/audit/export`, `/admin/*`)

| Endpoint | Permissão | public | investor | lawyer | judge | manager | admin |
|---|---|---|---|---|---|---|---|
| `GET /audit/export` | `audit:export` | deny | deny | allow(linked) | allow(linked) | allow(all) | allow |
| `GET /meta/permissions` (catálogo p/ UI admin) | `rbac:manage` | deny | deny | deny | deny | allow(all) | allow |
| `GET /admin/roles` | `rbac:manage` | deny | deny | deny | deny | allow(all) | allow |
| `POST /admin/roles` | `rbac:manage` **sensível** | deny | deny | deny | deny | allow(all) | allow |
| `PUT /admin/roles/:id/permissions` | `rbac:manage` **sensível** | deny | deny | deny | deny | allow(all) | allow |
| `DELETE /admin/roles/:id` | `rbac:manage` **sensível**¹⁰ | deny | deny | deny | deny | allow(all) | allow |
| `GET /admin/users` | `users:read` | deny | deny | deny | deny | allow(all) | allow |
| `PUT /admin/users/:id` (aprovar/ativar/desativar) | `users:write` | deny | deny | deny | deny | allow(all) | allow |
| `POST /admin/users/:id/roles` | `rbac:manage` **sensível**¹⁰ | deny | deny | deny | deny | allow(all) | allow |
| `DELETE /admin/users/:id/roles/:roleId` | `rbac:manage` **sensível**¹⁰ | deny | deny | deny | deny | allow(all) | allow |

¹⁰ Sujeito às invariantes anti-lockout e anti-auto-elevação de
[01-rbac-permissoes](../01-rbac-permissoes.md) §10 (o allow do RBAC não basta: o serviço ainda
recusa remover o último `manager` ativo, excluir papel `is_system`, ou auto-conceder papel).

---

## 3. Frontend — rotas × papel

> Guards de rota no React são **só UX** — a autoridade é a matriz da API acima
> ([ADR-003](../adr/ADR-003-spa-unica-areas-gated.md)). Anônimo em rota gated → redirect a
> `/entrar`; papel errado → tela 403 amigável.

### 3.1 Públicas (hoje: `frontend/src/App.jsx:52-61` · novas: `/marketplace`, `/entrar`, `/cadastro`)

| Rota | public | investor | lawyer | judge | manager | admin |
|---|---|---|---|---|---|---|
| `/` · `/biblioteca(/:id)` · `/jurisprudencia(/:id)` · `/glossario` · `/referencia` · `/roadmap` · `/ajuda` | allow | allow | allow | allow | allow | allow |
| `/marketplace` (catálogo teaser³) | allow | allow | allow | allow | allow | allow |
| `/entrar` · `/cadastro` | allow | allow | allow | allow | allow | allow |

### 3.2 Área do investidor (`/investidor/*`)

| Rota | public | investor | lawyer | judge | manager | admin |
|---|---|---|---|---|---|---|
| `/investidor` (dashboard) | deny | allow | deny | deny | deny | allow |
| `/investidor/catalogo` | deny | allow | deny | deny | deny | allow |
| `/investidor/titulos/:id` (dossiê) | deny | allow | deny | deny | deny | allow |
| `/investidor/titulos/:id/contratar` | deny | allow⁶ | deny | deny | deny | allow |
| `/investidor/titulos/:id/alugar` | deny | allow⁶ | deny | deny | deny | allow |
| `/investidor/carteira` | deny | allow | deny | deny | deny | allow |
| `/investidor/contratos/:id` | deny | allow | deny | deny | deny | allow |
| `/investidor/substituicoes/:id` | deny | allow⁶ | deny | deny | deny | allow |

### 3.3 Área de auditoria (`/auditoria/*` — advogado/juiz, read-only qualificada)

| Rota | public | investor | lawyer | judge | manager | admin |
|---|---|---|---|---|---|---|
| `/auditoria` (busca) | deny | deny | allow | allow | deny¹¹ | allow |
| `/auditoria/titulos/:id` | deny | deny | allow | allow | deny¹¹ | allow |
| `/auditoria/processos/:id` | deny | deny | allow | allow | deny¹¹ | allow |
| `/auditoria/exports` | deny | deny | allow | allow | deny¹¹ | allow |

¹¹ O Gestor tem o equivalente completo em `/gestao/auditoria` (escopo `all`); a área `/auditoria`
é dimensionada para a leitura qualificada `linked` de advogado/juiz —
[08-portais-perfis](../08-portais-perfis.md).

### 3.4 Área de gestão (`/gestao/*` e o levantamento atual)

| Rota | public | investor | lawyer | judge | manager | admin |
|---|---|---|---|---|---|---|
| `/gestao` (painel) | deny | deny | deny | deny | allow | allow |
| `/gestao/titulos` · `/gestao/titulos/:id` | deny | deny | deny | deny | allow | allow |
| `/gestao/estado-juridico` | deny | deny | deny | deny | allow | allow |
| `/gestao/usuarios` (aprovações, convites, RBAC) | deny | deny | deny | deny | allow | allow |
| `/gestao/fees` | deny | deny | deny | deny | allow | allow |
| `/gestao/alugueis` | deny | deny | deny | deny | allow | allow |
| `/gestao/financeiro` | deny | deny | deny | deny | allow | allow |
| `/gestao/auditoria` | deny | deny | deny | deny | allow | allow |
| `/casos` (`App.jsx:60`) — **de público → gated**¹² | deny | deny | deny¹³ | deny¹³ | allow | allow |
| `/cases/new` · `/cases/:id` · `/cases/:id/edit` (`App.jsx:62-64`)¹² | deny | deny | deny¹³ | deny¹³ | allow | allow |

¹² Única quebra para o operador atual: o levantamento passa a exigir login de `manager`
(mitigação: conta provisionada antes do gate — Fase 0 do [roadmap](../09-roadmap.md)).
¹³ Advogado/juiz não usam o workbench de levantamento; acessam os dados do caso vinculado pela
projeção qualificada em `/auditoria/processos/:id` (API: `cases:read(linked)`, §1.2).

---

## 4. Regras de completude

1. **Toda rota nova nasce com linha nesta matriz** — PR que adiciona endpoint sem atualizar o
   Apêndice C está incompleto (é o análogo RBAC do drift-gate).
2. Rotas de detalhamento fino ainda não nomeadas (ex. paths definitivos de carteira, exports
   parciais) herdam a linha do seu recurso até ganharem linha própria — nunca o contrário.
3. O teste de aceitação da Fase 2 percorre esta matriz célula a célula: cada
   `endpoint × papel → allow/deny` esperado vira um caso de teste HTTP.
