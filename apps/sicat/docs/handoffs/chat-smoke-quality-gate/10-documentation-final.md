# Documentation Final — chat-smoke-quality-gate

**Data:** 2026-04-26  
**Agente:** `documentador-mtr`  
**work_id:** `chat-smoke-quality-gate`

---

## Decisão final

> **APROVADO PARA COMMIT** *(pendência operacional: smoke real aguarda credenciais)*

Quality gate passou integralmente. O bloqueio de smoke real é **operacional** (não técnico): requer `.env` com tokens CETESB + `OPENAI_API_KEY` + backend em execução. Não bloqueia merge.

**Atualização 2026-04-26 — tentativa de execução real:** código revisado em profundidade (`conversation-service.ts`, `ai-config.ts`, `conversation-policy-service.ts`, runner). Nenhuma falha técnica encontrada. Bloqueio confirmado como exclusivamente operacional. Ver `11-real-smoke-execution.md`.

---

## Resumo executivo

A demanda `chat-smoke-quality-gate` entregou a estabilização completa da infraestrutura de smoke conversacional do Chat SICAT:

- **Runner** `scripts/ai-smoke/run-sicat-ai-smoke.mjs` revisado e validado estruturalmente.
- **Catálogo** `docs/ai-chat/intents/sicat-chat-intent-catalog.sample.jsonl` com 24 cenários bem formados.
- **Endpoint** `POST /v1/conversations/turns` com contrato de entrada e saída validado, sem alterações necessárias.
- **Dry-run** 24/24 aprovado: parsing, construção de payload e geração de relatórios funcionando corretamente.
- **Quality gate** aprovado: lint, typecheck, 317 testes, build e todas as validações auxiliares passaram sem erros.
- **Smoke real** aguarda bootstrap de credenciais pelo operador — bloqueio operacional, sem impacto técnico.

---

## Status geral

| Dimensão | Status | Detalhe |
|---|---|---|
| **Quality gate** | ✅ Aprovado | Todos os checks passaram |
| **Smoke dry-run** | ✅ Aprovado | 24/24 cenários |
| **Smoke real (sample)** | ⛔ Bloqueio operacional | `.env` ausente + backend offline + `OPENAI_API_KEY` no backend |
| **Smoke real (completo)** | ⛔ Bloqueio operacional | Idem — aguarda bootstrap de credenciais |
| **Contrato de API** | ✅ Validado | Sem mudanças necessárias |
| **TypeScript** | ✅ Zero erros | `npm run typecheck` limpo |
| **Build** | ✅ Limpo | `npm run build:ts` sem erros |

---

## Quality gate — detalhamento

Resultado: **`Approved. All mandatory checks passed.`**

| Check | Resultado |
|---|---|
| `validate:agents` | ✅ passou |
| `validate:har-gateway` | ✅ passou (5 operações HAR, 6 seções gateway) |
| `validate:md-links` | ✅ passou (731 arquivos, 0 links quebrados) |
| `validate:openapi` | ✅ passou |
| `check:secrets` | ✅ passou (0 segredos detectados) |
| `lint` | ✅ passou (0 erros) |
| `typecheck` | ✅ passou (0 erros TypeScript) |
| `test` | ✅ passou — **317 testes, 0 falhas** |
| `test:contract` | ✅ passou — 4 testes, 0 falhas |

---

## Smoke — estado atual e instrução ao operador

### Dry-run (sem credenciais)

```
npm run smoke:ai-chat:dry-run
```

**Resultado:** 24/24 aprovados — nenhuma API real chamada.

### Smoke real — instrução de bootstrap

O operador deve executar **uma** das opções abaixo para gerar `scripts/ai-smoke/.env`:

```powershell
# Opção 1 — PowerShell interativo
powershell -ExecutionPolicy Bypass -File .\scripts\ai-smoke\bootstrap-sicat-smoke-env.ps1

# Opção 2 — Node.js com e-mail pré-configurado
node .\scripts\ai-smoke\bootstrap-sicat-smoke-env.mjs --email <email-cetesb>
```

Após o bootstrap bem-sucedido, com a stack local em execução (`npm run dev` + `npm run worker`):

```bash
# Etapa 1 — sample (24 cenários)
npm run smoke:ai-chat:sample

# Etapa 2 — catálogo completo (se sample passar)
npm run smoke:ai-chat
```

Relatórios serão gerados em `artifacts/ai-smoke/` (diretório gitignored).

> **`scripts/ai-smoke/.env` jamais deve ser versionado.** Está em `.gitignore`.

---

## Arquivos alterados nesta entrega

| Arquivo | Tipo de mudança |
|---|---|
| `scripts/ai-smoke/run-sicat-ai-smoke.mjs` | Revisado e validado (runner principal) |
| `scripts/ai-smoke/bootstrap-sicat-smoke-env.mjs` | Estabilizado |
| `scripts/ai-smoke/bootstrap-sicat-smoke-env.ps1` | Estabilizado |
| `scripts/ai-smoke/.env.example` | Referência de variáveis |
| `scripts/ai-smoke/README.md` | Documentação do runner |
| `scripts/ai-smoke/README-BOOTSTRAP-ENV.md` | Documentação de bootstrap |
| `docs/ai-chat/intents/sicat-chat-intent-catalog.sample.jsonl` | 24 cenários validados |
| `docs/ai-chat/intents/sicat-chat-intent-catalog.jsonl` | Catálogo completo (presente) |
| `docs/ai-chat/evaluation/expected-response-rubric.md` | Rubrica de avaliação |
| `docs/ai-chat/evaluation/llm-judge-prompt.md` | Prompt de judge LLM |
| `docs/handoffs/chat-smoke-quality-gate/00-orchestration.md` | Checkpoint orquestração |
| `docs/handoffs/chat-smoke-quality-gate/09-qa-validation.md` | Checkpoint QA |
| `docs/handoffs/chat-smoke-quality-gate/10-documentation-final.md` | Este arquivo |

---

## Endpoints e contratos relevantes

| Endpoint | Método | Status |
|---|---|---|
| `/v1/conversations/turns` | `POST` | ✅ Validado — sem mudanças |

**Contrato de entrada validado** (`ProcessTurnInput`):
- `channel`, `conversationSessionId`, `message.text`
- `context.integrationAccountId`, `sessionContextId`, `accountId`, `requestedBy`, `userId`, `currentScreen`, `channelSessionKey`
- `metadata.source`, `scenarioId`, `category`, `intentType`, `executionPolicy`, `safeSmoke`
- `options.allowActions`, `options.dryRunSensitiveActions`

**Contrato de saída validado** (`ProcessTurnOutput`):
- `responseText`, `status`, `conversationSessionId`, `correlationId`

---

## Decisões registradas nesta entrega

| ID | Decisão |
|---|---|
| D-001 | `scripts/ai-smoke/.env` nunca será versionado — bootstrap manual pelo operador |
| D-002 | Smoke real é pré-condição operacional, não técnica — não bloqueia commit |
| D-003 | Dry-run como gate automatizável em CI (sem credenciais) |
| D-004 | `SICAT_AI_SMOKE_ALLOW_MUTATIONS=false` e `SICAT_AI_SMOKE_FORCE_SAFE_PROMPT_PREFIX=true` como padrão no `.env.example` |

---

## Comandos executados nesta entrega

```bash
npm run smoke:ai-chat:dry-run        # 24/24 aprovados
npm run quality:gate                 # Approved. All mandatory checks passed.
npm run typecheck                    # zero erros
npm run build:ts                     # zero erros
npm test                             # 317 pass, 0 fail
```

---

## Itens que NÃO devem ser commitados

- `scripts/ai-smoke/.env` — tokens de acesso SICAT e chaves OpenAI
- `artifacts/ai-smoke/` — relatórios com dados de execução real
- Qualquer arquivo com senhas, JWTs, certificados ou credenciais CETESB
- `storage/temp/` — dados temporários de testes

---

## Riscos residuais

| Risco | Severidade | Mitigação |
|---|---|---|
| Smoke real ainda não executado | Baixo | Bootstrap documentado; dry-run passa |
| Token CETESB pode estar expirado ao executar bootstrap | Baixo | Operador refaz login antes do bootstrap |
| Catálogo completo pode ter cenários que exijam ajuste de rubrica | Baixo | Executar sample antes; revisar rubrica se necessário |

---

## Commit recomendado

```
chore: estabiliza smoke conversacional do chat sicat
```

**Escopo:** scripts de smoke AI, catálogo de intents, rubricas de avaliação, checkpoints de handoff.

**Não incluir no commit:** `scripts/ai-smoke/.env`, `artifacts/ai-smoke/`, quaisquer credenciais.

---

## Próximos passos reais

1. **Operador**: executar bootstrap (`bootstrap-sicat-smoke-env.ps1` ou `.mjs`) com credenciais válidas.
2. **Operador**: subir stack local (`npm run dev` + `npm run worker`).
3. **Operador**: executar `npm run smoke:ai-chat:sample` — análise dos resultados.
4. **Operador**: se sample passar, executar `npm run smoke:ai-chat` — catálogo completo.
5. **CI/CD**: após commit aprovado, `ci-cd-github-mtr` executa pré-merge e push.
