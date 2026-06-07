## Handoff para Phase 06 - Frontend UX (frontend-vue-ux-mtr)

work_id: conversacional-operacional-ia

## Contexto Pronto

Fase 08 (access-control) concluída com hardening de guardrails:
- ✅ Batch limits por canal (WA: 3, NC: 10, IA: 20)
- ✅ Cross-account scope protection (`CROSS_ACCOUNT_VIOLATION`)
- ✅ Session scope validation (`SESSION_SCOPE_MISMATCH`)
- ✅ Policy decisions enriquecidas com `maxBatchSize` e `enforcedScope`
- ✅ 30 testes passando (15 novo + 15 regressão)
- ✅ Typecheck zero erros

## Artefatos de Entrada

### 1. Backend Policy Decisions

`ConversationPolicyDecision` with new fields:

```typescript
{
  allowed: boolean;
  reasonCode: string | null;  ('BATCH_LIMIT_EXCEEDED' | 'CROSS_ACCOUNT_VIOLATION' | 'SESSION_SCOPE_MISMATCH' | ...)
  reason: string;             // mensagem técnica
  requiresConfirmation: boolean;
  riskLevel: 'R1' | 'R2' | 'R3' | 'R4';
  isAction: boolean;
  maxBatchSize?: number | null;
  enforcedScope?: 'account' | 'session' | 'profile' | null;
}
```

### 2. Exemplos de Resposta

**Batch Limit Exceeded**:
```json
{
  "allowed": false,
  "reasonCode": "BATCH_LIMIT_EXCEEDED",
  "reason": "Lote bloqueado por segurança. Limite para canal 'native_chat': 10 manifestos. Você informou 15 itens. Reduza e confirme novamente.",
  "riskLevel": "R4",
  "maxBatchSize": 10,
  "requiresConfirmation": true
}
```

**Cross-Account Violation**:
```json
{
  "allowed": false,
  "reasonCode": "CROSS_ACCOUNT_VIOLATION",
  "reason": "Snapshot pertence a outra conta operacional. Gere novo preview no contexto atual e confirme.",
  "enforcedScope": "account"
}
```

**Session Mismatch**:
```json
{
  "allowed": false,
  "reasonCode": "SESSION_SCOPE_MISMATCH",
  "reason": "Snapshot foi gerado em sessão diferente. Gere novo preview na sessão atual.",
  "enforcedScope": "session"
}
```

## Objetivo do Handoff

Fase 06 deve consumir as nuevas decisiones de policy e renderizar UX amigável para operador reduzir batch, re-gerar preview, ou reautenticar.

## Entregáveis Esperados para Phase 06

### 1. Batch Limit Feedback Component

**Entrada**: `decision.reasonCode === 'BATCH_LIMIT_EXCEEDED'`

**Saída**:
- Popup/toast com "Limite: X itens. Selecionou: Y. Reduza seleção."
- Desabilitar botão de confirmação até redução
- Mostrar `decision.maxBatchSize` como dica

**Exemplo de UX**:
```
┌─────────────────────────────────┐
│ Limite de Lote Excedido         │
├─────────────────────────────────┤
│ WhatsApp permite até 3 itens    │
│ Você selecionou 5 manifestos    │
│                                 │
│ [Reduza seleção e tente novos]  │
│ [Cancelar]                      │
└─────────────────────────────────┘
```

### 2. Cross-Account Re-Preview Popup

**Entrada**: `decision.reasonCode === 'CROSS_ACCOUNT_VIOLATION'`

**Saída**:
- Render popup: "Snapshot foi gerado na conta X. Está em Y. Gerar novo preview?"
- Botões: [Gerar Preview] [Cancelar]
- Ao confirmar: reenviar POST /v1/conversations/turns com novo snapshot

**Fluxo**:
```
1. User seleciona items → backend returns CROSS_ACCOUNT_VIOLATION
2. Toast: "Mude de conta ou gere novo preview"
3. User clica [Re-preview] → novo snapshot token
4. Novo preview → nova confirmação
```

### 3. Session Mismatch Reauthentication Hint

**Entrada**: `decision.reasonCode === 'SESSION_SCOPE_MISMATCH'`

**Saída**:
- Alert: "Sua sessão CETESB foi renovada. Reautentique e gere novo preview."
- Botões: [Reautenticar] [Cancelar]
- Desabilitar confirmação até new session

**Fluxo**:
```
1. User confirma com snapshot antigo → SESSION_SCOPE_MISMATCH
2. Alert: "Sessão expirou. Reautentique?"
3. User clica [Reautenticar] → redirect login
4. Após login: nova sessionContextId gerado
5. User regenera preview com novo snapshot
```

### 4. Preserve Snapshot Tokens in Form State

Ao gerar preview, armazenar no Vue state:

```typescript
conversationState = {
  lastSnapshot: {
    token: "base64url_encoded_snapshot",
    accountId: "acc_001",
    sessionContextId: "scx_001",
    intent: "manifest.batch_cancel_selected",
    generatedAt: "2026-04-25T10:00:00Z",
    itemCount: 3
  }
}
```

Ao confirmar, passar ao backend:

```typescript
POST /v1/conversations/turns {
  toolRequest: {
    name: "orchestrate_manifest_operation",
    arguments: {
      intent: "manifest.batch_cancel_selected",
      manifestIds: [list],
      selectionSnapshot: state.lastSnapshot.token,  // ← pass snapshot
      snapshotAccountId: state.lastSnapshot.accountId,
      snapshotSessionContextId: state.lastSnapshot.sessionContextId,
      confirmed: true
    }
  }
}
```

### 5. Audit UX Actions

Log cada seleção/deselection para correlação:

```typescript
auditTrail = [
  { action: 'select_item', manifestId: 'man_1', timestamp, correlationId },
  { action: 'deselect_item', manifestId: 'man_2', timestamp, correlationId },
  { action: 'generate_preview', itemCount: 3, timestamp, correlationId },
  { action: 'confirm_action', snapshot: token, timestamp, correlationId }
]
```

### 6. Error Message Mapping

Frontend deve mapear `reasonCode` e `enforcedScope` para mensagens UX:

```typescript
const policyErrorMessages = {
  'BATCH_LIMIT_EXCEEDED': (decision) => 
    `Limite para ${decision.channel || 'este canal'}: ${decision.maxBatchSize} itens. ` +
    `Reduza seleção e confirme novamente.`,
  
  'CROSS_ACCOUNT_VIOLATION': (decision) => 
    `Snapshot pertence a outra conta. ` +
    `Gere novo preview na conta ativa.`,
  
  'SESSION_SCOPE_MISMATCH': (decision) => 
    `Sua sessão foi renovada. ` +
    `Reautentique e gere novo preview.`,
  
  'CHANNEL_BLOCKED': (decision) => 
    `${decision.reason}`,
  
  'PERMISSION_DENIED': (decision) => 
    `Você não possui permissão para esta operação.`,
  
  'CONFIRMATION_REQUIRED': (decision) => 
    `Esta ação sensível requer confirmação explícita.`
}
```

## Checklist para Phase 06

- [ ] Component para batch limit feedback com maxBatchSize
- [ ] Modal para cross-account re-preview
- [ ] Alert para session mismatch + reauthentication
- [ ] Form state preserva snapshot tokens (accountId, sessionId, intent)
- [ ] Audit trail di UX selections/deselections
- [ ] Error message mapping backend → UX
- [ ] Tests focais de UX para cada cenário de policy rejection
- [ ] No breaking changes em POST /v1/conversations/turns
- [ ] Backward compatibility com operações que tidak perlu snapshot

## Ficheiros Recomendados para Leitura

1. [docs/handoffs/conversacional-operacional-ia/08-access-control.md](08-access-control.md) - Arquitetura completa de phase 08
2. [src/services/conversation/conversation-policy-service.ts](../../../src/services/conversation/conversation-policy-service.ts) - Policy decisões
3. [tests/unit/conversation-policy-access-control.test.js](../../../tests/unit/conversation-policy-access-control.test.js) - Cenários de teste 08

## Restrições

- Não editar backend
- Não quebrar contratos HTTP
- Não remover snapshots que fase 04 persiste
- Preservar correlationId/jobId em audit trail

## Próximas fases após 06

- **Phase 07**: observability-admin instrumenta metricas de policy violations
- **Phase 09**: qa-validation testa end-to-end com cenários de batch/account/session
- **Phase 10**: documentação final consolida runbook operacional

---

**Pronto para iniciar Phase 06**. next_agent_required: frontend-vue-ux-mtr
