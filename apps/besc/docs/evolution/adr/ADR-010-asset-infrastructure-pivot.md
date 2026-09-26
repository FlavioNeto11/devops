---
title: "ADR-010 — Pivô para infraestrutura de recuperação de ativos legados"
status: aceita
updated: 2026-09-26
language: pt-BR
---

# ADR-010 — Pivô: da tese de marketplace/tokenização para pesquisa e recuperação de ativos legados

Status: **aceita** (operador, 26/09/2026). Substitui [ADR-005](./ADR-005-ledger-port-besu-erc3643.md),
[ADR-006](./ADR-006-receita.md), [ADR-007](./ADR-007-gate-regulatorio-bloqueante.md) e
[ADR-008](./ADR-008-maquina-estado-juridico.md); reverte parcialmente [ADR-001](./ADR-001-revogacao-principios-v1.md).

Contexto: a pesquisa jurídica de 25/09/2026 (repo `besc`, `relatorio/**`) e a reconciliação com
este app (repo `besc`, `docs/reconciliation/**`, base canônica) estabeleceram com fontes primárias
que o marketplace das fases 0–4 foi construído sobre premissas falsas. As ações do BESC foram
extintas por incorporação e convertidas automaticamente em ações ON do Banco do Brasil em
11/02/2009 (1 : 12,13308922). A posição só existe no escriturador (Lei 6.404, art. 35), a ação é
indivisível (art. 28) e gravame só se constitui por averbação ou registro na infraestrutura
autorizada. Perícia privada não cria titularidade, quantidade nem valor.

Decisão: a plataforma passa a ser **infraestrutura de pesquisa e recuperação de ativos legados**.
Documento antigo entra como `LegacyEvidence`; uma reivindicação (`Claim`) só vira direito
reconhecido com confirmação externa real, e só vira ativo registrado quando o sistema oficial de
registro o confirma. Tokenização e blockchain tornam-se opcionais e ficam fora do escopo. Nesta
rodada implementam-se somente F1 (correção de domínio) e F2 (ingestão de evidência legada).

Alternativas rejeitadas: ver §4.

Consequências: ver §5 a §8.

Revisão pendente: ver §10.

---

## 1. Antes e depois

| Dimensão | Antes (fases 0–4, jul/2026) | Depois (ADR-010) |
|---|---|---|
| Produto | Marketplace de ações BESC tokenizadas | Plataforma de Pesquisa e Recuperação de Ativos Legados |
| Unidade de trabalho | `security_title` criado a partir de caso "apto" | `Claim` (possível direito) apoiada em `LegacyEvidence` |
| Valor | Perícia → valor de face → tokens por ação | Valuation 2.0: tipos separados, opinião nunca vira fato |
| Fonte da verdade | Postgres/ledger da plataforma | Sistema oficial de registro (escriturador, depositário, tribunal) |
| Blockchain | Besu + ERC-3643 como registro | Opcional; nunca cria propriedade nem garantia |
| Receita | Fee de 1ª transferência + aluguel de tokens | Nenhuma nesta fase |
| Gate | `go_live_enabled` sem enforcement nas rotas | Capacidades congeladas em código + gates de governança no banco |
| Escopo de emissores | BESC | BESC como primeira origem; demais em pesquisa, gate fechado |

## 2. Motivo

- A premissa "caso apto = ativo" não tem base: sem confirmação do escriturador não há posição.
- A premissa "perícia define valor" transformava alegação de parte em preço de ativo.
- A premissa "ação fracionável em tokens" contraria a indivisibilidade da ação perante a companhia.
- O congelamento do go-live era só de UI: a auditoria mostrou rotas de escrita que não consultavam o gate.
- Estruturas de mercado com antigas ações BESC como lastro são objeto de investigação, o que torna o risco reputacional da tese antiga concreto.
- A escala de um produto restrito ao BESC não está demonstrada, e a de outros emissores não foi pesquisada.

## 3. Evidências

| Fato | Fonte |
|---|---|
| Incorporação aprovada nas AGEs de 30/09/2008; registro CVM cancelado | Aviso aos Acionistas BB 01/10/2008; cadastro CVM (código 1104) |
| Conversão automática em 11/02/2009, 1 BB : 12,13308922 | Protocolo e Justificação 11/09/2008, item 5.2; comunicado BB 06/02/2009 |
| Recesso de 06/10 a 04/11/2008 a R$ 2,44675527 | Protocolo item 7; avisos BB 01/10 e 03/10/2008 |
| Propriedade da ação escritural pelo registro | Lei 6.404/1976, arts. 34 e 35 |
| Decisões do acervo: 79 de 99 são decisões; nenhuma com trânsito verificado por certidão | repo `besc`, `docs/reconciliation/_notas/jurisprudencia-devops-reavaliacao.md` |
| Rotas de escrita sem consulta ao gate | repo `besc`, `docs/reconciliation/14-migration-from-devops.md` e `apps/besc/docs/pivot/01-product-freeze-audit.md` |

## 4. Alternativas rejeitadas

- **Manter o marketplace com disclaimers mais fortes**: disclaimer não corrige o objeto inexistente.
- **Apagar o código e as tabelas do marketplace**: perde rastreabilidade e trilha; o pedido foi congelar, não destruir.
- **Congelar só no frontend**: o frontend não é autoridade; qualquer cliente chamaria a API.
- **Flag de ambiente para religar a tese**: um `env` esquecido reabriria operação real. As capacidades são constantes de código.
- **Abrir outras origens já**: sem pesquisa com fonte primária, seria cadastrar fato não verificado.

## 5. Consequências e invariantes

1. Evidência legada não é ativo; `Claim` não é ativo; direito reconhecido não é ativo registrado.
2. Sem confirmação externa, não há `RegisteredAsset` (serviço **e** trigger no banco).
3. Confirmação `SIMULATION` nunca satisfaz o gate; confirmação manual exige quatro olhos.
4. Laudo privado entra só como `expert_estimate` com `legal_status = SOURCE_CLAIM`.
5. `claimed_value` e `expert_estimate` nunca derivam `recognized_value`, `market_value` ou `collateral_value`.
6. Mudança de estado só por `entity_transition` (append-only) validada contra `allowed_transition`.
7. Trilha de auditoria v2: fonte obrigatória, correção por evento `*.corrected`, verificador SQL.
8. PII fica em `claimant`; a trilha não carrega PII.
9. `multi_issuer_research_gate = CLOSED`: só a origem BESC aceita reivindicações.

## 6. Congelamento (três camadas)

| Camada | Mecanismo | Resposta |
|---|---|---|
| Rota | `api/src/governance/legacy-freeze.js`, antes da autenticação | 410 `LEGACY_THESIS_FROZEN` |
| Domínio | `api/src/governance/capabilities.js`: `TOKENIZATION_REAL`, `MARKETPLACE_REAL`, `REAL_MONEY`, `REAL_INVESTMENT` = `false`, sem override | 403 `CAPABILITY_DISABLED` antes de tocar o banco |
| Boot | `marketplace/index.js` recusa o adaptador Besu | processo não arma o ledger |

## 7. Depreciados, reaproveitados e migrados

### 7.1 Mapa terminológico

| Termo antigo | Classificação | Destino |
|---|---|---|
| `security_title` | DEPRECATE | Tabela mantida só para leitura histórica; criação responde 410. Conceito substituído por `Claim` → `RecognizedRight` → `RegisteredAsset`. |
| `token_batch` | DEPRECATE | Leitura histórica; emissão congelada. Futuro `TokenRepresentation` opcional (F9), só sobre `RegisteredAsset`. |
| `tokenization_parameter` (`tokens_per_share`, `unit_face_value`) | REMOVE | Sem substituto: ação é indivisível; valor de face não existe. |
| `token_contract` | DEPRECATE | Leitura histórica; contratação e substituição congeladas. |
| `wallet_position` / movimentos | DEPRECATE | Leitura histórica; a plataforma não custodia posições. |
| treasury | REMOVE | Sem substituto: a plataforma não detém ativos de terceiros. |
| lease / fee / invoice | DEPRECATE | Leitura histórica; escrita congelada. Contabilidade de dupla entrada fica como referência técnica. |
| `market_valuation`, `updated_value_pericial`, ágio | REPURPOSE | Valuation 2.0: `claimed_value`, `historical_value`, `expert_estimate` (F2); `recognized_value` e seguintes só F4+. |
| máquina jurídica de 7 estados do título | REPURPOSE | Padrão reaproveitado em `entity_transition`; litígio vira `Claim.LITIGATION`. |
| `go_live_enabled` / gate | REPURPOSE | Capacidades congeladas + `governance_gate` com aprovação quatro-olhos. |
| `LedgerPort` / `SimulatedLedgerAdapter` | KEEP_INTERNAL | Porta opcional de "system of proof"; nunca fonte da verdade. |
| `BesuAdapter`, `TitleRegistry.sol`, `k8s/besu.yaml` | DEPRECATE | Recusado no boot; manifesto intocado nesta rodada (Argo exige aprovação). |
| caso de levantamento (`cases`, store JSON) | MIGRATE | `Claimant` + `Claim` (mesmo id) + `LegacyEvidence` por anexo; demo seed não migra. |
| `pericia` do caso | MIGRATE | `expert_estimate` com `SOURCE_CLAIM`. |
| `estimated_value` do caso | MIGRATE | `claimed_value` com `SOURCE_CLAIM`. |
| RBAC, identidade, `audit_event` | KEEP | Mantidos; auditoria estendida (v2); 13 permissões do marketplace rotuladas "desativado". |
| papel `investor` | DEPRECATE | Rótulo "desativado"; ainda é o papel dado no primeiro login SSO (auto-provisionamento, pendente de aprovação; ver §10). |

### 7.2 Conceitos novos

`AssetOrigin`, `LegacyEvidence` (+ classificação append-only), `Claimant`, `Claim`, `ClaimValidation` (F4),
`ExternalConfirmation`, `RecognizedRight`, `RegistrationRequest`, `RegisteredAsset`, `Valuation` 2.0,
`ApprovalRequest` (quatro olhos), `GovernanceGate`, `EntityTransition`.

### 7.3 Migração

`LegacyCase → Claim` roda no boot, idempotente e com falha isolada por caso
(`recovery/service.js`, `migrateLegacyCase`). Tabelas antigas não são destruídas.

## 8. Conteúdo público

Fatos da plataforma exigem fonte (`statement()` recusa fato sem `sourceRef`). Material comercial,
petições e laudos ficam em `thirdPartyClaims`, com aviso e contraponto. A jurisprudência recebe a
reavaliação editorial na leitura, sem alterar o seed. Itens de terceiros sem autorização saem da
biblioteca pública, mas continuam armazenados.

## 9. Implementação (branch `feat/besc-asset-recovery-pivot`)

| Commit | Conteúdo |
|---|---|
| congelamento | três camadas, testes HTTP de 410 sem autenticação |
| auditoria v2 | proveniência, correção por evento, verificador SQL, TRUNCATE bloqueado |
| F1 | domínio, invariantes no serviço e no banco (`sql/0007_asset_recovery.sql`) |
| F2 | ingestão de evidência, reivindicações, migração de casos |
| conteúdo | fatos × alegações de terceiros, reavaliação da jurisprudência, biblioteca classificada |
| frontend | jornada de recuperação; telas do marketplace desroteadas |
| este ADR | ADR-010, CLAUDE.md, cabeçalhos de status, auditoria de congelamento "after" |

## 10. Revisão pendente

- Trocar o papel `investor` do auto-provisionamento SSO por um papel neutro (decisão de produto do operador).
- Retirar `k8s/besu.yaml` e variáveis `LEDGER_*` do Argo (exige aprovação do operador).
- F3 (cadeia de titularidade) e F4 (validação externa) dependem de canais reais com escriturador e depositário.
- Pesquisa com fonte primária antes de abrir qualquer outra origem (`multi_issuer_research_gate`).
- Confirmação da autenticidade do documento `lib_0390897258c1` e autorização de terceiros para material restrito (ADR-009).
