---
title: "Visão geral — evolução do BESC: de portal de levantamento a marketplace de ações tokenizadas"
status: proposta
updated: 2026-07-10
language: pt-BR
---

# 00 — Visão geral

> **Comece por aqui.** Este é o único documento que um leitor externo precisa ler primeiro: ele
> explica o que o BESC é hoje, o que a evolução propõe, quais regras de negócio a governam, como o
> produto final se apresenta para cada perfil, e mapeia todos os demais documentos deste plano.
> **Todo o conteúdo de `docs/evolution/` é proposta** — nenhum código de produção foi escrito,
> nenhum deploy foi feito, nenhuma migration existe. A execução depende de aprovação do operador.

## 1. O que o BESC é hoje (baseline v1)

O app `apps/besc` é um **portal público sem login** (React 18 + Vite no frontend, Node 20 + Express
na API, persistência em **store JSON único** em PVC com escrita atômica serializada —
`api/src/store.js:51-62`) com duas frentes:

1. **Base de conhecimento** — biblioteca institucional, jurisprudência (100 decisões navegáveis por
   facetas), glossário e referência. Conteúdo público, alimentado por seeds versionadas.
2. **Levantamento por caso** — cadastro de casos/processos, organização documental (18 tipos de
   documento), checklists jurídico (11 perguntas) e de tokenização (21 itens, dos quais 7
   regulatórios marcados `requiresLegal` — `api/src/domain.js:172-195`), caução, perícia,
   pendências automáticas, máquina de status organizacional e matriz de risco, com 8 relatórios.

A fonte da verdade do domínio v1 é [`ESCOPO-FUNCIONAL.md`](../../ESCOPO-FUNCIONAL.md) (1586 linhas),
que declara explicitamente os princípios **P2 (sem login), P3 (sem pagamento), P4 (sem blockchain) e
P5 (não tokeniza de verdade)** (`ESCOPO-FUNCIONAL.md:33-36`). Coerente com isso, a API não tem
nenhum middleware de autenticação e o CORS é `*` (`api/src/server.js:31-37`): **toda escrita é
anônima**. O próprio roadmap do produto já reconhecia esses limites como temporários: o §10.4 do
escopo lista auth/SSO + RBAC, tokenização real e trilha de auditoria fina como pós-MVP
(`ESCOPO-FUNCIONAL.md:1570`), e a tela de roadmap declara a fase F (governança/login/auditoria)
*diferida* e a fase G (trilho on-chain) *fora do escopo atual*
(`frontend/src/pages/Roadmap.jsx:19-20`).

## 2. O que muda e por quê

A evolução transforma o BESC de **ferramenta de levantamento** em **marketplace de ações BESC
tokenizadas**: ações levantadas e estruturadas nos casos passam a virar **títulos** (`security_title`)
que o Gestor desmembra em tokens, publica num catálogo, e disponibiliza para contratação (compra
simulada → real após gate regulatório), aluguel e substituição — com identidade, papéis, receita e
trilha de auditoria pericial.

### 2.1 Princípios revogados (P2–P5)

Os princípios P2–P5 do v1 são **deliberadamente revogados** por esta evolução — a decisão, suas
consequências e o que **não** é revogado estão registrados em
[ADR-001](./adr/ADR-001-revogacao-principios-v1.md):

| Princípio v1 (`ESCOPO-FUNCIONAL.md:33-36`) | Situação na evolução |
|---|---|
| P2 — Sem login | Revogado: identidade OIDC (Keycloak realm dedicado `besc`) + RBAC em dados |
| P3 — Sem pagamento | Revogado: modelo de receita (fee de 1ª transferência + aluguel), faturamento manual sem gateway |
| P4 — Sem blockchain | Revogado: camada de ledger abstraída (`LedgerPort`), simulada primeiro, Besu permissionado depois |
| P5 — Não tokeniza de verdade | Revogado: emissão, contratação, aluguel e substituição de tokens — real apenas após o gate regulatório |

Os princípios **P1 (simples e direto), P6 (foco em evidência), P7 (saída acionável) e P8 (não
conclui juridicamente)** permanecem válidos e são, na verdade, reforçados pela evolução (toda
transição jurídica exige evidência; o gate regulatório institucionaliza o P8).

### 2.2 O que se mantém

- **O módulo de levantamento continua operando, intocado, como fonte dos títulos.** O
  `ESCOPO-FUNCIONAL.md` não é editado — permanece como especificação vigente do módulo de
  levantamento e baseline referenciada. O motor de pendências/risco/status atual não muda uma linha.
- **A base de conhecimento continua pública** (biblioteca, jurisprudência, glossário, referência):
  é o funil de aquisição e a base de confiança do marketplace. Leitura sem login; escrita passa a
  exigir permissão.
- **Cases, biblioteca, jurisprudência e glossário ficam no store JSON** (`/data/besc.json`). O
  Postgres novo (`besc-postgres`) entra **somente** para identidade/RBAC/marketplace/auditoria;
  migração de cases para Postgres é fase opcional tardia (ver
  [ADR-002](./adr/ADR-002-postgres-e-convivencia-json.md) e
  [02-modelo-de-dados](./02-modelo-de-dados.md)).
- **A única quebra para o operador atual**: `/casos` deixa de ser público e passa a exigir login de
  Gestor (assim como toda escrita da API) — os dados de casos contêm CPF e dados sucessórios, e o
  aviso "sem login ≠ público" do próprio escopo (`ESCOPO-FUNCIONAL.md:1556`) é finalmente resolvido.

## 3. As 6 regras de negócio da evolução

| # | Regra | Resumo | Doc que detalha |
|---|---|---|---|
| 1 | **Desmembramento parametrizável** | Cada ação do título vira N tokens (`tokens_per_share`), fator definido pelo Gestor por título e **imutável após a primeira emissão**. Supply nunca excede `ações × fator`. | [03-elasticidade-tokenizacao](./03-elasticidade-tokenizacao.md) |
| 2 | **Trava de valor por contrato (elasticidade)** | Três valores separados: valor de mercado da ação (série temporal), valor unitário de contratação (parâmetro versionado) e valor de face **congelado no contrato** (`unit_face_value_frozen`) — este nunca muda, nem para cima nem para baixo. Re-avaliação cria versão nova de parâmetro; contratos antigos ficam intactos. | [03-elasticidade-tokenizacao](./03-elasticidade-tokenizacao.md) |
| 3 | **Máquina de estado jurídico governa disponibilidade** | 7 estados (`unjudged`, `ruled_favorable`, `ruled_against`, `under_appeal`, `reinstated`, `defeated`, `archived`); só {`unjudged`, `ruled_favorable`, `reinstated`} + listado permitem contratar. Só o Gestor transiciona, com razão + evidência. Título `defeated` dispara substituição (preserva o montante travado) ou write-off ("nada além do já devido"). | [04-maquina-estado-juridico](./04-maquina-estado-juridico.md) |
| 4 | **Receita = fee de 1ª transferência + aluguel** | Fee única por contrato, cobrada apenas na **saída da treasury** (distribuição primária): % do valor de face + piso. Transferências secundárias e substituições são isentas **com registro explícito**. Aluguel (% a.m. sobre base congelada, reajuste anual por índice) é o lucro principal. Sem gateway: fatura manual + contabilidade de dupla entrada append-only. | [06-modelo-receita](./06-modelo-receita.md) |
| 5 | **Auditabilidade total** | `audit_event` append-only com hash-chain SHA-256 calculada no banco, ancoragem Merkle periódica no ledger, export pericial (ZIP com verificador standalone) e imutabilidade imposta por REVOKE/trigger — não por disciplina de aplicação. PII nunca no payload (LGPD). | [07-trilha-auditoria](./07-trilha-auditoria.md) |
| 6 | **RBAC extensível** | Papéis e permissões **em dados** (deny por padrão): criar papel novo, recombinar permissões e convidar usuários qualificados não exige deploy. Auto-registro cria apenas `investor`; papéis qualificados só por convite do Gestor, auditado. | [01-rbac-permissoes](./01-rbac-permissoes.md) |

## 4. Visão do produto final por perfil

A interface continua sendo **uma única SPA** (`/besc`) com áreas gated por papel
([08-portais-perfis](./08-portais-perfis.md)). Papéis canônicos: `public` (pseudo-papel anônimo),
`investor`, `lawyer`, `judge`, `manager`, `admin`.

| Perfil | O que vê e faz |
|---|---|
| **Anônimo** (`public`) | Tudo que existe hoje na base de conhecimento (home, biblioteca, jurisprudência, glossário, referência) **mais** o catálogo público do marketplace em modo teaser: títulos listados, classe, risco derivado, status jurídico agregado — sem valores contratuais, sem PII, com CTA para login. |
| **Investidor** (`investor`) | Área `/investidor`: catálogo completo, dossiê público do título (projeção allowlist — nunca PII do titular), fluxo de contratar/alugar com aceite de termos versionados, carteira (posições, valor de face congelado por contrato, status jurídico do lastro), faturas, e fluxo de substituição quando um título cai. Até o gate regulatório, opera sob watermark "demonstração". |
| **Advogado** (`lawyer`) | Área `/auditoria`, **somente leitura qualificada** e por escopo concedido (`title_access_grants`): título + processos + histórico jurídico + contratos vinculados + exportações da trilha de auditoria. **Toda leitura fica registrada na trilha.** Entra apenas por convite do Gestor. |
| **Juiz** (`judge`) | Mesma área `/auditoria` do advogado (papéis separados em dados — divergirão com o tempo): verificação independente da trilha (hash-chain + ancoragem), export pericial com verificador standalone, visão por processo. Também apenas por convite. |
| **Gestor** (`manager`) | Área `/gestao` completa: criar título a partir de caso elegível, parâmetros de tokenização (fator, valor unitário), emissões, transições da máquina jurídica (sempre com evidência), usuários/convites/RBAC, fee schedule, aluguéis ("fechar competência"), financeiro (faturas, custos, relatórios) e trilha. Além disso, o levantamento atual (`/casos`) passa a ser área do Gestor. |
| **Admin** (`admin`) | Operador da plataforma; wildcard técnico sobre tudo, reservado a manutenção. |

## 5. Decisões de arquitetura (sumário)

Cada decisão em aberto está marcada e tem ADR 1:1 (índice completo em
[adr/README.md](./adr/README.md)):

| Tema | Escolha proposta | Status |
|---|---|---|
| Identidade | Realm Keycloak dedicado `besc` + padrão SICAT/oidc-kit (sessão própria do app); auth **no app**, não na borda — o portal de conhecimento continua público. Auto-registro cria só `investor`. | **DECISÃO — revisar** — [ADR-004](./adr/ADR-004-identidade-realm-besc-oidc-kit.md) |
| Persistência | Postgres novo `besc-postgres` só para identidade/RBAC/marketplace/auditoria; cases + conteúdo público ficam no store JSON; migração de cases é fase opcional tardia. | **DECISÃO — revisar** — [ADR-002](./adr/ADR-002-postgres-e-convivencia-json.md) |
| Frontend | SPA única com áreas gated (`/investidor`, `/auditoria`, `/gestao`); catálogo em 2 níveis (lista pública + dossiê gated); dossiê público = projeção allowlist. | **DECISÃO — revisar** — [ADR-003](./adr/ADR-003-spa-unica-areas-gated.md) |
| Blockchain | Dois estágios pela mesma interface `LedgerPort`: `SimulatedLedgerAdapter` (DB-only, Fases 0–2) → Hyperledger Besu permissionado QBFT (Fase 3, precedente DREX/BCB); token ERC-3643 perfil reduzido, 1 contrato por título. Aluguel fica **off-chain** com hash ancorado. | **DECISÃO — revisar** — [ADR-005](./adr/ADR-005-ledger-port-besu-erc3643.md) |
| Receita | Fee de 1ª transferência = % do valor de face do contrato (0,5% placeholder) + piso (R$ 25 placeholder), cobrada só na saída da treasury; aluguel % a.m. + reajuste por índice; faturamento manual + dupla entrada append-only. | **DECISÃO — revisar** — [ADR-006](./adr/ADR-006-receita.md) |
| Máquina jurídica | 7 estados, transição exclusiva do Gestor com evidência; integração futura com tribunal apenas **propõe**; prazo default de resolução pós-`defeated` parametrizável. | **DECISÃO — revisar** — [ADR-008](./adr/ADR-008-maquina-estado-juridico.md) |
| Gate regulatório | Os 7 itens `requiresLegal` do checklist (`api/src/domain.js:188-194`) viram itens bloqueantes de plataforma com parecer externo anexado; `go_live_enabled=false` recusa **em código** qualquer operação real. | **DECISÃO — revisar** — [ADR-007](./adr/ADR-007-gate-regulatorio-bloqueante.md) |
| Curadoria de conteúdo | Remoções/ajustes urgentes no acervo público atual (docs de terceiros, custos desatualizados, vídeos informais), independentes do marketplace. Três itens aguardam confirmação do usuário. | **DECISÃO — revisar** — [ADR-009](./adr/ADR-009-curadoria-conteudo.md) |

Pré-requisito técnico transversal (Fase 0): eliminar o efeito colateral de escrita na leitura de
caso — hoje `GET /cases/:id` regrava o caso a cada leitura (`api/src/server.js:193-197`), o que é
inaceitável num sistema auditável.

## 6. Mapa dos documentos

### Docs 01–11

| Doc | O que contém |
|---|---|
| [01-rbac-permissoes](./01-rbac-permissoes.md) | Identidade (Keycloak realm `besc` + oidc-kit), RBAC em dados (roles/permissions/scopes), enforcement, seeds, fluxo "papel novo sem deploy", anti-lockout. |
| [02-modelo-de-dados](./02-modelo-de-dados.md) | Todas as entidades novas do Postgres, convivência JSON×Postgres, tabela "entidade atual → destino", tipos monetários, estratégia de migração. |
| [03-elasticidade-tokenizacao](./03-elasticidade-tokenizacao.md) | Os 3 valores separados, trava por contrato, fator imutável, 8 invariantes normativas e os 3 exemplos numéricos canônicos. |
| [04-maquina-estado-juridico](./04-maquina-estado-juridico.md) | 7 estados do título, transições permitidas, cascatas (contratos/aluguéis/treasury), fluxo `defeated` (substituição vs write-off), gate de elegibilidade case→título. |
| [05-camada-ledger-blockchain](./05-camada-ledger-blockchain.md) | `LedgerPort` + adapters (simulado → Besu QBFT → consórcio), comparativo de redes, token ERC-3643 lite, outbox transacional, reconciliação, custódia por fase, "o que nunca vai on-chain". |
| [06-modelo-receita](./06-modelo-receita.md) | Fee de 1ª transferência + aluguel, `fee_schedule`/`invoice`/`ledger_entry`/`cost_entry`, invariantes I1–I7, fluxo sem gateway, plano de contas e 6 relatórios financeiros. |
| [07-trilha-auditoria](./07-trilha-auditoria.md) | `audit_event` hash-chain, taxonomia fechada de eventos, 3 camadas de imutabilidade, ancoragem Merkle, export pericial + verificador independente, LGPD × imutabilidade. |
| [08-portais-perfis](./08-portais-perfis.md) | Mapa de rotas por perfil, onboarding/convites, dossiê público allowlist, reaproveitamento do frontend atual. |
| [09-roadmap](./09-roadmap.md) | Fases 0–4 + gate regulatório, cada uma com objetivo, entregáveis, "não entra", critérios de pronto verificáveis e esforço. Inclui a Fase 0-C (curadoria, urgente e independente). |
| [10-gate-regulatorio](./10-gate-regulatorio.md) | Os 7 itens `requiresLegal` como bloqueantes formais, item a item, com tipo de evidência exigida e quem emite; flag `go_live_enabled`. |
| [11-curadoria-conteudo](./11-curadoria-conteudo.md) | Os 7 pedidos de curadoria do anexo do usuário mapeados a IDs de seed reais, ações propostas, confirmações pendentes e a mecânica de execução em 3 passos. |

### ADRs ([adr/README.md](./adr/README.md))

| ADR | Decisão registrada |
|---|---|
| [ADR-001](./adr/ADR-001-revogacao-principios-v1.md) | Revogação deliberada dos princípios P2–P5 do v1. |
| [ADR-002](./adr/ADR-002-postgres-e-convivencia-json.md) | Postgres novo para identidade/marketplace; cases ficam no JSON. |
| [ADR-003](./adr/ADR-003-spa-unica-areas-gated.md) | SPA única com áreas gated; catálogo 2 níveis; dossiê allowlist. |
| [ADR-004](./adr/ADR-004-identidade-realm-besc-oidc-kit.md) | Realm Keycloak dedicado `besc` + oidc-kit (vs ForwardAuth de borda). |
| [ADR-005](./adr/ADR-005-ledger-port-besu-erc3643.md) | LedgerPort com adapter simulado → Besu QBFT; ERC-3643; aluguel off-chain. |
| [ADR-006](./adr/ADR-006-receita.md) | Fee % face + piso na saída da treasury; aluguel % a.m. + índice. |
| [ADR-007](./adr/ADR-007-gate-regulatorio-bloqueante.md) | Gate regulatório bloqueante em código (`go_live_enabled`). |
| [ADR-008](./adr/ADR-008-maquina-estado-juridico.md) | Máquina de 7 estados; só Gestor transiciona, com evidência. |
| [ADR-009](./adr/ADR-009-curadoria-conteudo.md) | Curadoria do acervo público (remoção de docs de terceiros/informais). |

### Apêndices (normativos, ainda proposta)

| Apêndice | Conteúdo |
|---|---|
| [Apêndice A](./apendices/A-ledger-port.md) | Interface `LedgerPort` completa (TypeScript-like), com idempotência em toda escrita. |
| [Apêndice B](./apendices/B-ddl-conceitual.md) | DDL conceitual de TODAS as tabelas novas (nenhuma tabela órfã de doc). |
| [Apêndice C](./apendices/C-matriz-rbac.md) | Matriz endpoint/rota × papel (+anônimo) → allow/deny. |
| [Apêndice D](./apendices/D-exemplos-numericos.md) | Exemplos numéricos de elasticidade e receita, conferíveis centavo a centavo. |

## 7. Glossário das entidades novas

Definições resumidas; o modelo completo está em [02-modelo-de-dados](./02-modelo-de-dados.md) e a
DDL no [Apêndice B](./apendices/B-ddl-conceitual.md).

| Entidade | O que é |
|---|---|
| `security_title` | O **título**: o ativo do marketplace, originado de um case elegível do levantamento (referência soft `case_id`, único por case). Carrega classe, quantidade de ações, status jurídico denormalizado e status de listagem. |
| `market_valuation` | Série temporal **append-only** de avaliações da ação (valor por ação, fonte, evidência) — o "valor de mercado", que nunca altera contratos. |
| `tokenization_parameter` | Parâmetro **versionado** de tokenização do título: `tokens_per_share` (fator, imutável após 1ª emissão) e `unit_face_value` (valor unitário de contratação). No máximo 1 versão ativa; re-avaliação = versão nova. |
| `token_batch` | Um **lote de emissão** de tokens do título (quantidade, snapshot do valor na emissão, referências de chain quando houver). |
| `wallet` / `wallet_position` | Carteira (custodial/treasury) e a **posição fungível por lote** — não há linha por token individual. |
| `token_movement` | Ledger append-only de movimentações de tokens (mint/transfer/substitute); `wallet_position` é a projeção. |
| `token_contract` | O **contrato de contratação** de tokens: congela `unit_face_value_frozen` e `total_face_value` no instante da contratação — imutáveis por schema e por trigger. É a âncora da trava de valor. |
| `contract_substitution` | Registro da troca de um contrato de título caído por contrato novo em título disponível, preservando o **montante** travado (`preserved_face_value`) e eventual `residual_value`. |
| `lease` | Contrato de **aluguel/locação** de tokens (a receita principal): % a.m. sobre base congelada, competências, suspensão/reativação governadas pela máquina jurídica. |
| `fee` / `fee_schedule` | A cobrança de 1ª transferência (única por contrato — unique parcial `WHERE kind='first_transfer'`) e a tabela versionada de regras de fee. |
| `invoice` / `ledger_entry` / `cost_entry` | Fatura manual (sem gateway), lançamento contábil de dupla entrada **append-only** (correção só por estorno) e custo lançado pelo Gestor — a base do DRE receita×custo. |
| `legal_status_history` | Trilha append-only da máquina de estado jurídico do título (de/para, razão, evidência, ator). |
| `title_access_grants` | Vínculo explícito que dá a advogado/juiz leitura qualificada de um título específico (escopo `linked`). |
| `audit_event` / `audit_anchor` | O coração da auditabilidade: evento append-only com hash-chain SHA-256 calculada no banco; e a ancoragem Merkle periódica da cadeia no ledger. |
| `ledger_outbox` | Fila transacional que desacopla o domínio do ledger: escrita de domínio + evento + outbox na mesma transação; dispatcher idempotente entrega ao adapter. |
| `LedgerPort` | A **interface** (ports & adapters) pela qual o domínio fala com o ledger — `issueBatch`, `transfer`, `freezeTitle`, `substitute`, `anchorAuditRoot`, `getProof`… O domínio nunca conhece a rede; adapters: simulado → Besu → consórcio. |
| `regulatory_gate_item` / `go_live_enabled` | Os 7 itens regulatórios como bloqueantes de plataforma com parecer anexado, e o flag global que, enquanto `false`, recusa em código qualquer operação real. |
| `system_parameters` | Parâmetros operacionais tipados, versionados e auditados (ex.: valores de fee, prazo de resolução pós-`defeated`). |

## 8. Roadmap em uma frase

**Fase 0** funda identidade/RBAC/auditoria/Postgres + hardening → **Fase 1** tokeniza off-chain
(títulos, parâmetros, máquina jurídica, ledger simulado) → **Fase 2** abre os portais por perfil
(ainda demonstração) → **Fase 3** liga o Besu QBFT de teste pela mesma interface → **Fase 4**
ativa a receita — e o **gate regulatório é uma trava transversal, não uma fase**: nada vira
operação real sem os 7 pareceres e `go_live_enabled=true`. A **Fase 0-C (curadoria de conteúdo)**
é independente e urgente, executável antes de tudo. Detalhes e critérios de pronto verificáveis em
[09-roadmap](./09-roadmap.md).

## 9. O que este plano NÃO é

- **Não é código**: SQL/TS nos docs e apêndices é conceitual (normativo, mas ainda proposta).
- **Não altera o v1**: `ESCOPO-FUNCIONAL.md` permanece intocado como baseline; nenhuma contradição
  ao v1 aparece sem citar [ADR-001](./adr/ADR-001-revogacao-principios-v1.md).
- **Não executa nada**: deploy, migrations e a própria curadoria de conteúdo (que remove dados)
  exigem aprovação explícita do operador.
