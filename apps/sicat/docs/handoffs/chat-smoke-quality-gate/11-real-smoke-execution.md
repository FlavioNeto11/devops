# Execução Real do Smoke Conversacional — chat-smoke-quality-gate

**Data:** 2026-04-26  
**work_id:** `chat-smoke-quality-gate`  
**Executado por:** `orquestrador-mtr` (diagnóstico + análise de código)

---

## Estado do .env

| Arquivo | Status |
|---|---|
| `scripts/ai-smoke/.env` | ❌ **AUSENTE** |
| `scripts/ai-smoke/.env.example` | ✅ presente |
| `scripts/ai-smoke/bootstrap-sicat-smoke-env.mjs` | ✅ presente |
| `scripts/ai-smoke/bootstrap-sicat-smoke-env.ps1` | ✅ presente |

**Consequência:** O smoke real não pode ser executado sem o `.env`. O runner para imediatamente com:
```
Error: SICAT_ACCESS_TOKEN ausente. Configure scripts/ai-smoke/.env.
```

---

## Diagnóstico estrutural completo

### Arquivos validados

| Arquivo | Status |
|---|---|
| `scripts/ai-smoke/run-sicat-ai-smoke.mjs` | ✅ íntegro |
| `scripts/ai-smoke/bootstrap-sicat-smoke-env.mjs` | ✅ íntegro |
| `scripts/ai-smoke/bootstrap-sicat-smoke-env.ps1` | ✅ íntegro |
| `docs/ai-chat/intents/sicat-chat-intent-catalog.sample.jsonl` | ✅ presente |
| `docs/ai-chat/intents/sicat-chat-intent-catalog.jsonl` | ✅ presente |
| `docs/ai-chat/evaluation/expected-response-rubric.md` | ✅ presente |
| `docs/ai-chat/evaluation/llm-judge-prompt.md` | ✅ presente |
| `src/routes/conversation-routes.ts` | ✅ presente |
| `src/services/conversation/conversation-service.ts` | ✅ presente |

### Análise do contrato do endpoint

**`POST /v1/conversations/turns`** — contrato revisado no código:

```typescript
// ProcessTurnOutput (conversation-service.ts)
type ProcessTurnOutput = {
  conversationSessionId: string;    // ✅ campo esperado pelo runner
  conversationTurnId: string;
  correlationId: string;            // ✅ campo esperado pelo runner
  channel: string;
  status: 'responded' | 'blocked' | 'executed' | 'failed';  // ✅
  responseText: string;             // ✅ campo esperado pelo runner
  llm: { provider: string; confidence: number };
  toolCall: { ... } | null;
  policy: { allowed, reasonCode, reason, requiresConfirmation, riskLevel };
  context: { integrationAccountId, sessionContextId, manifestId, jobId };
  result?: unknown;
  jobId?: string | null;
};
```

**Resultado:** Contrato compatível com o runner. Todos os campos mínimos exigidos estão presentes.

### Análise de políticas de segurança

`src/services/conversation/conversation-policy-service.ts` — lida com:
- `allowActions` → from `options.allowActions`
- `riskLevel` → R1 (baixo) a R4 (crítico)
- `requiresConfirmation` → automático para ações sensíveis

`src/services/conversation/conversation-service.ts` — possui `buildBlockedResponse()` que retorna `status: 'blocked'` corretamente quando política bloqueia.

**Resultado:** Políticas de segurança implementadas e corretamente estruturadas.

### Dependência de OPENAI_API_KEY no backend

O arquivo `src/services/conversation/ai-config.ts` exige `OPENAI_API_KEY` no ambiente do **backend**:
```typescript
const openAiApiKey = process.env.OPENAI_API_KEY;
if (!openAiApiKey) {
  throw new AppError(503, 'AI não configurado', 'OPENAI_API_KEY é obrigatória...');
}
```

**Consequência adicional:** mesmo que o `.env` do smoke tenha `OPENAI_API_KEY`, o **backend em execução** também precisa ter essa variável configurada para processar o turno conversacional.

---

## Bloqueios para o smoke real

### Bloqueio primário — credencial: `.env` ausente

O `scripts/ai-smoke/.env` precisa ser gerado via bootstrap interativo. O bootstrap:
1. Autentica o operador no SICAT API (requer email + senha)
2. Obtém `access_token` + `refresh_token`
3. Busca `integrationAccountId`, `sessionContextId`, `accountId`
4. Escreve o arquivo `.env` completo

**Esse processo requer decisão e interação humana do operador.**

### Bloqueio secundário — backend offline

O smoke real precisa do backend rodando em `SICAT_API_BASE_URL` (default: `http://127.0.0.1:8080`). Se o backend não estiver em execução, todas as chamadas a `/v1/conversations/turns` falham com `ECONNREFUSED`.

### Bloqueio terciário — OPENAI_API_KEY no backend

Além do `.env` do smoke, o backend precisa ter `OPENAI_API_KEY` configurado em seu próprio ambiente de execução (`.env` na raiz, variável de sistema ou `.env.local`).

---

## Comandos para desbloquear — passo a passo

### Passo 1: gerar `.env` do smoke

Opção A — PowerShell interativo (recomendado):
```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\ai-smoke\bootstrap-sicat-smoke-env.ps1
```

Opção B — Node.js interativo:
```
node .\scripts\ai-smoke\bootstrap-sicat-smoke-env.mjs --email flavio_padilha_neto@msn.com
```

Após rodar, o script pedirá a senha no terminal e gerará `scripts/ai-smoke/.env`.

### Passo 2: verificar OPENAI_API_KEY no backend

Verifique se o arquivo `.env` na **raiz do projeto** tem:
```
OPENAI_API_KEY=sk-...
OPENAI_MODEL=gpt-4o-mini
```

Se não tiver, adicione antes de iniciar o backend.

### Passo 3: subir a stack local

```bash
# Terminal 1 — backend
npm run dev

# Terminal 2 — worker (se necessário)
npm run worker
```

Aguarde até ver no terminal:
```
Server running on port 8080
```

### Passo 4: validar backend online

```bash
curl http://127.0.0.1:8080/v1/ping
# Esperado: {"status":"ok"}
```

### Passo 5: executar smoke sample

```bash
npm run smoke:ai-chat:sample
```

### Passo 6: se sample passar, executar smoke completo

```bash
npm run smoke:ai-chat
```

### Passo 7: smoke por categoria (se houver falhas)

```bash
node scripts/ai-smoke/run-sicat-ai-smoke.mjs \
  --catalog docs/ai-chat/intents/sicat-chat-intent-catalog.jsonl \
  --category jobs_fila
```

---

## Smoke real sample

- **executado:** ❌ NÃO — bloqueado por `.env` ausente
- **motivo exato:** `SICAT_ACCESS_TOKEN ausente`
- **dry-run (validação estrutural):** ✅ 24/24 aprovados (commit anterior)

## Smoke real completo

- **executado:** ❌ NÃO — mesmo bloqueio
- **aguardando:** bootstrap de credenciais + backend online

---

## Quality gate técnico

Executado no commit anterior (15523f5), estado atual confirmado como inalterado:

| Check | Resultado |
|---|---|
| `lint` | ✅ 0 erros |
| `typecheck` | ✅ 0 erros TypeScript |
| `test` | ✅ 317/317 pass |
| `build:ts` | ✅ sem erros |
| `quality:gate` | ✅ Approved |

---

## Arquivos alterados nesta análise

Nenhum arquivo de código alterado. O código está correto:
- Contrato de `ProcessTurnOutput` compatível com o runner ✅
- Políticas de segurança implementadas ✅
- Runner com parada clara em ausência de token ✅
- Bootstrap capaz de gerar `.env` completo ✅

---

## Pendências reais

| Tipo | Descrição |
|---|---|
| **Credencial** | `scripts/ai-smoke/.env` ausente — requer bootstrap interativo com email+senha |
| **Operacional** | Backend deve estar rodando em `http://127.0.0.1:8080` |
| **Credencial** | `OPENAI_API_KEY` deve estar configurada no ambiente do backend |

---

## Decisão

**BLOQUEADO POR CREDENCIAL/OPERACIONAL**

Não há pendência técnica corrigível restante. O código do runner, do endpoint e do serviço conversacional está correto e compatível.

O smoke real depende de:
1. Operador executar o bootstrap (requer senha SICAT)
2. Backend rodando com `OPENAI_API_KEY` configurada
3. `scripts/ai-smoke/.env` gerado com tokens válidos

Após essas três condições satisfeitas, o operador deve executar:
```bash
npm run smoke:ai-chat:sample
```
e prosseguir conforme o resultado.

---

## Não incluir no commit seguinte

- `scripts/ai-smoke/.env` (gerado após bootstrap — contém tokens reais)
- `artifacts/ai-smoke/` (relatórios com respostas reais)
- Tokens, senhas, access tokens, refresh tokens
