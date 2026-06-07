# 08 - Access Control

## Objetivo da fase

Reforçar controles de acesso e guardrails para operações sensíveis conversacionais, garantindo confirmações com proteção a bypass e violações de escopo (account/session/profile), definir limites de lote por canal, e endurecer validações para uso de snapshots. Preservar contratos HTTP existentes.

## Decisões de arquitectura implementadas

### 1. Controle em cascata por canal/intenção/ferramenta

Implementado modelo sequencial de validação:

1. **Tool Registry & Intent Resolution**: Identificar ferramenta e intenção com fallback seguro para R1 (leitura).
2. **Channel Allowlist**: Validar canal permitido por risco (R1 → todos; R3/R4 → nativo/inapp apenas).
3. **Account Validation**: Exigir `integrationAccountId` para operações que necessitem contexto operacional.
4. **Permission Mapping**: Verificar permissões do perfil contra matriz `ORCHESTRATED_INTENT_PERMISSION` e `DIRECT_TOOL_PERMISSION`.
5. **Batch Limits**: Enforçar limites por canal antes de ação (`whatsapp: 2-3, native_chat: 5-10, inapp: 20`).
6. **Cross-Account Scope**: Validar snapshot de outra conta → `CROSS_ACCOUNT_VIOLATION`.
7. **Session Scope**: Validar snapshot de outra sessão → `SESSION_SCOPE_MISMATCH`.
8. **Confirmation**: Exigir flag `confirmed:true` para R3/R4.

### 2. Batch limits por intent e canal

Novo: `BATCH_LIMITS_BY_INTENT` com limites diferenciados:

- **WhatsApp**: 2-3 itens (menor throughput, custo operacional).
- **Native Chat**: 5-10 itens (balanceado).
- **InApp**: 20 itens (maior confiabilidade).

Aplicado a: `batch_cancel_selected`, `batch_submit_selected`, `batch_print_selected`, `replicate_segmented`, `cdf.download_batch_selected`, `cancel_recent_excluding_first`.

### 3. Validações de escopo e cross-account

#### Cross-Account Protection

Novo: `validateCrossAccountScope()` compara `snapshotAccountId` vs `currentAccountId` → `CROSS_ACCOUNT_VIOLATION`.

#### Session Scope Validation

Novo: `validateSessionScope()` compara `snapshotSessionContextId` vs `currentSessionContextId` → `SESSION_SCOPE_MISMATCH`.

### 4. Tipos enriquecidos de decisão

```typescript
export type ConversationPolicyDecision = {
  ...existing_fields,
  maxBatchSize?: number | null;           // NOVO
  enforcedScope?: 'account' | 'session' | 'profile' | null;  // NOVO
};
```

## Arquivos alterados

### Backend - Policy Enforcement

- [src/services/conversation/conversation-policy-service.ts](../../../src/services/conversation/conversation-policy-service.ts)
  - Novo: `BATCH_LIMITS_BY_INTENT` constant.
  - Novo: `extractBatchItemCount()`, `validateBatchSize()`, `validateCrossAccountScope()`, `validateSessionScope()`.
  - Novo: `buildBatchLimitExceededDecision()`, `buildCrossAccountViolationDecision()`, `buildSessionScopeViolationDecision()`.
  - Atualizado: `evaluateConversationPolicy()` com passos 5-8 na sequência.
  - Atualizado: `ConversationPolicyDecision` com `maxBatchSize` e `enforcedScope`.

### Testes

- [tests/unit/conversation-policy-service.test.js](../../../tests/unit/conversation-policy-service.test.js)
  - Mantido: 15 testes existentes (backward compatibility).
  - Status: ✅ **15/15 PASSANDO**.

- [tests/unit/conversation-policy-access-control.test.js](../../../tests/unit/conversation-policy-access-control.test.js) **NOVO**
  - Batch limit enforcement: 5 testes ✅
  - Cross-account scope: 3 testes ✅
  - Session scope: 3 testes ✅
  - Combined validations: 2 testes ✅
  - Read-only ops: 2 testes ✅
  - **Total: 15/15 PASSANDO**.

## Validações executadas

### 1. TypeScript Strict

```bash
npm run typecheck
```

✅ **PASSOU** (zero erros).

### 2. Testes Focais - Phase 08

```bash
npx tsx --test tests/unit/conversation-policy-access-control.test.js
```

✅ **15/15 PASSANDO** (328 ms).

### 3. Testes Regressão - Policy Original

```bash
npx tsx --test tests/unit/conversation-policy-service.test.js
```

✅ **15/15 PASSANDO** (285 ms).

## Matriz de controle de acesso

| Intent | Risk | Channels | Confirmation | MaxBatch (WA/NC/IA) | Requires Account | Permission |
|--------|------|----------|--------------|---------------------|------------------|------------|
| `manifest.list_recent_top` | R1 | All | ✗ | N/A | ✗ | manifest.read |
| `manifest.batch_cancel_selected` | R4 | Native,InApp | ✓ | 3/10/20 | ✓ | manifest.cancel |
| `manifest.batch_submit_selected` | R3 | Native,InApp | ✓ | 3/10/20 | ✓ | manifest.submit |
| `manifest.batch_print_selected` | R3 | Native,InApp | ✓ | 3/10/20 | ✓ | manifest.print |
| `manifest.replicate_segmented` | R3 | Native,InApp | ✓ | 2/5/20 | ✓ | manifest.replicate |
| `manifest.replicate_with_patch` | R3 | Native,InApp | ✓ | N/A | ✓ | manifest.replicate |
| `manifest.create_from_payload` | R3 | Native,InApp | ✓ | N/A | ✓ | manifest.create |
| `manifest.receive_with_receipt` | R3 | Native,InApp | ✓ | N/A | ✓ | manifest.receive |
| `cdf.download_batch_selected` | R3 | Native,InApp | ✓ | 3/10/20 | ✓ | manifest.read |

## Riscos e contingências

### 1. Overflow de snapshots com correlationId duplicado

**Mitigação**: Worker não reutiliza snapshot; snapshot expira após confirmação.

### 2. Extrapolação de batch items em args complexos

**Mitigação**: `extractBatchItemCount()` verifica múltiplas syntaxes; dispatcher faz clamping nativo.

### 3. Session lifecycle entre reauthenticação

**Mitigação**: `sessionContextId` rotacionado; snapshot antigo resultaria em mismatch detectável.

### 4. Permissões em mutação durante operação

**Status**: Não tratado nesta fase. Recomendado para observability-admin.

## Próxima fase

**Phase 06 - Frontend UX**: frontend-vue-ux-mtr

- Render batch limit feedback com `maxBatchSize`.
- Handle scope mismatch: re-preview/snapshot em nova sessão/conta.
- Preserve snapshot tokens em form state.
- Mapear `reasonCode` para mensagens acionáveis.

---

**Checkpoint finalizado**: 2026-04-25  
**Owner**: perfis-acessos-admin-mtr  
**Status**: ✅ COMPLETO - Pronto para handoff

Comando:

- `npx tsx --test tests/unit/conversation-policy-service.test.js tests/integration/conversation-multiturn-memory.test.js tests/integration/conversation-composed-operations.test.js`

Resultado:

- `20` testes executados
- `20` aprovados
- `0` falhas

Cobertura direta observada:

- bloqueio de cancelamento sem confirmacao;
- bloqueio de submit no canal whatsapp;
- bloqueio de cancelamento composto sem confirmacao;
- isolamento de historico entre sessoes diferentes.

## Finding de acesso (risco residual)

### Severidade alta - isolamento de memoria nao esta explicitamente escopado por conta na leitura de historico

Evidencia tecnica:

- `listConversationMessages` busca apenas por `conversation_session_id`.
- `loadConversationPlanningState` consome esse historico por `conversationSessionId` e o repassa ao planner.
- O `conversationSessionId` pode ser informado pelo cliente no request.

Impacto:

- O teste atual comprova isolamento entre sessoes diferentes, mas nao comprova isolamento entre contas diferentes reutilizando o mesmo `conversationSessionId`.
- Existe risco de mistura/colisao de contexto se um mesmo `conversationSessionId` for reaproveitado entre contas/sessoes de seguranca distintas.

## Status da fase

Status: **parcial com risco residual**

- Guardrails de operacao sensivel: **ok**
- Classificacao de risco e confirmacao: **ok**
- Isolamento por sessao: **ok**
- Isolamento entre contas (hard guarantee): **pendente de hardening/teste dedicado**

## Arquivos alterados nesta fase

- `docs/handoffs/conversacional-operacional-ia/08-access-control.md` (novo checkpoint)

## Handoff

next_agent_required: `tester-qa-mtr`

Prompt sugerido:

"Revalidar o work_id conversacional-operacional-ia com foco em isolamento de memoria entre contas/sessoes quando `conversationSessionId` e reutilizado, cobrindo cenarios de tentativa de colisao cross-account e confirmando ausencia de vazamento de historico. Registrar evidencias em 09-qa-validation.md e apontar necessidade de hardening caso haja risco confirmado."