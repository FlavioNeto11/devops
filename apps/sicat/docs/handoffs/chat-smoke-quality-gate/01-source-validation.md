# 01-source-validation — chat-smoke-quality-gate

## Objetivo da fase
Executar o escopo de localhost-availability solicitado para este `work_id`:
1. validar ambiente local (Etapa 1) com existencia e consistencia de `.env` e `scripts/ai-smoke/.env`;
2. validar backend online e saude basica (Etapas 2 e 3);
3. iniciar Etapa 6 com smoke sample fail-fast (`npm run smoke:ai-chat:sample`).

## Arquivos analisados
- `.env`
- `scripts/ai-smoke/.env`
- `src/services/conversation/ai-config.ts`
- `package.json`

## Validacoes

### Etapa 1 — Ambiente local (.env)
Status: PASS

Evidencias (sem segredos):
- `Test-Path .env` -> `True`
- `Test-Path scripts/ai-smoke/.env` -> `True`
- checagem de chaves/valores esperados:
  - raiz: `root_missing=none`, `root_mismatch=none`
  - smoke: `smoke_missing=none`, `smoke_mismatch=none`

Chaves obrigatorias confirmadas:
- `.env` raiz:
  - `OPENAI_API_KEY` presente e nao vazio
  - `OPENAI_AGENT_MODEL=gpt-5.1`
  - `OPENAI_SYNTHESIS_MODEL=gpt-5.1`
  - `OPENAI_MODEL=gpt-5.1`
  - `AI_ENABLED=true`
- `scripts/ai-smoke/.env`:
  - `SICAT_API_BASE_URL`, `SICAT_ACCESS_TOKEN`, `SICAT_INTEGRATION_ACCOUNT_ID`, `SICAT_SESSION_CONTEXT_ID`, `SICAT_ACCOUNT_ID`, `SICAT_USER_ID`, `SICAT_REQUESTED_BY`, `OPENAI_API_KEY` presentes e nao vazios
  - `OPENAI_AGENT_MODEL=gpt-5.1`
  - `OPENAI_SYNTHESIS_MODEL=gpt-5.1`
  - `OPENAI_JUDGE_MODEL=gpt-4o-mini`
  - `OPENAI_MODEL=gpt-5.1`
  - `SICAT_AI_SMOKE_ALLOW_MUTATIONS=false`
  - `SICAT_AI_SMOKE_FORCE_SAFE_PROMPT_PREFIX=true`

### Etapa 2 — Backend online (localhost)
Status: PASS

Evidencias:
- `curl http://127.0.0.1:8080/v1/ping` -> HTTP `200`
- `curl http://127.0.0.1:8080/v1/health/system` -> HTTP `200`

### Etapa 3 — Modelos backend carregados
Status: PASS

Evidencias objetivas utilizadas:
- consistencia de modelos em `.env` confirmada (`root_mismatch=none`), com os tres campos em `gpt-5.1`.
- codigo de leitura de modelo (`src/services/conversation/ai-config.ts`) usa `OPENAI_AGENT_MODEL` e `OPENAI_SYNTHESIS_MODEL`, com fallback de compatibilidade para `OPENAI_MODEL`.
- backend online e operando chamadas de chat durante o smoke.

Observacao de operacao:
- se `.env` for alterado apos o backend estar no ar, e necessario reiniciar API (e worker se aplicavel) para recarregar modelos.

### Etapa 6 (inicio) — Smoke sample fail-fast
Status: FAIL

Comando executado:
- `npm run smoke:ai-chat:sample`

Resultado resumido:
- `Resultado: 9/17 aprovados`
- `Early stop: MAX_CONSECUTIVE_FAILURES_REACHED`
- saida final: `Command exited with code 1`
- relatorios gerados:
  - `artifacts/ai-smoke/sicat-ai-smoke-2026-04-26T21-14-53-397Z.json`
  - `artifacts/ai-smoke/sicat-ai-smoke-2026-04-26T21-14-53-397Z.md`

## Bloqueios
- Bloqueio tecnico de qualidade do smoke (nao operacional/credencial): falha no gate por taxa de falha/consecutivas no sample.

## Handoff para proxima fase
`next_agent_required`: `programador-backend-mtr`

Resumo de causa raiz para o proximo owner:
- ambiente local e backend estavam aptos (env + health OK);
- falha ocorreu no conteudo/comportamento do chat no sample (`9/17` com early stop por 3 falhas consecutivas), indicando necessidade de ajuste tecnico no backend/fluxo de resposta do agente e/ou heuristicas de avaliacao para os cenarios reprovados.
