---
title: "Pivot ADR-010 — Passo 1: auditoria de congelamento do produto"
status: canonical
applies_to: [besc]
updated: 2026-09-26
language: pt-BR
---

# Auditoria de congelamento do produto (Passo 1)

Base canônica das decisões: repositório `besc`, `docs/reconciliation/**` e `relatorio/ADENDO-RECONCILIACAO.md`
(commit `8b3a429`, branch `docs/besc-reconciliation`). Decisão registrada em
[ADR-010](../evolution/adr/ADR-010-asset-infrastructure-pivot.md).

## Método

- Script reprodutível: [`tools/product-freeze-audit.mjs`](../../tools/product-freeze-audit.mjs).
- Varre `frontend/src`, `api/src`, `api/seed`, `api/test`, `api/sql`, `seed`, `docs`, `k8s`,
  `CLAUDE.md`, `ESCOPO-FUNCIONAL.md` e `devops.yaml` por 24 grupos de termos da tese antiga
  (investimento, marketplace, treasury, tokens por ação, aluguel, rentabilidade, valorização,
  preservação de valor, substituição de token, perícia como valuation, ágio, dívida pública,
  equiparação a dinheiro, liquidez garantida, "converter ou vender", CTA de investimento,
  compensação/quitação, caução, dação, tokenização, ERC-3643/Besu, compra/venda de ações,
  cautela, valor de face).
- Cada ocorrência é classificada **por regra** (superfície do arquivo + tema do termo), com
  overrides manuais para as linhas-exhibit da matriz de conflitos da reconciliação. **Não é revisão
  humana linha a linha**: é triagem reprodutível, que pode ser rodada de novo a qualquer momento.
- Saídas: `product-freeze-audit.before.csv` (uma linha por ocorrência, com arquivo, linha,
  superfície, termo, classificação, regra e trecho) e `product-freeze-audit.before.summary.json`.
  O estado "antes" foi capturado sobre `origin/main` (`61b8cd6`), antes de qualquer alteração.

Classificações:

| Classe | Significado |
|---|---|
| `DANGEROUS` | Superfície pública que oferece investimento ou afirma valor, liquidez ou mecanismo como fato |
| `MISLEADING` | Texto servido como fato da plataforma que apresenta a tese antiga como vigente |
| `LEGACY_PRODUCT` | Implementação ou desenho da tese antiga (código, SQL, telas internas, docs de evolução) |
| `LEGAL_CLAIM_REQUIRING_CONTEXT` | Documento de terceiro (petição, laudo, material comercial) que precisa de rótulo de natureza |
| `HISTORICAL_QUOTE` | Ementa ou resumo de decisão: citação de fonte, não afirmação da plataforma |
| `SAFE_INFORMATIONAL` | Aviso, restrição ou conteúdo neutro |

## Resultado "antes" (2.588 ocorrências)

| Superfície | DANGEROUS | MISLEADING | LEGACY_PRODUCT | LEGAL_CLAIM_REQUIRING_CONTEXT | HISTORICAL_QUOTE | SAFE_INFORMATIONAL | Total |
|---|---:|---:|---:|---:|---:|---:|---:|
| docs_evolution | 0 | 0 | 850 | 0 | 0 | 9 | 859 |
| seed_jurisprudence | 0 | 0 | 0 | 0 | 448 | 0 | 448 |
| seed_overrides | 0 | 0 | 0 | 0 | 338 | 0 | 338 |
| docs_escopo_v1 | 0 | 0 | 113 | 0 | 0 | 63 | 176 |
| marketplace_code | 0 | 0 | 165 | 0 | 0 | 0 | 165 |
| api_core | 0 | 0 | 67 | 0 | 0 | 29 | 96 |
| internal_ui_marketplace | 0 | 0 | 93 | 0 | 0 | 0 | 93 |
| internal_ui | 0 | 0 | 64 | 0 | 0 | 11 | 75 |
| public_ui | 6 | 35 | 0 | 0 | 0 | 23 | 64 |
| public_ui_offer | 50 | 0 | 0 | 0 | 0 | 0 | 50 |
| public_content | 13 | 25 | 0 | 0 | 0 | 8 | 46 |
| sql_marketplace | 0 | 0 | 44 | 0 | 0 | 0 | 44 |
| reports | 0 | 0 | 30 | 0 | 0 | 3 | 33 |
| seed_library | 0 | 0 | 0 | 32 | 0 | 0 | 32 |
| docs_agent_context | 0 | 22 | 0 | 0 | 0 | 1 | 23 |
| tests | 0 | 0 | 15 | 0 | 0 | 0 | 15 |
| infra_besu | 0 | 0 | 11 | 0 | 0 | 0 | 11 |
| seed_other | 0 | 0 | 0 | 0 | 0 | 8 | 8 |
| infra | 0 | 0 | 0 | 0 | 0 | 6 | 6 |
| fixtures | 0 | 0 | 0 | 4 | 0 | 0 | 4 |
| sql_core | 0 | 0 | 0 | 0 | 0 | 2 | 2 |
| **Total** | **69** | **82** | **1.452** | **36** | **786** | **163** | **2.588** |

## Achados que exigem ação imediata

| # | Onde | O que diz | Classe | Tratamento |
|---|---|---|---|---|
| 1 | `frontend/src/pages/PortalHome.jsx:25,46`; `App.jsx:41,266` | CTA "Investir em títulos lastreados em ações BESC" e item de menu "Investir" | DANGEROUS | Home reescrita; rotas e menu removidos (commit do frontend) |
| 2 | `frontend/src/pages/Marketplace.jsx`, `TituloDossie.jsx`, `InvestidorCarteira.jsx` | Catálogo público, dossiê com fator tokens/ação e "valor de face travado", contratação, carteira | DANGEROUS | Desroteados; API responde 410 para catálogo, dossiê e contratação |
| 3 | `api/src/reference/portal-content.js:40` | "Acionistas tiveram 30 dias para converter em ações do BB ou vender por R$ 2,4468/ação" | DANGEROUS | Fato corrigido: conversão automática em 11/02/2009; 30 dias eram o recesso |
| 4 | `portal-content.js:6-30` (`VALUE_PROPOSITION`) | "Liquidez: 2º grau na hierarquia de penhora", "quitação de passivos tributários, bancários…" | DANGEROUS | Movido para `THIRD_PARTY_CLAIMS` com natureza `COMMERCIAL_MATERIAL`; fora da home |
| 5 | `portal-content.js:48-52` (`MECHANISMS`) e `LEGAL_BASIS` (perícia, hierarquia, sub-rogação) | Mecanismos de "liquidação com ações BESC" e perícia pela data da cártula "que gera o ágio" | DANGEROUS/MISLEADING | Idem; perícia deixa de ser valuation |
| 6 | `api/src/reference/glossary.js` (17 linhas) | "BESC… utilizadas apenas na esfera judicial", "2º grau", "compartilhada com a União", "gera o ágio" | MISLEADING | Definições reescritas como fatos verificados ou alegações de terceiros |
| 7 | `api/seed/library.json` (32 linhas) | Petição: "títulos de dívida pública, equiparados a dinheiro, de notória liquidez"; material comercial: "redução de 70%", "liberação de CND" | LEGAL_CLAIM_REQUIRING_CONTEXT | Rótulo `sourceNature` por item; material comercial fora da lista pública |
| 8 | `CLAUDE.md` (22 linhas) | "Evolução MARKETPLACE (Fases 0–4 IMPLEMENTADAS e no ar)" | MISLEADING | Reescrito com as regras de domínio não negociáveis |
| 9 | `api/src/marketplace/**`, `api/sql/0003`, `0005`, telas `Gestao*` | Implementação completa da tese antiga | LEGACY_PRODUCT | Congelada em três camadas (rota, domínio, boot); tabelas mantidas como histórico |
| 10 | `api/src/reports.js` | Relatórios de estratégia, de parceiro de tokenização e de análise de caução | LEGACY_PRODUCT | Removidos da lista; rotas respondem 410 |
| 11 | `api/seed/jurisprudence.json`, `overrides.json` (786 linhas) | Ementas e resumos | HISTORICAL_QUOTE | Mantidos como citação; reavaliação por decisão exposta como `assessment` de fonte |

## O que o congelamento já garante (commit 1 do pivot)

- **Rota**: `governance/legacy-freeze.js` registra 24 rotas que respondem `410 LEGACY_THESIS_FROZEN`
  antes da identidade e do RBAC, e bloqueia os três relatórios removidos antes do `authorize`.
- **Domínio**: `governance/capabilities.js` congela `TOKENIZATION_REAL`, `MARKETPLACE_REAL`,
  `REAL_MONEY` e `REAL_INVESTMENT` em `false`, sem override por ambiente; 17 funções de escrita do
  marketplace recusam com `403 CAPABILITY_DISABLED` antes de qualquer consulta ao banco.
- **Boot**: `LEDGER_ADAPTER=besu` é recusado; `/portal/mode` e `gateStatus` nunca retornam `goLive`.
- **Testes**: `api/test/legacy-freeze.http.test.mjs` e `api/test/capabilities.test.mjs`.

O estado "depois" é gerado pelo mesmo script com `--label after` ao fim da rodada.

## Resultado "depois"

As regras ganharam contexto em duas etapas: no commit de conteúdo (comentário de código não é servido; bloco `THIRD_PARTY_CLAIMS` é citação rotulada; definição com norma citada em conteúdo público é neutra; tela DEPRECATED fora do roteamento é produto legado; negações explícitas são avisos; regiões próprias em CLAUDE.md) e no hardening (definição educacional com norma citada também em UI pública; `content-overlay.js` é lógica de validação, não copy). Para a comparação ser justa, o "antes" foi **refeito com as regras finais** sobre o commit-base `61b8cd6` (`product-freeze-audit.before-v2.*`). O arquivo `before` original, com as regras iniciais, é mantido. A coluna "rodada 1" é o resultado registrado no commit `17e03c84`, com as regras daquele momento.

| Classe | Antes (before-v2) | Depois, rodada 1 | Depois, hardening |
|---|---:|---:|---:|
| `DANGEROUS` | 66 | 0 | 0 |
| `MISLEADING` | 76 | 2 | 0 |
| `LEGACY_PRODUCT` | 1310 | 1460 | 1507 |
| `LEGAL_CLAIM_REQUIRING_CONTEXT` | 36 | 36 | 36 |
| `HISTORICAL_QUOTE` | 766 | 799 | 799 |
| `SAFE_INFORMATIONAL` | 318 | 513 | 530 |
| **Total** | 2572 | 2810 | 2872 |

Superfícies públicas e de contexto de agente:

| Superfície · classe | Antes | Depois, rodada 1 | Depois, hardening |
|---|---:|---:|---:|
| docs_agent_context · LEGACY_PRODUCT | 0 | 7 | 8 |
| docs_agent_context · MISLEADING | 22 | 0 | 0 |
| docs_agent_context · SAFE_INFORMATIONAL | 1 | 7 | 7 |
| frozen_ui · LEGACY_PRODUCT | 0 | 120 | 120 |
| frozen_ui · SAFE_INFORMATIONAL | 0 | 37 | 37 |
| public_content · DANGEROUS | 12 | 0 | 0 |
| public_content · HISTORICAL_QUOTE | 0 | 33 | 33 |
| public_content · MISLEADING | 23 | 0 | 0 |
| public_content · SAFE_INFORMATIONAL | 11 | 42 | 42 |
| public_ui_offer · DANGEROUS | 48 | 0 | 0 |
| public_ui_offer · SAFE_INFORMATIONAL | 2 | 3 | 4 |
| public_ui · DANGEROUS | 6 | 0 | 0 |
| public_ui · MISLEADING | 31 | 2 | 0 |
| public_ui · SAFE_INFORMATIONAL | 27 | 38 | 40 |

O total cresce porque o pivô acrescentou código, testes e documentação que citam os termos para proibi-los ou rotulá-los. A coluna de risco é a que importa: **DANGEROUS 0 e MISLEADING 0**. Os dois MISLEADING residuais da rodada 1 eram definições educacionais no glossário da Ajuda ("valor mobiliário" e FIDC). Não foram escondidos por palavra-chave: as definições passaram a citar a norma (Lei 6.385/1976, art. 2º; Resolução CVM 175/2022) e a regra de "definição com base normativa" passou a valer também para UI pública, como já valia para conteúdo público.

Os testes `api/test/content-reclassification.test.mjs`, `api/test/public-copy.test.mjs` e `api/test/reports-language.test.mjs` travam o resultado: falham se uma frase perigosa voltar ao conteúdo da plataforma, às páginas roteadas ou aos relatórios, ou se uma tela congelada voltar a ser importada.
