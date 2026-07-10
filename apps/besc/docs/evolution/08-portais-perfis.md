---
title: "Portais por perfil — SPA única com áreas gated"
status: proposta
updated: 2026-07-10
language: pt-BR
---

# 08 — Portais por perfil (UX, rotas, onboarding e dossiê público)

Este documento define **como cada perfil enxerga o marketplace**: a arquitetura de frontend (uma
única SPA com áreas gated), o mapa completo de rotas alvo, o onboarding/credenciamento por papel,
o **dossiê público do título** (projeção allowlist `title_listing`) e o reaproveitamento do
frontend atual. Papéis, permissões e o modelo de identidade estão em
[01-rbac-permissoes](./01-rbac-permissoes.md); as tabelas em
[02-modelo-de-dados](./02-modelo-de-dados.md); a máquina de estado jurídico (7 estados) em
[04-maquina-estado-juridico](./04-maquina-estado-juridico.md). A matriz exaustiva
endpoint/rota × papel (+anônimo) → allow/deny está no
[Apêndice C](./apendices/C-matriz-rbac.md) — **este doc não a duplica; aponte para lá**.

Papéis canônicos (role keys): `public` (pseudo-papel anônimo), `investor`, `lawyer`, `judge`,
`manager`, `admin`. Nas telas, em pt-BR: **Investidor**, **Advogado**, **Juiz**, **Gestor**.

---

## 1. Arquitetura de frontend — mesma SPA, áreas gated

> **DECISÃO — revisar** — registrada em [ADR-003](./adr/ADR-003-spa-unica-areas-gated.md):
> **uma única SPA** (`besc-frontend` atual) com áreas gated por papel — **não** SPAs separadas.

Racional:

- **Reuso direto** do shell (`frontend/src/App.jsx`), de `frontend/src/ui.jsx`,
  `frontend/src/icons.jsx`, do base path `/besc/` (vite.config.js) e do nginx com SPA fallback —
  nada disso precisa ser duplicado.
- O **portal de conhecimento permanece público** no mesmo host/path (é a base de confiança do
  marketplace); SPAs separadas duplicariam pipeline de build/deploy sem ganho.
- **Um único deploy** sob o Argo CD (Application `besc`, auto-sync) — sem novo Application, sem
  nova IngressRoute de frontend.

**Onde vive a autoridade.** Os guards de rota no React são **apenas UX** (esconder menu, redirecionar
para `/entrar`): a autoridade de acesso é **sempre a API**, via middleware RBAC por endpoint
(deny por padrão — ver [01-rbac-permissoes](./01-rbac-permissoes.md) e a matriz do
[Apêndice C](./apendices/C-matriz-rbac.md)). A autenticação é **no app** — `@flavioneto11/oidc-kit`
com realm Keycloak dedicado `besc` e sessão própria (padrão SICAT), decisão registrada em
[ADR-004](./adr/ADR-004-identidade-realm-besc-oidc-kit.md). A alternativa
ForwardAuth/oauth2-proxy na borda (padrão do Console) foi rejeitada porque o Traefik gatearia o
path inteiro `/besc`, matando as rotas públicas — o oidc-kit permite misturar público e privado
rota a rota. O CORS permissivo atual (`Access-Control-Allow-Origin: *` em
`api/src/server.js:31-37`) morre na Fase 0.

---

## 2. Mapa de rotas alvo

Hoje a SPA tem 13 rotas, todas públicas (`frontend/src/App.jsx:51-66`), incluindo `/casos` e
`/cases/*` com escrita anônima. O mapa alvo preserva as rotas públicas de conhecimento e adiciona
as três áreas gated.

```
PÚBLICO (sem login — permanece como hoje)
/                       PortalHome (+ chamada "Investir" → /marketplace)
/biblioteca, /biblioteca/:id
/jurisprudencia, /jurisprudencia/:id
/glossario, /referencia, /roadmap, /ajuda
/marketplace            Catálogo público (teaser): títulos listados, classe, risco,
                        SEM valores contratuais nem dossiê → CTA de login
/entrar                 Login (Keycloak realm besc, PKCE)
/cadastro               Auto-registro de investidor (conta nasce pending_approval)

INVESTIDOR (role: investor)
/investidor                         Dashboard: carteira resumida, contratos, aluguéis, avisos
/investidor/catalogo                Catálogo completo (só títulos publicados e disponíveis)
/investidor/titulos/:id             Dossiê público do título (ver §4)
/investidor/titulos/:id/contratar   Fluxo de compra de tokens (aceite de termos versionados)
/investidor/titulos/:id/alugar      Fluxo de locação (idem)
/investidor/carteira                Tokens por título, valor de face congelado por contrato,
                                    estado jurídico do título, aluguéis ativos, faturas
/investidor/contratos/:id           Detalhe do contrato + termos aceitos + faturas
/investidor/substituicoes/:id       Fluxo de substituição quando o título é derrotado (aceite do
                                    novo lastro ou registro de "nada além do já devido")

AUDITOR (roles: lawyer · judge — leitura qualificada, read-only)
/auditoria                          Busca por processo/título/caso (limitada ao escopo concedido)
/auditoria/titulos/:id              Título + tokens vinculados + contratos + eventos jurídicos + trilha
/auditoria/processos/:id            Visão por processo (reusa dados do levantamento)
/auditoria/exports                  Exports assinados (ver 07-trilha-auditoria)
                                    >>> toda leitura gera evento na trilha (`audit.access.viewed`
                                    — [07-trilha-auditoria](./07-trilha-auditoria.md))

GESTOR (role: manager)
/casos, /cases/*                    Levantamento ATUAL (telas existentes) — passa a exigir login
/gestao                             Painel: KPIs de portfólio, receita, pendências de aprovação
/gestao/titulos                     Títulos: criar a partir de caso apto, publicar/despublicar listing
/gestao/titulos/:id                 Detalhe: parâmetros (fator tokens/ação, face de referência),
                                    emissões, estado jurídico (transição manual COM evidência
                                    anexada), tokens, contratos, aluguéis
/gestao/estado-juridico             Fila de eventos jurídicos pendentes de decisão
/gestao/usuarios                    Aprovação de investidores, convites de auditores, RBAC admin
/gestao/fees                        fee_schedule (versões, ativação)
/gestao/alugueis                    lease agreements + ação "Fechar competência"
/gestao/financeiro                  Faturas (marcar paga), custos, conciliação, relatórios financeiros
/gestao/auditoria                   Trilha e exports
```

Notas sobre o mapa:

- **`/marketplace` é teaser** deliberado: lista títulos publicados com classe e nível de risco, sem
  valores contratuais nem dossiê. **DECISÃO — revisar** — o catálogo em **dois níveis** (lista
  pública de marketing + dossiê gated por `investor` aprovado) está registrado em
  [ADR-003](./adr/ADR-003-spa-unica-areas-gated.md).
- **`/casos` e `/cases/*` mudam de público para gated `manager`** — é a **única quebra** para o
  operador atual: ele passa a logar. Os endpoints de escrita e upload da API acompanham
  (hoje o CRUD inteiro é anônimo — ver Fase 0 do [09-roadmap](./09-roadmap.md)).
- O **estado jurídico** exibido na carteira do investidor e no dossiê usa os **7 estados** de
  [04-maquina-estado-juridico](./04-maquina-estado-juridico.md) (`unjudged`, `ruled_favorable`,
  `ruled_against`, `under_appeal`, `reinstated`, `defeated`, `archived`); disponível para
  contratar = `{unjudged, ruled_favorable, reinstated}` ∧ título listado.
- Toda rota acima consta no [Apêndice C](./apendices/C-matriz-rbac.md) com a decisão allow/deny
  para os 4 papéis + anônimo (+ `admin`).

---

## 3. Perfis, onboarding e credenciamento

| Perfil | Como entra | Estado / restrições |
|---|---|---|
| `investor` | **Self-service**: auto-cadastro em `/cadastro` → `user.status = pending_approval` → **Gestor aprova** em `/gestao/usuarios` → `active`. O campo `kyc_status` já nasce no modelo, mas KYC real é pós-gate regulatório ([10-gate-regulatorio](./10-gate-regulatorio.md)) | Contrata/aluga só com `active` + termos aceitos; enquanto `pending_approval`, não vê dossiê |
| `lawyer` / `judge` | **Somente por convite** do Gestor (e-mail + papel + **escopo**: lista de títulos/processos via `title_access_grants`, ou global-read) → ativação. **Sem auto-cadastro** | Read-only qualificada; toda leitura registrada na trilha (eventos `audit.access.*` — [07-trilha-auditoria](./07-trilha-auditoria.md)); export idem |
| `manager` | **Provisionado** (bootstrap da Fase 0 + convite posterior) | Acesso total, tudo auditado; guarda anti-lockout: o último `manager` não pode ser removido ([01-rbac-permissoes](./01-rbac-permissoes.md)) |

**RBAC extensível em dados**: papéis e permissões vivem em tabelas (`roles`, `permissions`,
`role_permissions` com scope, `user_roles`) e o vínculo de escopo do auditor em
**`title_access_grants`** (user → título/processo). Papel novo = linhas novas, não deploy — modelo
completo em [01-rbac-permissoes](./01-rbac-permissoes.md) e DDL no
[Apêndice B](./apendices/B-ddl-conceitual.md).

**Termos versionados.** Todo aceite (compra, locação, substituição) referencia um
`terms_document` versionado e gera registro de aceite imutável (quem, quando, qual versão) —
tabela no [Apêndice B](./apendices/B-ddl-conceitual.md). Mudança de termos nunca reescreve aceite
passado: cria versão nova.

**Eventos `audit.access.*` de leitura qualificada.** Toda leitura de auditor (`lawyer`/`judge`) — dossiê,
processo, trilha, export — gera evento de acesso na trilha de auditoria
([07-trilha-auditoria](./07-trilha-auditoria.md)). O convite deixa isso explícito ao convidado:
a leitura qualificada é registrada por desenho, não é vigilância oculta.

**Watermark pré-gate.** Enquanto `go_live_enabled = false`
([10-gate-regulatorio](./10-gate-regulatorio.md)), **toda** a área do investidor exibe o watermark
**"ambiente de demonstração — sem valor mobiliário ofertado"**, e o sistema recusa em código
marcar investidor como apto a operar valor real. A remoção do watermark é uma das operações
bloqueadas pelo gate.

---

## 4. Dossiê público do título — projeção allowlist `title_listing`

O dossiê **não é o caso**: é uma **projeção curada** (`title_listing`) que o Gestor publica
explicitamente a partir de um caso apto. Nenhum campo sai por acidente: a projeção é **allowlist**
— só os campos enumerados abaixo existem no payload do dossiê; tudo que não está na lista é
inexistente para quem lê.

> **DECISÃO — revisar** — allowlist registrada em
> [ADR-003](./adr/ADR-003-spa-unica-areas-gated.md); os **textos** do dossiê precisam de validação
> jurídica antes do gate (risco de caracterizar oferta).

**O que o dossiê expõe:**

| Campo do dossiê | Origem no modelo atual |
|---|---|
| Identificação do título e classe de ação | `share_class` (enum em `api/src/domain.js:26`) |
| Nível de risco derivado | `computeRisk().level` (`api/src/domain.js:424-425` — só o `level`, nunca os `factors` com detalhes internos) |
| Estado jurídico atual + histórico de eventos | máquina de 7 estados ([doc 04](./04-maquina-estado-juridico.md)) — eventos com data e tipo, **sem os autos/evidências anexadas** |
| **Lista** de tipos de documento validados | `documents[]` instanciados do `DOCUMENT_TEMPLATE` — só o rótulo do tipo + status `validated`, **sem os binários** |
| Resumo do laudo pericial | campos de `pericia` já existentes (`api/src/server.js:358`): valor atualizado, data-base, índice monetário — sem o laudo em si |
| Jurisprudência vinculada | `precedents` (link soft por id, `api/src/server.js:81`) — já é pública em `/jurisprudencia` |
| Parâmetros de tokenização | fator tokens/ação, supply emitido, quantidade disponível ([doc 03](./03-elasticidade-tokenizacao.md)) |

**O que o dossiê NUNCA expõe:**

- **PII do titular**: `holder_name`, `holder_tax_id`, `contact` (`api/src/server.js:76-82`) e
  qualquer documento pessoal;
- notas internas (`notes`, `legal_basis_notes`) e o valor interno estimado (`estimated_value`);
- pendências do motor (`computePendencies`) e os `factors` da matriz de risco;
- anexos/binários de qualquer natureza (uploads do caso, autos, evidências de transição jurídica).

O render do dossiê reusa o padrão de seções do pipeline de relatórios
(`api/src/reports.js:21` — `REPORT_TYPES` + render HTML), como os 8 relatórios atuais.

---

## 5. Reaproveitamento do frontend atual

| Artefato atual | Vira |
|---|---|
| `frontend/src/pages/Dashboard.jsx` (lista de casos, contadores, filtros) | Base de `/gestao/titulos` e da fila de aprovação de usuários (mesmo padrão tabela+badges) |
| `frontend/src/pages/CaseDetail.jsx` (10 abas — `frontend/src/pages/CaseDetail.jsx:47-58`) | Ganha aba 11 **"Título/Emissão"** (ponte caso→título); o padrão de abas é reusado no detalhe do título do Gestor |
| `api/src/reports.js` + `report.html` | Pipeline dos relatórios financeiros ([06-modelo-receita](./06-modelo-receita.md)), do dossiê público (§4) e dos exports de auditoria |
| `frontend/src/ui.jsx` / `frontend/src/icons.jsx` / `styles.css` | Design system único para as três áreas gated |
| `frontend/src/pages/{BibliotecaList,BibliotecaDetail,JurisprudenciaList,JurisprudenciaDetail,Glossario,Referencia}.jsx` | **Permanecem públicos sem login** — são a base de confiança do marketplace |
| `frontend/src/pages/PortalHome.jsx` | Ganha a chamada "Investir" → `/marketplace` |
| `frontend/src/pages/Roadmap.jsx` | Atualizado: as fases E/F/G declaradas são absorvidas pelo roadmap da evolução ([09-roadmap](./09-roadmap.md)) |
| Rotas `/casos` e `/cases/*` (`frontend/src/pages/{Dashboard,CaseForm,CaseDetail}.jsx`) | **Mudam de público para gated `manager`** — única quebra para o operador atual: passa a logar. Endpoints de escrita e upload da API idem |

O módulo de levantamento **continua operando inalterado** durante toda a evolução (é a origem dos
títulos); os cases permanecem no store JSON — ver
[ADR-002](./adr/ADR-002-postgres-e-convivencia-json.md).

---

## Referências cruzadas

- Decisão de arquitetura desta página: [ADR-003](./adr/ADR-003-spa-unica-areas-gated.md)
- Identidade e sessão: [ADR-004](./adr/ADR-004-identidade-realm-besc-oidc-kit.md) · [01-rbac-permissoes](./01-rbac-permissoes.md)
- Matriz completa rota/endpoint × papel → allow/deny: [Apêndice C](./apendices/C-matriz-rbac.md)
- Estado jurídico exibido nas áreas: [04-maquina-estado-juridico](./04-maquina-estado-juridico.md)
- Watermark e trava de operação real: [10-gate-regulatorio](./10-gate-regulatorio.md)
- Fase em que estas telas entram no ar: Fase 2 do [09-roadmap](./09-roadmap.md)
