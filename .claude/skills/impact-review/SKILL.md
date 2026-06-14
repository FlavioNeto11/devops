---
name: impact-review
description: Analisa o impacto de uma mudança de requisito usando o mapa de impacto e a fila de reprocessamento — o que é afetado downstream (requisitos, ADRs, serviços, infra, testes) e o que exige atenção/reprocessamento do Claude. Use ao alterar um requisito ASR/major, ao avaliar uma proposta, ou ao priorizar trabalho.
argument-hint: "<REQ-ID | produto>"
---

# impact-review — análise de impacto orientada por requisitos

Avalia consequência de mudança a partir da **rastreabilidade tipada** dos requisitos. A aplicação
evolui A PARTIR dos requisitos (e arquitetura/infra são artefatos derivados), não o contrário.
Fonte: `specs/baseline/impact-map.json` (grafo) + `current-baseline.json` (`reprocess_queue` + `impact_score`).

## Como funciona o impacto

- **Mapa de impacto** (`impact-map.json`): nós = requisitos + artefatos (`ADR-`, `svc-`, `infra-`,
  `test-`, `slo-`); arestas = links tipados (`constrains`, `allocates_to`, `verifies`, `depends_on`,
  `derives_from`, `refines`, `conflicts_with`, `relates_to`).
- **Score de impacto** (0–100, 5 fatores): abrangência de escopo · criticidade de negócio ·
  significância arquitetural · natureza de segurança/regulatória · lacuna de verificação.
  `impact_band` = high/medium/low.
- **Fila de reprocessamento** (`reprocess_queue`): requisitos de alto impacto OU com lacuna de
  verificação — o que o Claude deve revisar primeiro.

## Fluxo

1. **Localizar o(s) requisito(s)** alvo no `current-baseline.json` (por `id` ou `scope.product_scope`).
2. **Seguir o grafo** em `impact-map.json`: arestas `from = <REQ>` (o que ele afeta/aloca/verifica) e
   `to = <REQ>` (o que depende/refina/constrange ele). Subir o fecho transitivo nos `depends_on`/
   `derives_from`/`constrains` para achar o conjunto afetado.
3. **Classificar a mudança**: editorial (patch) → impacto baixo; compatível (minor) → revisar
   dependentes diretos; incompatível (major) ou **ASR** → revisar o conjunto afetado + ADRs/serviços/
   infra alocados (`allocation.*_refs`) + cobertura de verificação.
4. **Reportar**: requisitos afetados, artefatos (ADR/serviço/infra/teste) a revisitar, lacunas de
   verificação, e itens que sobem para a `reprocess_queue`. Recomendar ações (atualizar ADR, ajustar
   serviço, criar teste).
5. Se a mudança ainda não está na baseline, rode **sync-spec** antes (impacto é calculado sobre a
   baseline gerada).

## Saída esperada

Um resumo objetivo: **mudança X** → **afeta {requisitos}** → **toca {ADRs/serviços/infra/testes}** →
**lacunas {…}** → **fila de reprocessamento {…}**. Sem fabricar links que não existem no grafo.
