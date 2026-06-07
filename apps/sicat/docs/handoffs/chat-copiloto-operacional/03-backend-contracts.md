# 03-backend-contracts

## Objetivo da fase
Implementar a refatoracao inicial da camada backend conversacional com arquitetura de tools modular, validacao deterministica, normalizacao de resposta e inicio da fase de manifestos, preservando compatibilidade minima do endpoint /v1/conversations/turns.

## Diagnostico inicial curto
1. Estado atual da camada conversacional: fluxo funcional em production-like, mas com dispatcher monolitico e validacao de tool args difusa.
2. Tools existentes: orchestrate_manifest_operation, list/get/submit/print/cancel/replicate manifest, job status, audit trail, dashboard overview.
3. Lacunas atuais: ausencia de registry/schemas/resolver/normalizer/artifacts isolados; resolucao de referencia de manifesto limitada; envelope de resultado nao padronizado em todos os caminhos.
4. APIs operacionais ja disponiveis: manifest-service, job-service, audit-service, health-repo e rotas /v1/manifestos, /v1/jobs, /v1/audit, /v1/health.
5. Pontos de acoplamento: conversation-service -> policy/dispatcher -> manifest-service|job-service|audit-service|health-repo; llm-provider define function-calling.
6. Riscos: regressao em tool contracts existentes, confirmacao sensivel inconsistente por canal, ambiguidades de referencia por linguagem natural.
7. Plano de refatoracao: fasear em (a) inventario tecnico aplicavel em codigo, (b) nova arquitetura de tools com registry+schemas+resolver+normalizer+artifacts, (c) cobertura inicial de manifestos com referencias basicas e acoes sensiveis confirmadas.

## Arquivos analisados
- src/routes/conversation-routes.ts
- src/services/conversation/conversation-service.ts
- src/services/conversation/llm-provider.ts
- src/services/conversation/ai-config.ts
- src/services/conversation/conversation-tool-dispatcher.ts
- src/services/conversation/conversation-context-service.ts
- src/services/conversation/conversation-policy-service.ts
- src/services/conversation/conversation-observability.ts
- src/services/manifest-service.ts
- src/services/job-service.ts
- src/services/audit-service.ts
- src/services/catalog-service.ts
- src/services/partner-service.ts
- src/services/operations-service.ts
- src/services/sicat-account-service.ts
- src/services/sicat-auth-service.ts
- src/routes/api-routes.ts
- src/routes/dmr-routes.ts
- src/routes/mtr-provisorio-routes.ts
- docs/copilot/16-camada-conversacional.md
- docs/copilot/conversacional/03-arquitetura-conversacional.md
- docs/copilot/conversacional/04-intencoes-e-acoes.md
- docs/copilot/conversacional/05-seguranca-e-autorizacao.md
- docs/copilot/conversacional/08-telemetria-auditoria.md
- docs/copilot/conversacional/12-tool-contracts.md
- docs/copilot/conversacional/13-plano-fases-implementacao.md

## Decisoes
- Fase 1 aplicada ao codigo via inventario tecnico de tools no registry (objetivo/dependencias/policy/categoria) reutilizavel por policy e descoberta.
- Fase 2 implementada com separacao modular: tool-types, tool-registry, tool-schemas, tool-entity-resolver, tool-artifact-builder, tool-normalizer.
- Validacao deterministica de args por tool via zod e erro tipado CONVERSATION_TOOL_VALIDATION_FAILED.
- Policy consolidada por registry + regra especializada para intents orquestradas sensiveis.
- Inicio da Fase 3 (manifestos):
  - consulta/listagem/detalhe com normalizacao de envelope (type/artifacts/actions)
  - resolucao basica de referencia (last, list_item, id, numero)
  - submit/print/cancel com resolucao de referencia e confirmacao em policy
- Compatibilidade preservada para /v1/conversations/turns: shape principal mantida; resultado ganhou campos adicionais normalizados sem remover campos legados.

## Arquivos alterados
- src/services/conversation/conversation-policy-service.ts
- src/services/conversation/conversation-service.ts
- src/services/conversation/conversation-tool-dispatcher.ts
- src/services/conversation/llm-provider.ts
- src/services/conversation/tools/tool-types.ts
- src/services/conversation/tools/tool-registry.ts
- src/services/conversation/tools/tool-schemas.ts
- src/services/conversation/tools/tool-entity-resolver.ts
- src/services/conversation/tools/tool-artifact-builder.ts
- src/services/conversation/tools/tool-normalizer.ts

## Validacoes executadas
- npm run typecheck: PASS
- npx tsx --test tests/unit/conversation-policy-service.test.js tests/unit/conversation-recency-direction.test.js tests/unit/conversation-service-fallback.test.js: PASS (21 testes, 0 falhas)
- Observacao: warnings de persistencia em testes de fallback esperados por falta de fixtures de FK foram tratados por persistSafely sem quebrar o comportamento.

## Pendencias para proximos owners
- tester-qa-mtr: ampliar cobertura de regressao para cenarios de referencia de manifesto (last/list_item/number) e envelope normalizado result.type/artifacts/actions em rotas reais.
- tester-qa-mtr: adicionar testes de contrato para garantir backward compatibility do /v1/conversations/turns com clientes existentes.
- postgres-queue-mtr (somente se cadeia exigir): avaliar necessidade de persistir artifacts/actions em estrutura dedicada de auditoria conversacional futura.
