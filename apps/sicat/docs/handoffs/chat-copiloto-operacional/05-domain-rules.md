# 05-domain-rules

## Objetivo da fase
Consolidar regras operacionais de manifestos/CDF no backend conversacional para consulta e acao com guardrails de seguranca, tratamento de faltantes/ambiguidades e compatibilidade com policy de canal/permissao/conta ativa.

## Escopo implementado
1. Regras de consulta e referencia contextual:
- referencia por `manifestId`, numero, `last`, `list_item` e conjunto anterior com fallback orientativo;
- tratamento explicito para referencia ambigua por numero de manifesto.

2. Regras de acao operacional:
- `manifest.create_draft` (rascunho assistido);
- `manifest.create_from_payload` com validacao de faltantes obrigatorios;
- `manifest.receive_with_receipt` com validacao de `receiptPayload`;
- `submit/print/cancel/replicate` preservados;
- batch seguro para submit/print/cancel via intents compostos.

3. Guardrails e seguranca:
- bloqueio de operacao sem conta CETESB ativa no contexto;
- bloqueio de operacao sem sessao quando exigida;
- confirmacao obrigatoria para intents sensiveis (R3/R4);
- compatibilidade com permissoes quando `context.metadata.permissionKeys` estiver presente;
- limite de lote seguro (`max=10`) + bloqueio com orientacao de fatiamento.

4. Integracao funcional CDF por regra de manifesto:
- intent `cdf.resolve_by_manifest_reference` para derivar criterios de CDF a partir do manifesto selecionado sem invadir persistencia/frontend.

## Arquivos analisados
- src/services/conversation/conversation-tool-dispatcher.ts
- src/services/conversation/tools/tool-entity-resolver.ts
- src/services/conversation/conversation-policy-service.ts
- src/services/conversation/conversation-service.ts
- src/services/conversation/llm-provider.ts
- src/services/manifest-service.ts
- src/services/operations-service.ts
- src/services/catalog-service.ts
- src/services/partner-service.ts
- docs/copilot/conversacional/04-intencoes-e-acoes.md
- docs/copilot/conversacional/05-seguranca-e-autorizacao.md
- docs/handoffs/chat-copiloto-operacional/03-backend-contracts.md

## Arquivos alterados
- src/services/conversation/conversation-tool-dispatcher.ts
- src/services/conversation/tools/tool-entity-resolver.ts
- src/services/conversation/conversation-policy-service.ts
- src/services/conversation/conversation-service.ts
- src/services/conversation/llm-provider.ts
- tests/unit/conversation-policy-service.test.js
- docs/copilot/conversacional/04-intencoes-e-acoes.md
- docs/copilot/conversacional/05-seguranca-e-autorizacao.md
- docs/handoffs/chat-copiloto-operacional/05-domain-rules.md

## Decisoes
1. Novas regras de dominio foram implementadas via `orchestrate_manifest_operation` para manter compatibilidade do contrato de tools.
2. Acoes de lote usam limite fixo de seguranca no backend conversacional para evitar execucoes massivas acidentais.
3. Erros operacionais sao convertidos em mensagens orientativas especificas para operador (faltantes, ambiguidade, contexto, permissao), evitando resposta generica.
4. Permission compatibility foi feita de forma nao disruptiva: so valida `permissionKeys` quando esse contexto for explicitamente enviado.
5. Ponte CDF foi implementada como resolucao de criterios por manifesto (`query`), sem executar geracao/download nesta fase.

## Validacoes executadas
- `npm run typecheck` -> PASS
- `npx tsx --test tests/unit/conversation-policy-service.test.js` -> PASS (12 testes)
- `npx tsx --test tests/unit/conversation-policy-service.test.js tests/unit/conversation-service-fallback.test.js` -> PASS
- `npx tsx --test tests/integration/conversation-composed-operations.test.js` -> PASS (13 testes)

## Resultado da fase
- Regras operacionais de manifesto/CDF consolidadas no backend conversacional com guardrails.
- Acoes sensiveis permanecem bloqueadas sem confirmacao conforme policy.
- Faltantes e ambiguidades retornam orientacao objetiva para o operador.

## Handoff para proximo owner
Proximo owner recomendado: `tester-qa-mtr`.

Prompt sugerido para o proximo owner:

```text
WORK_ID: chat-copiloto-operacional
Fase atual concluida: 05-domain-rules

Objetivo da proxima fase (QA): validar regressao e cobertura de regras operacionais no chat.

Escopo de validacao:
1) Cobrir novos intents compostos:
   - manifest.create_draft
   - manifest.create_from_payload
   - manifest.receive_with_receipt
   - manifest.batch_submit_selected
   - manifest.batch_print_selected
   - manifest.batch_cancel_selected
   - cdf.resolve_by_manifest_reference
2) Validar bloqueios/policy:
   - sem conta CETESB ativa
   - sem sessao quando exigida
   - sem confirmacao em R3/R4
   - PERMISSION_DENIED quando permissionKeys for informado
   - batch acima do limite seguro
3) Validar mensagens operacionais:
   - faltantes obrigatorios
   - referencia ambigua
   - referencia ausente/contexto insuficiente

Arquivos de entrada:
- docs/handoffs/chat-copiloto-operacional/05-domain-rules.md
- src/services/conversation/conversation-tool-dispatcher.ts
- src/services/conversation/conversation-policy-service.ts
- src/services/conversation/conversation-service.ts
- src/services/conversation/tools/tool-entity-resolver.ts

Entregaveis:
- checkpoint docs/handoffs/chat-copiloto-operacional/09-qa-validation.md
- evidencias de testes e gaps residuais
```
