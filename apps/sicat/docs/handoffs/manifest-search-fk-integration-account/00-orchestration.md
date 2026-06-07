# 00 - Orchestration

## Demanda original (resumo)

Investigar e corrigir o erro `23503` de foreign key em `manifests.integration_account_id` ao pesquisar manifestos pelo endpoint `GET /v1/manifestos` com `integrationAccountId` e `sessionContextId` reais.

## Evidencia inicial

- Request reportado pelo usuario: `GET /v1/manifestos?integrationAccountId=acc_acc_1048c579b90c3e6d788c4812c5&sessionContextId=scx_ccac5739eb50ce2f480ae3c6cb&dateFrom=2026-04-17&dateTo=2026-04-18&page=1&pageSize=20`
- Correlation id: `frontend_1273675a-203f-48c1-8f42-37cb3728b7af`
- Erro observado:
  - `500 Internal Server Error`
  - `insert or update on table "manifests" violates foreign key constraint "manifests_integration_account_id_fkey"`
  - `code: 23503`

## Evidencia adicional apos primeira correcao

- Nova request reportada pelo usuario, ainda falhando no fluxo remoto:
  - `GET /v1/manifestos?integrationAccountId=acc_acc_1048c579b90c3e6d788c4812c5&sessionContextId=scx_ccac5739eb50ce2f480ae3c6cb&dateFrom=2026-04-17&dateTo=2026-04-18&forceSync=true&pageSize=20`
- Correlation id: `frontend_317ed8ca-e04d-42a9-98e6-cc3d17386003`
- Erro ainda observado:
  - `500 Internal Server Error`
  - `insert or update on table "manifests" violates foreign key constraint "manifests_integration_account_id_fkey"`
  - `code: 23503`
- Implicacao:
  - a primeira correcao cobriu a classe de contexto inconsistente em ambiente controlado, mas o caminho com `forceSync=true` e IDs reais ainda encontra uma variante nao mitigada do mesmo problema.

## Classificacao obrigatoria

```yaml
orchestration:
  work_id: "manifest-search-fk-integration-account"
  intent: "fix"
  complexity: "moderate"
  domains:
    - "persistence-worker"
    - "backend-contract"
    - "qa"
    - "docs"
  first_agent: "postgres-queue-mtr"
  phase_sequence:
    - phase: "04-persistence-worker"
      agent: "postgres-queue-mtr"
      required: true
      reason: "O erro principal e uma violacao de foreign key na persistencia de manifests, indicando causa provavel em repositorio, mapeamento de integrationAccount ou gravacao sincronizada da busca."
    - phase: "03-backend-contracts"
      agent: "programador-backend-mtr"
      required: false
      reason: "Se a correcao exigir ajuste fora da camada de persistencia, o owner de backend assume a parte de service/route sem misturar ownership implicitamente."
    - phase: "09-qa-validation"
      agent: "tester-qa-mtr"
      required: true
      reason: "A correcao precisa ser revalidada no endpoint real de pesquisa de manifestos, incluindo ausencia de regressao no caminho sincronizado."
    - phase: "10-documentation-final"
      agent: "documentador-mtr"
      required: true
      reason: "Consolidar causa raiz, arquivos alterados, validacao executada e limites remanescentes."
```

## Critérios de pronto

- a pesquisa `GET /v1/manifestos` nao falha mais por foreign key de `integration_account_id`;
- a causa raiz fica explicita e corrigida no owner apropriado;
- a validacao do endpoint prova o comportamento corrigido;
- resultado documentado neste work_id.

## Checkpoints esperados

- `docs/handoffs/manifest-search-fk-integration-account/00-orchestration.md`
- `docs/handoffs/manifest-search-fk-integration-account/04-persistence-worker.md`
- `docs/handoffs/manifest-search-fk-integration-account/09-qa-validation.md`
- `docs/handoffs/manifest-search-fk-integration-account/10-documentation-final.md`

## Handoff imediato

Proximo agente obrigatorio: `postgres-queue-mtr`.

Objetivo da fase 04: investigar a causa raiz da violacao de foreign key ao persistir manifests durante a pesquisa, corrigir no ponto certo e devolver validacao focal com proximo owner explicito.