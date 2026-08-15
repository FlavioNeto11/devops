---
title: "09 — Roadmap em fases"
status: proposta
updated: 2026-07-10
language: pt-BR
---

# 09 — Roadmap em fases

Este documento sequencia a evolução do BESC de portal de levantamento a marketplace de ações
tokenizadas. Cada fase descreve **objetivo, entregáveis concretos (por serviço/tela/tabela),
dependências, riscos com mitigação, critérios de "pronto" verificáveis, esforço (P/M/G) e o que
NÃO entra**. O detalhamento de cada tema vive nos docs irmãos: identidade em
[01-rbac-permissoes](./01-rbac-permissoes.md), dados em [02-modelo-de-dados](./02-modelo-de-dados.md),
elasticidade em [03-elasticidade-tokenizacao](./03-elasticidade-tokenizacao.md), máquina jurídica em
[04-maquina-estado-juridico](./04-maquina-estado-juridico.md), ledger em
[05-camada-ledger-blockchain](./05-camada-ledger-blockchain.md), receita em
[06-modelo-receita](./06-modelo-receita.md), auditoria em [07-trilha-auditoria](./07-trilha-auditoria.md),
portais em [08-portais-perfis](./08-portais-perfis.md), gate em
[10-gate-regulatorio](./10-gate-regulatorio.md) e curadoria em
[11-curadoria-conteudo](./11-curadoria-conteudo.md).

## 1. Princípios do sequenciamento

1. **Convivência total** — o módulo de levantamento atual (casos, pendências, risco, relatórios)
   **continua operando em todas as fases**: ele é a origem dos títulos do marketplace. O motor de
   pendências/status/risco (`api/src/domain.js`) não é tocado.
2. **Cases ficam no store JSON** — a Fase 0 **não** migra cases para Postgres. O Postgres novo
   (`besc-postgres`) nasce exclusivamente para identidade/RBAC/marketplace/auditoria; a migração
   de cases é uma fase opcional **tardia** (workstream F5, §10). Ver
   [ADR-002](./adr/ADR-002-postgres-e-convivencia-json.md).
3. **Cada fase é aditiva e deployável isolada** (Argo CD auto-sync — manifests só via git). A base
   JSON nunca é destruída; rollback de qualquer fase é desativar o que ela adicionou.
4. **Única quebra para o operador atual**: `/casos` e as rotas de escrita passam de públicas a
   gated (`manager`) na Fase 0 — comunicada e mitigada com conta provisionada antes do gate
   ([ADR-003](./adr/ADR-003-spa-unica-areas-gated.md)).
5. **O GATE REGULATÓRIO não é fase — é trava transversal** (§9). Nenhuma fase o "conclui": ele é
   destravado por pareceres externos, e enquanto `go_live_enabled=false` tudo permanece em regime
   de demonstração/piloto ([ADR-007](./adr/ADR-007-gate-regulatorio-bloqueante.md)).

### Absorção do roadmap público atual (`Roadmap.jsx`)

A página `/roadmap` do próprio app declara fases A–G (`frontend/src/pages/Roadmap.jsx:13-21`).
Este plano **absorve** as três que estavam adiadas:

| Fase do `Roadmap.jsx` | Status declarado hoje | Absorvida por |
|---|---|---|
| E — Tokenização (índice de prontidão) (`Roadmap.jsx:18`) | planejado | **Fase 1** — o índice de prontidão vira o gate de elegibilidade caso→título (§5) |
| F — Governança (login/multiusuário/auditoria) (`Roadmap.jsx:19`) | diferido | **Fase 0** — Keycloak realm `besc` + RBAC + trilha (§4) |
| G — Integrações futuras (trilho on-chain/smart contract) (`Roadmap.jsx:20`) | fora do escopo | **Fase 3** — Besu QBFT de teste (§7). Consulta a tribunais permanece futura (e, quando vier, só **propõe** transição — doc 04) |

A fase C (custos de cartório, `Roadmap.jsx:16`) é tocada pela **curadoria** (remoção da tabela de
custas — doc 11). A página `/roadmap` deve ser atualizada junto com cada entrega (mudança pequena
de frontend).

## 2. Visão geral

```
Fase 0-C (curadoria) ── IMEDIATA, independente — pode concluir antes de tudo
Fase 0 (fundação) ──► Fase 1 (token off-chain) ──► Fase 2 (portais) ──► Fase 4 (receita)
                                    └────────────► Fase 3 (Besu de teste; paraleliza; NÃO bloqueia a 4)
GATE REGULATÓRIO ═══ trava transversal: sem pareceres, nada opera com valor real
```

| Fase | Nome | Esforço | Depende de | Produto ao final |
|---|---|---|---|---|
| **0-C** | Curadoria de conteúdo | P | nada | Acervo público sem docs de terceiros/informais |
| **0** | Fundação (auth+RBAC+trilha+Postgres+hardening) | G | Keycloak e padrões da plataforma | App multi-perfil seguro, sem mudança de negócio |
| **1** | Tokenização off-chain | G | Fase 0 | Título→token simulado ponta a ponta, só Gestor |
| **2** | Portais por perfil | G | Fases 0–1 | 3 áreas gated no ar (investidor demo, auditoria, gestão) |
| **3** | Besu QBFT de teste | M | Fase 1 | `BesuAdapter` espelhando o off-chain, zero divergência |
| **4** | Receita | M/G | Fases 1–2 (a 3 não bloqueia) | Fee+aluguel+contabilidade em piloto interno |
| **GATE** | Regulatório (trava) | — | pareceres externos | `go_live_enabled=true` — operação real liberada |

## 3. Fase 0-C — Curadoria de conteúdo (IMEDIATA, workstream independente) — esforço **P**

- **Objetivo:** remover do acervo público os itens com risco jurídico (documentos de terceiros,
  material informal) e ajustar conteúdo desatualizável — **independente do marketplace e urgente**;
  não depende de nenhuma outra fase e não bloqueia nenhuma. Detalhamento completo, item a item com
  IDs de seed: [11-curadoria-conteudo](./11-curadoria-conteudo.md) e
  [ADR-009](./adr/ADR-009-curadoria-conteudo.md).
- **Entregáveis:** (a) `DELETE` via API dos itens vivos de biblioteca/jurisprudência (remove
  metadado + binário do PVC); (b) remoção dos mesmos itens de `api/seed/library.json` /
  `api/seed/jurisprudence.json` + bump de `api/seed/catalog-version.json` (o `seedCatalog()` só faz
  upsert e nunca deleta — `api/src/store.js:174` — por isso os 3 passos são casados); (c) mudança
  de código pequena: remoção da aba "Custas de cartório" da Referência
  (`api/src/reference/notary-fees-2024.js` + `frontend/src/pages/Referencia.jsx`) e ajuste do texto
  da fase C em `frontend/src/pages/Roadmap.jsx:16`; (d) reclassificação do laudo de atualização
  monetária (novo valor no enum `library_kind` de `api/src/domain-content.js` + `PUT` no item).
- **Dependências:** nenhuma. Execução requer **aprovação do operador** (é remoção de dados).
- **Riscos + mitigação:** ressurreição de item removido pelo seed (mitigar: os 3 passos casados +
  bump de versão); remoção de item incerto (mitigar: **DECISÃO — revisar** — 3 itens do anexo
  aguardam confirmação do usuário e ficam pendentes sem bloquear os demais; registrados na
  [ADR-009](./adr/ADR-009-curadoria-conteudo.md)).
- **Pronto quando (verificável):** `curl` nos IDs removidos → `404`; os IDs não constam mais dos
  JSONs de seed (grep); a Referência não exibe a aba de custas; uso do PVC cai (~o grosso dos
  275 MB são os 4 vídeos removidos — `kubectl exec ... -- du -sh /data`); changelog registrado no
  doc 11.
- **Não entra:** nenhuma feature nova; nenhuma alteração no módulo de casos.

## 4. Fase 0 — Fundação (auth + RBAC + trilha + Postgres + hardening) — esforço **G**

- **Objetivo:** transformar um app público e sem identidade em plataforma multi-perfil segura,
  **sem mudar funcionalidade de negócio**. Absorve a fase F do `Roadmap.jsx`.
- **Entregáveis:**
  - *Plataforma/k8s:* `besc-postgres` novo (manifesto `apps/besc/k8s/postgres.yaml` no padrão
    sicat/reqhub), credenciais via Sealed Secrets; `resources`/`securityContext` nos Deployments
    (hoje ausentes — em `k8s/besc.yaml` o único `resources` é o do PVC, linha 7); revisão do PVC
    `besc-data` 1Gi (subdimensionado; a curadoria alivia, mas uploads crescem); middleware de
    secure-headers no IngressRoute.
  - *Keycloak:* realm dedicado `besc` + client OIDC
    ([ADR-004](./adr/ADR-004-identidade-realm-besc-oidc-kit.md)).
  - *besc-api:* `@flavioneto11/oidc-kit` (sessão própria, padrão SICAT); rotas `/auth/*`;
    middleware `attachIdentity` + `authorize(permission)` deny-by-default; **fim do CORS `*`**
    (`api/src/server.js:31-37` → allowlist com credenciais); rate limit e limites de body/upload;
    **fix do write-on-read**: `GET /cases/:id` hoje regrava o caso a cada leitura via
    `saveAndEnrich` (`api/src/server.js:193-197`) — leitura passa a enriquecer só em memória;
    `append_audit_event()` na mesma transação de toda mutação.
  - *Tabelas (Postgres novo):* `users`, `roles`, `permissions`, `role_permissions`, `user_roles`,
    `user_sessions`, `invitations`, `title_access_grants`, `rbac_meta`, `system_parameters`,
    `audit_event` (append-only, hash-chain) — DDL no
    [Apêndice B](./apendices/B-ddl-conceitual.md).
  - *besc-frontend:* telas de login/registro (`/entrar`, `/cadastro`), UI mínima Admin → Papéis e
    Usuários; gating de `/casos` e `/cases/*` para `manager`.
  - *O que NÃO muda:* store JSON continua dono de `cases`, `library`, `jurisprudence`, `glossary`,
    `catalogMeta`; motor de pendências/status/risco intocado
    ([ADR-002](./adr/ADR-002-postgres-e-convivencia-json.md)).
- **Dependências:** Keycloak da plataforma (ns `identity`); padrão Postgres + Sealed Secrets já
  existentes no monorepo (`apps/sicat/k8s/postgres.yaml` como referência).
- **Riscos + mitigação:** quebra do fluxo do operador único (mitigar: conta `manager` provisionada
  e testada **antes** de ligar o gate); lockout de RBAC (mitigar: guardas anti-lockout — não
  remover o último `manager` ativo, doc 01); reversão de manifesto pelo Argo selfHeal (mitigar:
  toda config via git, nunca `kubectl apply` avulso de env).
- **Pronto quando (verificável por comando/teste):**
  1. `curl -s -o /dev/null -w '%{http_code}' -X POST https://dev.nvit.com.br/besc/api/cases` → `401`;
  2. `curl -s -o /dev/null -w '%{http_code}' https://dev.nvit.com.br/besc/api/library` → `200`
     (portal de conhecimento segue público);
  3. dois `GET /cases/:id` consecutivos retornam o mesmo `updatedAt` (write-on-read eliminado);
  4. teste de integração: toda mutação (case, library, RBAC) gera `audit_event` na mesma transação
     — mutação sem evento falha a suíte; hash-chain recomputada bate;
  5. `scripts/validate-platform.ps1` e smoke do Argo verdes; login SSO + login local de bootstrap
     funcionam.
- **Não entra:** qualquer entidade de token, portais novos, receita, blockchain, **migração de
  cases para Postgres**, KYC real.

## 5. Fase 1 — Tokenização OFF-CHAIN — esforço **G**

- **Objetivo:** título→token com elasticidade e **máquina de estado jurídico de 7 estados**
  (`unjudged`, `ruled_favorable`, `ruled_against`, `under_appeal`, `reinstated`, `defeated`,
  `archived` — doc 04, [ADR-008](./adr/ADR-008-maquina-estado-juridico.md)), 100% simulado,
  acessível só ao Gestor. Absorve a fase E do `Roadmap.jsx` (índice de prontidão).
- **Entregáveis:**
  - *Tabelas:* `security_title` (com `case_id` soft unique e `eligibility_snapshot`),
    `market_valuation` (append-only), `tokenization_parameter` (versões, 1 ativa),
    `legal_status_history` (append-only), `token_batch`, `wallets` (incl. treasury),
    `wallet_position`, `token_movement` (append-only), `token_contract`
    (`unit_face_value_frozen` imutável por trigger), `contract_substitution`, `ledger_outbox`,
    `audit_anchor` — [Apêndice B](./apendices/B-ddl-conceitual.md).
  - *Máquina jurídica:* transições exclusivas do Gestor com `reason` + `evidence_ref` obrigatórios;
    disponibilidade derivada (`legal_status ∈ {unjudged, ruled_favorable, reinstated} ∧
    listing_status='listed'`); cascatas sobre **contratos** (suspensão/reativação/`defeated` com
    substituição ou write-off) — a extensão das cascatas a aluguéis chega na Fase 4, pelo mesmo
    motor de eventos. Prazo default da janela de resolução (`resolution_window_days`):
    **DECISÃO — revisar** com o jurídico ([ADR-008](./adr/ADR-008-maquina-estado-juridico.md)).
  - *Gate de elegibilidade:* case em `ready_for_structuring` (ou `ready_with_caveats` com override
    explícito registrado); snapshot de `case.status`/risco/docPct congelado no cadastro do título;
    regressão do case pós-título gera **alerta** ao Gestor, nunca transição automática (doc 04).
  - *Ledger:* interface `LedgerPort` completa ([Apêndice A](./apendices/A-ledger-port.md)) +
    `SimulatedLedgerAdapter` + outbox transacional + dispatcher
    ([ADR-005](./adr/ADR-005-ledger-port-besu-erc3643.md)).
  - *Auditoria da fatia:* job de ancoragem Merkle (`anchorAuditRoot` funciona já no simulado),
    exportação (JSONL/CSV/PDF + manifesto), CLI `audit-verify`, job `ledger-reconcile` — doc 07.
  - *Telas (Gestor):* `/gestao/titulos`, `/gestao/titulos/:id` (parâmetros, emissões, estado
    jurídico com evidência, tokens, contratos), `/gestao/estado-juridico` (fila); aba 11
    **"Título/Emissão"** no `CaseDetail.jsx` (ponte caso→título).
- **Dependências:** Fase 0 (identidade, RBAC, trilha, Postgres).
- **Riscos + mitigação:** acoplamento caso↔título mal desenhado (mitigar: título referencia caso
  por id soft, nunca duplica dados; caso segue editável); disciplina de imutabilidade (mitigar:
  triggers + teste de contrato "UPDATE em coluna congelada falha"); invariante de supply sob
  concorrência (mitigar: transação + `SELECT ... FOR UPDATE` por título).
- **Pronto quando (verificável):**
  1. cenário canônico roda ponta a ponta simulado: 10 ações × fator 100 = 1.000 tokens emitidos,
     contratados, suspensos, reativados e substituídos — reproduzindo os exemplos do doc 03 /
     [Apêndice D](./apendices/D-exemplos-numericos.md), com trilha íntegra (`audit-verify` OK);
  2. transição `→ ruled_against` propaga: nova contratação responde `409`, contratos vigentes ficam
     `suspended` na mesma transação;
  3. a suíte de testes do `LedgerPort` passa no `SimulatedLedgerAdapter`;
  4. teste de contrato: `UPDATE` em `unit_face_value_frozen`/`quantity` de `token_contract` falha
     (trigger);
  5. criação de título a partir de case fora de `ready_for_structuring`/`ready_with_caveats`
     responde `409`.
- **Não entra:** acesso de investidor/auditor, blockchain real, dinheiro, **fee e faturamento**
  (estrutura de receita é Fase 4), KYC.

## 6. Fase 2 — Portais por perfil — esforço **G**

- **Objetivo:** as três áreas gated do doc 08 no ar — investidor **sem transação real** (contratos
  demo com watermark), auditor read-only com leitura registrada, painel do Gestor completo.
- **Entregáveis:**
  - *Rotas/telas:* mapa completo do doc 08 — `/marketplace` (teaser público), `/entrar`,
    `/cadastro`, `/investidor` (dashboard, catálogo, dossiê, contratar/alugar demo, carteira,
    contratos, substituições), `/auditoria` (busca, título, processo, exports), `/gestao/usuarios`
    (aprovação de investidores, convites, RBAC admin). Watermark **"ambiente de demonstração — sem
    valor mobiliário ofertado"** em toda a área do investidor (remoção só pós-gate — doc 10).
  - *Tabelas:* `title_listing` (dossiê público como **projeção allowlist**, nunca PII do titular —
    [ADR-003](./adr/ADR-003-spa-unica-areas-gated.md)), `terms_document` versionado + registro de
    aceite, registro de leitura qualificada na trilha (eventos `audit.access.*` em `audit_event` —
    [07-trilha-auditoria](./07-trilha-auditoria.md)).
  - *Onboarding:* auto-registro cria só `investor` em `pending_approval` → Gestor aprova; advogado/
    juiz **somente por convite** com escopo (`title_access_grants`).
- **Dependências:** Fases 0–1.
- **Riscos + mitigação:** vazamento de dado interno no dossiê (mitigar: projeção allowlist — só os
  campos enumerados na ADR-003 saem; teste de snapshot do payload público); confusão regulatória
  de "oferta" (mitigar: watermark + textos revisados + nenhuma promessa de rentabilidade).
- **Pronto quando (verificável):**
  1. a matriz rota/endpoint × papel do [Apêndice C](./apendices/C-matriz-rbac.md) é percorrida por
     suíte automatizada afirmando allow/deny para os 4 papéis **+ anônimo**;
  2. advogado convidado enxerga apenas os títulos do escopo concedido (teste com 2 grants
     distintos);
  3. toda leitura de auditor gera evento na trilha (query em `audit_event` após navegação);
  4. investidor `pending_approval` recebe `403` no dossiê completo;
  5. teste E2E: watermark presente em todas as páginas de `/investidor`.
- **Não entra:** fee/aluguel reais, blockchain, pagamento, KYC real, remoção do watermark (travada
  pelo gate — doc 10).

## 7. Fase 3 — Besu QBFT de teste — esforço **M**

- **Objetivo:** `BesuAdapter` implementando o **mesmo** `LedgerPort`, com o off-chain permanecendo
  a fonte canônica. Absorve o trilho on-chain da fase G do `Roadmap.jsx`.
  Rede/token conforme [ADR-005](./adr/ADR-005-ledger-port-besu-erc3643.md) (Besu permissionado
  QBFT; ERC-3643 perfil reduzido, 1 contrato por título).
- **Entregáveis:** StatefulSet Besu QBFT single-validator no k8s do lab (resources limitados);
  contratos ERC-3643 lite (factory, `TitleToken`, `IdentityRegistry` compartilhado,
  `AuditAnchorRegistry`); `BesuAdapter`; hot wallet via Sealed Secrets; toggle de adapter por
  config; ancoragem da trilha on-chain (`anchorAuditRoot` + `getProof`); rotina `ledger-reconcile`
  com relatório de divergência e **pendência bloqueante** no título divergente; Blockscout
  read-only opcional.
- **Dependências:** Fase 1 (port + suíte + outbox); infra k8s. **Não bloqueia a Fase 4** (receita
  roda sobre o adapter simulado).
- **Riscos + mitigação:** consumo de recursos do lab (mitigar: single-node QBFT de teste com
  limites); divergência de estado (mitigar: off-chain é canônico, divergência congela o título até
  resolução manual auditada); subir Besu cedo demais sem valor probatório com um só operador
  (mitigar: fase M isolada e paralelizável — pode ser adiada sem represar a receita).
- **Pronto quando (verificável):**
  1. a **mesma suíte** do `SimulatedLedgerAdapter` passa no `BesuAdapter` (ex.:
     `LEDGER_ADAPTER=besu npm test` no besc-api);
  2. relatório de reconciliação = **zero divergências após 1 semana** de operação de teste;
  3. rollback Besu→simulado ensaiado e documentado (runbook), com re-execução da suíte após o
     rollback;
  4. âncora da trilha verificável ponta a ponta: `audit-verify` + `getProof` do anchor on-chain.
- **Não entra:** chain pública, custódia de valor real, tokens com valor real (gate), consórcio
  multi-validador/HSM/carimbo ICP-Brasil (etapa futura pós-gate, decisão de negócio).

## 8. Fase 4 — Receita — esforço **M/G**

- **Objetivo:** o modelo do doc 06 no ar — fee de 1ª transferência, aluguel, contabilidade de dupla
  entrada e conciliação — ainda em **regime de piloto interno** até o gate.
- **Regra central (reconciliada):** fee de 1ª transferência = **saída da treasury (distribuição
  primária)** — % do valor de face do contrato (0,5% *placeholder*) + piso (R$ 25,00 *placeholder*);
  transferências secundárias e substituições **isentas com registro explícito**
  (`fee_exemption_reason`); unicidade garantida por unique parcial
  `fee(contract_id) WHERE kind='first_transfer'`. Percentuais/piso são placeholders a calibrar com
  custo real de infra: **DECISÃO — revisar** ([ADR-006](./adr/ADR-006-receita.md)).
- **Entregáveis:**
  - *Tabelas:* `fee_schedule` (versionado, 1 ativo), `fee`, `invoice`, `ledger_entry` (dupla
    entrada, append-only, correção só por estorno), `cost_entry`, `lease` + accrual com unique
    `(lease_id, competence_period)` — [Apêndice B](./apendices/B-ddl-conceitual.md).
  - *Regras:* invariantes I1–I7 do doc 06 com testes — no mapeamento reconciliado da máquina de 7
    estados, "suspenso" ≙ `{ruled_against, under_appeal}` e "revogado" ≙ `defeated`; cascatas
    jurídicas estendidas aos aluguéis (suspensão corta accrual **pro-rata por dias corridos**;
    reativação retoma); "Fechar competência" manual pelo Gestor (sem cron nesta fase).
  - *Telas (Gestor):* `/gestao/fees` (versões e ativação de `fee_schedule`), `/gestao/alugueis`
    (contratos + fechar competência), `/gestao/financeiro` (faturas, marcar paga com comprovante,
    custos, conciliação); faturas visíveis na área do investidor.
  - *Relatórios (pipeline `reports.js`):* `revenue_by_period`, `receivables_aging`,
    `fee_exemption_audit`, `lease_roll`, `revenue_vs_cost`, `trial_balance`.
- **Dependências:** Fases 1–2 (transferências e contratos existem). **A Fase 3 não é bloqueante.**
- **Riscos + mitigação:** erro contábil silencioso (mitigar: `trial_balance` automático +
  append-only + correção só por estorno `reversal_of_seq`); disputa sobre pro-rata (mitigar: regra
  explícita nos termos aceitos).
- **Pronto quando (verificável):**
  1. os exemplos numéricos do [Apêndice D](./apendices/D-exemplos-numericos.md) reproduzem
     **centavo a centavo** em staging (fixture/script de replay);
  2. teste de invariante: transferência **secundária** (origem ≠ treasury) jamais gera fatura;
  3. `trial_balance`: `SUM(débitos) = SUM(créditos)` por período (query direta);
  4. `fee_exemption_audit` lista 100% das transferências com `fee = 0` com
     `fee_exemption_reason` preenchido;
  5. suspensão jurídica em meio de competência produz accrual pro-rata correto (caso do exemplo 2
     do doc 06).
- **Não entra:** gateway de pagamento/PIX/cartão, cobrança automática, dados financeiros
  sensíveis, dinheiro real de terceiros (travado pelo gate).

## 9. GATE REGULATÓRIO — trava transversal (não é fase)

Os **7 itens `requiresLegal`** do checklist de tokenização (`api/src/domain.js:188-194`) são
elevados a **bloqueantes formais de plataforma**: cada um vira um `regulatory_gate_item` exigindo
parecer externo de profissional habilitado; só a aprovação completa
(`regulatory_gate_approval`) liga o flag global `go_live_enabled`. Enquanto `false`, o sistema
**recusa em código**: marcar investidor como apto a operar valor real, remover o watermark de
demonstração, emitir fatura fora do piloto e emitir on-chain com valor real. Especificação item a
item, entidades e processo: [10-gate-regulatorio](./10-gate-regulatorio.md) e
[ADR-007](./adr/ADR-007-gate-regulatorio-bloqueante.md).

O gate **corre em paralelo** às fases: a contratação da assessoria jurídica/regulatória pode (e
deve) começar já — nada nas Fases 0–4 depende dele, e nada vira operação real sem ele.

## 10. Workstreams técnicos internos (sequência de dependências F0→F5)

O plano de dados/identidade define workstreams incrementais (cada um deployável isolado) que se
distribuem pelas fases acima:

| Workstream | Conteúdo | Cai na fase |
|---|---|---|
| **F0 — pré-requisitos** | fix do write-on-read em `GET /cases/:id` (`api/src/server.js:193-197`); `postgres.yaml` + Secret selado + migrations runner no boot (padrão `AUTO_MIGRATE` do SICAT, advisory lock); `pg` entra como dependência (hoje a API só tem express+multer) | Fase 0 |
| **F1 — identidade/RBAC** | tabelas de identidade + `/auth/*` + oidc-kit → RBAC (catálogo, matriz, middleware, seeds, cache) → UI Admin de papéis → fechar CORS e proteger escritas existentes | Fase 0 |
| **F2 — marketplace core** | `security_title` + gate de elegibilidade + `market_valuation` + `tokenization_parameter` + `legal_status_history` + máquina de transições + telas do Gestor | Fase 1 |
| **F3 — emissão/carteira/contrato** | `token_batch`, `wallets`, `wallet_position`, `token_movement`, `token_contract` (trava de valor) | Fase 1 — **exceto a `fee`**, deslocada para a Fase 4 (nenhuma cobrança antes do bloco de receita) |
| **F4 — aluguel + substituição** | `contract_substitution` + cascatas jurídicas; `lease` + accrual | dividido: substituição/cascatas de contrato na **Fase 1**; `lease` e cobrança na **Fase 4** |
| **F5 — cases → Postgres (opcional, tardia)** | mover `cases` para `cases(id, doc JSONB)` preservando o shape; `store.js` vira repositório com API idêntica; portal de conhecimento fica no JSON indefinidamente | **fora das fases numeradas** — só se/quando houver ganho concreto: **DECISÃO — revisar** ([ADR-002](./adr/ADR-002-postgres-e-convivencia-json.md)) |

Da fatia de ledger/auditoria (doc 05/07), o sequenciamento próprio mapeia assim: fundação da
trilha (`audit_event` + trigger + `append_audit_event`) ⊂ Fase 0; ledger simulado + outbox ⊂
Fase 1; auditoria completa (ancoragem Merkle, exports, `audit-verify`, reconciliação) ⊂ Fases 1–2;
Besu = Fase 3; consórcio (4+ validadores, HSM, ICP-Brasil, RFC 3161) = pós-gate, fora do horizonte
deste roadmap.

## 11. Convivência e rollback

- O levantamento continua sendo usado normalmente durante toda a evolução — os casos são a
  matéria-prima dos títulos, e o dossiê de due diligence permanece vivo e editável após a listagem
  (regressões geram alerta, nunca transição automática — doc 04).
- A única mudança percebida pelo operador atual é o login (Fase 0). Investidores e auditores só
  percebem o app a partir da Fase 2.
- Rollback por fase: tudo é aditivo; desativar rotas/telas novas devolve o comportamento anterior;
  a base JSON nunca é migrada destrutivamente; o Postgres pode ser recriado do zero sem afetar o
  levantamento.
