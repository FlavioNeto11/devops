---
title: "Índice das ADRs — evolução BESC marketplace"
status: proposta
updated: 2026-07-10
language: pt-BR
---

# ADRs — decisões de arquitetura da evolução BESC

Este diretório registra as decisões de arquitetura (Architecture Decision Records) do plano de
evolução do BESC para marketplace de ações tokenizadas. Contexto geral em
[00-visao-geral](../00-visao-geral.md).

## Regra de ouro (rastreabilidade 1:1)

**Toda ocorrência literal de "DECISÃO — revisar" nos docs [00](../00-visao-geral.md)–[11](../11-curadoria-conteudo.md)
tem uma ADR correspondente neste índice** (grep reverso fecha 1:1). A ADR é o lugar canônico da
decisão: os docs citam a ADR, nunca re-decidem. Quando uma decisão for confirmada pelo operador
(e, onde aplicável, pela assessoria jurídica), o `Status` da ADR muda de `DECISÃO — revisar` para
`aceita` — e as marcas nos docs são removidas na mesma edição.

## Convenção de formato

Cada ADR é um arquivo próprio `ADR-NNN-<slug>.md` com o cabeçalho fixo:

```markdown
# ADR-NNN — <título>
Status: DECISÃO — revisar | proposta | aceita | substituída por ADR-MMM
Contexto: <2–5 linhas; vínculo com o código atual (arquivo:linha) quando aplicável>
Decisão: <1 parágrafo imperativo>
Alternativas rejeitadas: <lista, 1 linha de porquê cada>
Consequências: <o que fica mais fácil/difícil; invariantes criados>
Revisão pendente: <o que confirmar e por quem>
```

- `Status: DECISÃO — revisar` = há escolha em aberto aguardando confirmação (o campo
  `Revisão pendente` diz exatamente o quê e de quem).
- `Status: proposta` = não há alternativa em aberto; a ADR aguarda apenas a aprovação do plano
  como um todo.
- Numeração é estável e nunca reutilizada; substituição gera ADR nova apontando a antiga.

## Índice

| ADR | Título | Resumo (1 linha) | Status |
|---|---|---|---|
| [ADR-001](./ADR-001-revogacao-principios-v1.md) | Revogação dos princípios P2–P5 do v1 | Revoga deliberadamente "sem login / sem pagamento / sem blockchain / não tokeniza" do ESCOPO-FUNCIONAL v1; o v1 permanece como especificação do módulo de levantamento. | proposta |
| [ADR-002](./ADR-002-postgres-e-convivencia-json.md) | Postgres e convivência com o store JSON | `besc-postgres` novo só para identidade/RBAC/marketplace/auditoria; cases + biblioteca/jurisprudência/glossário ficam no store JSON (motor de pendências intocado); migração de cases é fase opcional tardia. | DECISÃO — revisar |
| [ADR-003](./ADR-003-spa-unica-areas-gated.md) | SPA única com áreas gated | Uma SPA (`/besc`) com áreas por papel em vez de SPAs separadas; catálogo em 2 níveis (lista pública + dossiê gated); dossiê público = projeção allowlist sem PII. | DECISÃO — revisar |
| [ADR-004](./ADR-004-identidade-realm-besc-oidc-kit.md) | Identidade: realm `besc` + oidc-kit | Realm Keycloak dedicado `besc` + padrão SICAT/oidc-kit (sessão própria do app), auth no app e não ForwardAuth de borda; auto-registro cria só `investor`. | DECISÃO — revisar |
| [ADR-005](./ADR-005-ledger-port-besu-erc3643.md) | LedgerPort, Besu QBFT e ERC-3643 | Ledger abstraído em 2 estágios pela mesma interface (simulado → Besu permissionado QBFT); token ERC-3643 perfil reduzido, 1 contrato por título; aluguel off-chain com hash ancorado. | DECISÃO — revisar |
| [ADR-006](./ADR-006-receita.md) | Modelo de receita | Fee de 1ª transferência = % do valor de face do contrato + piso, cobrada só na saída da treasury (secundárias/substituições isentas com registro); aluguel % a.m. sobre base congelada + índice; percentuais placeholder. | DECISÃO — revisar |
| [ADR-007](./ADR-007-gate-regulatorio-bloqueante.md) | Gate regulatório bloqueante | Os 7 itens `requiresLegal` do checklist viram bloqueantes formais de plataforma com parecer externo; `go_live_enabled=false` recusa operação real em código. | DECISÃO — revisar |
| [ADR-008](./ADR-008-maquina-estado-juridico.md) | Máquina de estado jurídico | 7 estados do título; só o Gestor transiciona, com razão + evidência; integração futura com tribunal apenas propõe; cascatas de suspensão/substituição/write-off. | DECISÃO — revisar |
| [ADR-009](./ADR-009-curadoria-conteudo.md) | Curadoria de conteúdo | Remoção/ajuste de itens do acervo público atual (docs de terceiros, custos desatualizados, vídeos informais) por risco jurídico — urgente e independente do marketplace; 3 confirmações pendentes do usuário. | DECISÃO — revisar |

## Relação com os documentos

| ADR | Docs que a citam (principais) |
|---|---|
| ADR-001 | [00-visao-geral](../00-visao-geral.md) e qualquer doc que contradiga o v1 |
| ADR-002 | [02-modelo-de-dados](../02-modelo-de-dados.md), [09-roadmap](../09-roadmap.md) |
| ADR-003 | [08-portais-perfis](../08-portais-perfis.md) |
| ADR-004 | [01-rbac-permissoes](../01-rbac-permissoes.md) |
| ADR-005 | [05-camada-ledger-blockchain](../05-camada-ledger-blockchain.md), [Apêndice A](../apendices/A-ledger-port.md) |
| ADR-006 | [06-modelo-receita](../06-modelo-receita.md), [Apêndice D](../apendices/D-exemplos-numericos.md) |
| ADR-007 | [10-gate-regulatorio](../10-gate-regulatorio.md), [09-roadmap](../09-roadmap.md) |
| ADR-008 | [04-maquina-estado-juridico](../04-maquina-estado-juridico.md), [03-elasticidade-tokenizacao](../03-elasticidade-tokenizacao.md) |
| ADR-009 | [11-curadoria-conteudo](../11-curadoria-conteudo.md) |
