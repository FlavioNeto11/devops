# 05 - Domain Rules

## Objetivo da fase

Endurecer semantica operacional da camada conversacional para manifesto/CDF/CDR/jobs/auditoria em pedidos simples e compostos, removendo ambiguidade de selecao em acoes sensiveis e alinhando saida de dominio ao contrato component-first (`result.type`) entregue na fase 03.

## Decisoes de dominio aplicadas

1. Pedidos compostos com filtros/exclusoes/ordenacao/selecoes contextuais:
- `manifest.list_recent_top` passou a aceitar exclusoes deterministicas (`excludeManifestIds`, `excludeIndexes`) e agrupamento/ranking (`groupBy`) com retorno operacional consolidado.
- Novo intent `manifest.group_recent_top` para agregacao/comparacao por grupo sem heuristica de frase fixa.

2. Lote e replicacao segmentada com determinismo:
- Acoes sensiveis em lote e cancelamento por recencia adotaram workflow `preview -> selectionSnapshot -> confirmacao`.
- Execucao confirmada passou a exigir `selectionSnapshot` (ou conjunto explicitamente informado) para evitar recalculo silencioso.
- Replicacao segmentada adicionada via `manifest.replicate_segmented` com `segments[]`, preview e confirmacao deterministicos.

3. Criacao guiada com campos faltantes + preview:
- Novo intent `manifest.preview_create_from_payload` retorna:
	- `manifest_missing_fields` quando faltam obrigatorios;
	- `manifest_creation_draft` com `creationSnapshot` quando payload esta pronto.
- `manifest.create_from_payload` passou a aceitar snapshot congelado para execucao confirmada.

4. CDF/CDR com vinculo operacional a manifestos:
- `cdf.list_by_manifest_selection`: consulta CDF/CDR vinculando hashes e janela de datas dos manifestos selecionados.
- `cdf.generate_from_manifest_selection`: enfileira geracao de CDF/CDR com payload operacional.
- `cdf.preview_download_batch_selected` + `cdf.download_batch_selected`: preview e download em lote com snapshot deterministico.

5. Erros de dominio estruturados e acionaveis:
- Novos codigos tratados no `conversation-service` com mensagens operacionais claras:
	- `CONVERSATION_SELECTION_SNAPSHOT_REQUIRED`
	- `CONVERSATION_SELECTION_SNAPSHOT_MISMATCH`
	- `CONVERSATION_SELECTION_SCOPE_MISMATCH`
	- `CONVERSATION_SELECTION_SNAPSHOT_EMPTY`
	- `CONVERSATION_CDF_PAYLOAD_REQUIRED`
	- `CONVERSATION_CDF_DOCUMENT_SET_REQUIRED`

6. Alinhamento component-first (`result.type`):
- Normalizador de resultado ampliado para tipar corretamente previews/guiado/CDF lote (`manifest_batch_preview`, `manifest_missing_fields`, `manifest_creation_draft`, `cdf_action`).

## Arquivos alterados

- `src/services/conversation/conversation-tool-dispatcher.ts`
- `src/services/conversation/conversation-policy-service.ts`
- `src/services/conversation/conversation-service.ts`
- `src/services/conversation/llm-provider.ts`
- `src/services/conversation/planning/conversation-entity-resolver.ts`
- `src/services/conversation/planning/conversation-operation-planner.ts`
- `src/services/conversation/results/conversation-result-normalizer.ts`
- `src/services/conversation/tools/tool-types.ts`
- `tests/unit/conversation-operation-planner.test.js`
- `tests/unit/conversation-policy-service.test.js`
- `tests/unit/conversation-result-normalizer.test.js`
- `docs/handoffs/conversacional-operacional-ia/05-domain-rules.md`

## Validacoes executadas

1. `npm run typecheck`
- Resultado: **PASSOU**.

2. Testes focais de dominio/conversation:
- `npx tsx --test tests/unit/conversation-operation-planner.test.js tests/unit/conversation-policy-service.test.js tests/unit/conversation-result-normalizer.test.js tests/unit/conversation-recency-direction.test.js`
- Resultado: **30/30 passando**.

Justificativa do subset:
- Esta fase mudou regras de dominio/planner/policy/normalizacao (nao persistencia/worker).
- O subset escolhido cobre diretamente os comportamentos alterados: preview/confirmacao, determinismo de selecao, tipagem de resultado e regras de risco/policy.

## Riscos e pendencias

1. O fluxo de snapshot deterministico exige aderencia do planner para sempre produzir intents de preview antes de acao sensivel; sem isso, a conversa pode retornar erro acionavel pedindo preview.
2. Persistencia/worker ainda nao armazenam modelo dedicado de snapshot/plano; nesta fase o congelamento permanece no proprio payload conversacional (fase 04 deve consolidar trilha persistente).
3. Testes integrados E2E de novos intents CDF/replicacao segmentada ainda nao foram executados nesta etapa (ficam para fase de persistencia + QA).

## Handoff para fase 04

next_agent_required: `postgres-queue-mtr`

Prompt sugerido:

"work_id: conversacional-operacional-ia

Voce e owner da fase 04-persistence-worker desta rodada.

Contexto pronto: a fase 05-domain-rules endureceu a camada conversacional com preview+confirmacao via selectionSnapshot/creationSnapshot, replicacao segmentada, criacao guiada e intents CDF/CDR em lote.

Objetivo da fase 04:
1) Persistir trilha deterministica de selecao e confirmacao (snapshot/plano/execucao) em repositorios/tabelas adequadas.
2) Garantir que worker/jobs consigam auditar e reproduzir o conjunto confirmado sem recalculo silencioso.
3) Preservar correlationId/jobId/commandId/sessionContextId/integrationAccountId fim-a-fim.
4) Manter contratos HTTP e result.type sem quebra.

Arquivos base desta rodada para leitura:
- docs/handoffs/conversacional-operacional-ia/03-backend-contracts.md
- docs/handoffs/conversacional-operacional-ia/05-domain-rules.md
- src/services/conversation/conversation-tool-dispatcher.ts
- src/services/conversation/conversation-service.ts

Entregaveis esperados:
- checkpoint atualizado em docs/handoffs/conversacional-operacional-ia/04-persistence-worker.md
- validacoes de typecheck/testes relevantes da fase 04
- riscos e handoff para fase seguinte." 