# Orquestração — chat-smoke-quality-gate

**Data:** 2026-04-26  
**work_id:** `chat-smoke-quality-gate`  
**Orquestrador:** `orquestrador-mtr`

---

## Demanda original resumida

Corrigir todas as pendências relacionadas ao Chat SICAT, estrutura de agentes, smoke test conversacional com IA real e quality gate do projeto, até que a aplicação fique estável, testável e sem falhas corrigíveis pendentes.

---

## Diagnóstico inicial (orquestrador)

### Estrutura de arquivos

| Arquivo | Status |
|---|---|
| `.github/copilot/agents/sicat-chat-orchestrator.agent.md` | ✅ existe |
| `.github/copilot/agents/sicat-chat-qa-smoke.agent.md` | ✅ existe |
| `.github/copilot/agents/sicat-domain-analyst.agent.md` | ✅ existe |
| `.github/copilot/instructions/sicat-chat-quality.instructions.md` | ✅ existe |
| `docs/ai-chat/intents/sicat-chat-intent-catalog.jsonl` | ✅ existe |
| `docs/ai-chat/intents/sicat-chat-intent-catalog.sample.jsonl` | ✅ existe |
| `docs/ai-chat/intents/sicat-chat-intent-catalog.md` | ✅ existe |
| `docs/ai-chat/evaluation/expected-response-rubric.md` | ✅ existe |
| `docs/ai-chat/evaluation/llm-judge-prompt.md` | ✅ existe |
| `scripts/ai-smoke/run-sicat-ai-smoke.mjs` | ✅ existe |
| `scripts/ai-smoke/setup-package-scripts.mjs` | ✅ existe |
| `scripts/ai-smoke/bootstrap-sicat-smoke-env.mjs` | ✅ existe |
| `scripts/ai-smoke/bootstrap-sicat-smoke-env.ps1` | ✅ existe |
| `scripts/ai-smoke/.env.example` | ✅ existe |
| `scripts/ai-smoke/.env` | ❌ ausente (esperado — **nunca versionado**) |
| `scripts/ai-smoke/README.md` | ✅ existe |
| `scripts/ai-smoke/README-BOOTSTRAP-ENV.md` | ✅ existe |
| `src/routes/conversation-routes.ts` → `POST /v1/conversations/turns` | ✅ existe |
| `package.json` scripts `smoke:ai-chat*` | ✅ todos os 4 presentes |

### Conclusão estrutural

Estrutura completa. Único ausente esperado: `scripts/ai-smoke/.env` (nunca versionado, requer bootstrap por operador).

### package.json — scripts de smoke

```json
"smoke:ai-chat": "node scripts/ai-smoke/run-sicat-ai-smoke.mjs --catalog docs/ai-chat/intents/sicat-chat-intent-catalog.jsonl",
"smoke:ai-chat:sample": "node scripts/ai-smoke/run-sicat-ai-smoke.mjs --catalog docs/ai-chat/intents/sicat-chat-intent-catalog.sample.jsonl",
"smoke:ai-chat:category": "node scripts/ai-smoke/run-sicat-ai-smoke.mjs --catalog docs/ai-chat/intents/sicat-chat-intent-catalog.jsonl --category",
"smoke:ai-chat:dry-run": "node scripts/ai-smoke/run-sicat-ai-smoke.mjs --catalog docs/ai-chat/intents/sicat-chat-intent-catalog.sample.jsonl --dry-run"
```

Todos presentes e corretos. `smoke:ai-chat:category` aceita argumento via `-- <categoria>`.

---

## Classificação da demanda

```yaml
orchestration:
  work_id: "chat-smoke-quality-gate"
  intent: "validate + fix + ci"
  complexity: "complex"
  domains:
    - "backend-contract"
    - "qa"
    - "ci"
  first_agent: "tester-qa-mtr"
  phase_sequence:
    - phase: "09-qa-validation"
      agent: tester-qa-mtr
      required: true
      reason: >
        Executar smoke:ai-chat:sample e smoke:ai-chat, identificar falhas,
        corrigir runner/endpoint/chat/rubricas, quality gate (lint, typecheck, test, build).
    - phase: "03-backend-contracts"
      agent: programador-backend-mtr
      required: conditional
      reason: >
        Acionar somente se tester-qa-mtr identificar falha no contrato
        POST /v1/conversations/turns (payload, resposta, roteamento).
    - phase: "10-documentation-final"
      agent: documentador-mtr
      required: true
      reason: Relatório final, decisão aprovado/bloqueado.
    - phase: "ci-commit"
      agent: ci-cd-github-mtr
      required: conditional
      reason: >
        Acionar somente se documentador-mtr decidir "aprovado para commit".
        Mensagem convencional: "chore: estabiliza smoke conversacional do chat sicat".
        Não commitar: scripts/ai-smoke/.env, tokens, senhas, artifacts sensíveis.
```

---

## Critérios de pronto

- [ ] `npm run smoke:ai-chat:sample` passa sem bloqueio corrigível
- [ ] `npm run smoke:ai-chat` executa com taxa > 70% (ou bloqueios identificados como externos/credencial)
- [ ] `npm run lint` sem erros
- [ ] `npm run typecheck` zero erros
- [ ] `npm test` verde
- [ ] `npm run build:ts` sem erros
- [ ] Relatório final entregue pelo `documentador-mtr`
- [ ] Decisão final: aprovado para commit ou bloqueado com justificativa

---

## Checkpoints esperados

- `docs/handoffs/chat-smoke-quality-gate/09-qa-validation.md` — criado por `tester-qa-mtr`
- `docs/handoffs/chat-smoke-quality-gate/03-backend-contracts.md` — criado por `programador-backend-mtr` se acionado
- `docs/handoffs/chat-smoke-quality-gate/10-documentation-final.md` — criado por `documentador-mtr`

---

## Regras de segurança para toda a cadeia

- `SICAT_AI_SMOKE_ALLOW_MUTATIONS=false` obrigatório durante todos os testes
- Não commitar `.env`, tokens, senhas
- Não usar `--no-verify`
- Não mascarar falhas de teste
- Não remover cenários difíceis sem justificativa documentada
- Ações sensíveis: sempre prévia + confirmação explícita, nunca execução direta

---

## Contexto técnico para o próximo agente (tester-qa-mtr)

### Endpoint conversacional
- `POST /v1/conversations/turns` em `src/routes/conversation-routes.ts` (linha 82)
- Delegado para `conversationService.processTurn()` em `src/services/conversation/conversation-service.ts`

### Runner de smoke
- `scripts/ai-smoke/run-sicat-ai-smoke.mjs` — carrega `.env` de `scripts/ai-smoke/.env`, executa cenários do catálogo JSONL, chama o endpoint, usa OpenAI como juiz LLM
- `.env` ausente interrompe o smoke com erro claro sobre `SICAT_ACCESS_TOKEN`

### Pré-requisito de execução
O smoke requer que `scripts/ai-smoke/.env` exista com variáveis válidas. Se ausente, orientar:
```
powershell -ExecutionPolicy Bypass -File .\scripts\ai-smoke\bootstrap-sicat-smoke-env.ps1
```
ou:
```
node .\scripts\ai-smoke\bootstrap-sicat-smoke-env.mjs --email operador@example.com
```

### Scripts disponíveis no package.json
```bash
npm run smoke:ai-chat:sample        # smoke no catálogo sample
npm run smoke:ai-chat               # smoke no catálogo completo
npm run smoke:ai-chat:category -- <categoria>   # smoke por categoria
npm run smoke:ai-chat:dry-run       # dry-run seguro sem chamar APIs
```

---

## Atualização 2026-04-26 — Remoção obrigatória de heurísticas no Chat

### Demanda incremental

Eliminar respostas heurísticas/estáticas/rule-based no fluxo conversacional do SICAT. Resposta final deve vir do agente/LLM real ou falhar explicitamente com indisponibilidade de provider.

### Evidência encontrada pelo orquestrador

- `src/services/conversation/conversation-service.ts` contém fallback com `provider: "rule-based"` e `status: "responded"`.
- `scripts/ai-smoke/run-sicat-ai-smoke.mjs` ainda permite juiz heurístico quando `OPENAI_API_KEY` ausente.

### Reclassificação desta fase

```yaml
orchestration:
  work_id: "chat-smoke-quality-gate"
  intent: "fix + validate"
  complexity: "complex"
  domains:
    - "backend-contract"
    - "domain-rules"
    - "qa"
    - "docs"
  first_agent: "programador-backend-mtr"
  phase_sequence:
    - phase: "03-backend-contracts"
      agent: programador-backend-mtr
      required: true
      reason: >
        Remover fallback heurístico/rule-based no conversation-service e endurecer
        runner de smoke para reprovar resposta não-LLM real.
    - phase: "09-qa-validation"
      agent: tester-qa-mtr
      required: true
      reason: >
        Rodar lint/typecheck/test/test:contract/build/quality:gate e smoke real sample+full.
    - phase: "10-documentation-final"
      agent: documentador-mtr
      required: true
      reason: Relatório final obrigatório com decisão.

---

## Atualização 2026-04-26 — Validação integral do catálogo de intenções JSONL + smoke sample/category/full

### Demanda incremental

Validar integralmente os arquivos `docs/ai-chat/intents/sicat-chat-intent-catalog.jsonl`
e `docs/ai-chat/intents/sicat-chat-intent-catalog.sample.jsonl`, incluindo integridade
estrutural, cobertura por categoria, compatibilidade com o runner de smoke,
anti-heurística, ambiente local, smoke real sample, smoke por categoria,
smoke completo fail-fast/full, correções por causa raiz e documentação final.

### Reclassificação obrigatória

```yaml
orchestration:
  work_id: "chat-smoke-quality-gate"
  intent: "validate"
  complexity: "complex"
  domains:
    - "backend-contract"
    - "domain-rules"
    - "qa"
    - "docs"
  first_agent: "programador-backend-mtr"
  phase_sequence:
    - phase: "03-backend-contracts"
      agent: programador-backend-mtr
      required: true
      reason: >
        Validar os dois JSONL, criar o validador estrutural se ausente,
        endurecer anti-heurística, confirmar compatibilidade com o runner,
        corrigir causa raiz no Chat SICAT antes do smoke real e executar as
        validações técnicas pré-smoke.
    - phase: "localhost-availability"
      agent: estrutura-vscode-mtr
      required: true
      reason: >
        Validar presença das variáveis obrigatórias em `.env` e
        `scripts/ai-smoke/.env` sem expor segredos, confirmar backend/worker
        online em localhost e interromper a cadeia se houver bloqueio de
        credencial ou indisponibilidade operacional.
    - phase: "09-qa-validation"
      agent: tester-qa-mtr
      required: true
      reason: >
        Executar `smoke:ai-chat:sample` fail-fast, `sample:full`, validação por
        categoria, `smoke:ai-chat` fail-fast, `smoke:ai-chat:full`, abrir os
        artefatos gerados, classificar as falhas por reasonCode e retornar para
        correção sempre que necessário até estabilizar.
    - phase: "10-documentation-final"
      agent: documentador-mtr
      required: true
      reason: >
        Consolidar o relatório final obrigatório em
        `docs/handoffs/chat-smoke-quality-gate/13-intent-catalog-full-validation.md`,
        além do checkpoint final de documentação, sem incluir segredos ou
        artifacts sensíveis.
    - phase: "ci-commit"
      agent: ci-cd-github-mtr
      required: conditional
      reason: >
        Acionar somente se a decisão final for "aprovado para commit", para
        preparar o commit `test: valida catálogo completo de intenções do chat sicat`
        sem incluir `.env`, `scripts/ai-smoke/.env`, `artifacts/ai-smoke` ou dados sensíveis.
```

### Critérios de pronto desta rodada

- [ ] Validação estrutural dos dois JSONL concluída com relatório versionável
- [ ] Script `validate:ai-chat-catalog` existente no `package.json`
- [ ] Categorias esperadas mapeadas com pendências registradas sem inventar cenários
- [ ] Ambiente local validado sem exposição de segredo
- [ ] Hardening anti-heurística confirmado em código e runner
- [ ] `npm run validate:ai-chat-catalog` aprovado
- [ ] `npm run lint` aprovado
- [ ] `npm run typecheck` aprovado
- [ ] `npm run test:contract` aprovado
- [ ] `npm run build:ts` aprovado
- [ ] `npm run smoke:ai-chat:sample` fail-fast aprovado
- [ ] `npm run smoke:ai-chat:sample:full` aprovado
- [ ] Todas as categorias solicitadas aprovadas em fail-fast
- [ ] `npm run smoke:ai-chat` fail-fast aprovado
- [ ] `npm run smoke:ai-chat:full` aprovado
- [ ] `npm test` aprovado ao final
- [ ] `npm run quality:gate` aprovado ao final
- [ ] Relatório final obrigatório atualizado com decisão final e pendências classificadas

### Artefatos esperados desta rodada

- `docs/handoffs/chat-smoke-quality-gate/03-backend-contracts.md`
- `docs/handoffs/chat-smoke-quality-gate/09-qa-validation.md`
- `docs/handoffs/chat-smoke-quality-gate/10-documentation-final.md`
- `docs/handoffs/chat-smoke-quality-gate/13-intent-catalog-full-validation.md`
```

---

## Atualização 2026-04-26 — Execução real end-to-end com smoke conversacional

### Demanda incremental

Executar cadeia completa para estabilizar o Chat SICAT com agente/LLM real,
tools, policies e síntese natural, com correção por causa raiz guiada por
smoke fail-fast e posterior validação full.

### Classificação obrigatória

```yaml
orchestration:
  work_id: "chat-smoke-quality-gate"
  intent: "fix"
  complexity: "complex"
  domains:
    - "backend-contract"
    - "domain-rules"
    - "qa"
    - "docs"
  first_agent: "estrutura-vscode-mtr"
  phase_sequence:
    - phase: "localhost-availability"
      agent: estrutura-vscode-mtr
      required: true
      reason: >
        Validar .env raiz e scripts/ai-smoke/.env sem expor segredo,
        confirmar backend online em 127.0.0.1:8080 e reinício quando necessário.
    - phase: "03-backend-contracts"
      agent: programador-backend-mtr
      required: true
      reason: >
        Corrigir causa raiz no fluxo conversacional (provider real, policies,
        tool planning/registry, síntese LLM, anti-heurística).
    - phase: "09-qa-validation"
      agent: tester-qa-mtr
      required: true
      reason: >
        Executar lint/typecheck/test:contract/build e ciclo smoke sample,
        categorias, completo fail-fast e full final quando elegível.
    - phase: "10-documentation-final"
      agent: documentador-mtr
      required: true
      reason: >
        Consolidar relatório final obrigatório e atualizar
        docs/handoffs/chat-smoke-quality-gate/12-chat-evolution-real-execution.md.
    - phase: "ci-commit"
      agent: ci-cd-github-mtr
      required: conditional
      reason: >
        Executar commit somente se decisão final for aprovado para commit,
        excluindo .env, tokens, artifacts e payloads sensíveis.
```

### Regras mandatórias desta rodada

- Proibido provider heurístico/rule-based/keyword/static/fallback fake.

---

## Atualização 2026-04-26 — Rodada operacional de estabilização (prompt do usuário)

### Demanda resumida

Executar validação real de ambiente e backend, rodar smoke conversacional com
fail-fast, corrigir causa raiz sem heurísticas/fallback fake, repetir até
estabilizar e concluir quality gate final, com relatório obrigatório e decisão
de commit.

### Classificação obrigatória

```yaml
orchestration:
  work_id: "chat-smoke-quality-gate"
  intent: "fix"
  complexity: "complex"
  domains:
    - "backend-contract"
    - "domain-rules"
    - "qa"
    - "docs"
    - "ci"
  first_agent: "estrutura-vscode-mtr"
  phase_sequence:
    - phase: "localhost-availability"
      agent: estrutura-vscode-mtr
      required: true
      reason: >
        Validar .env raiz e scripts/ai-smoke/.env, backend online em
        127.0.0.1:8080, reinício quando necessário e executar smoke sample inicial.
    - phase: "03-backend-contracts"
      agent: programador-backend-mtr
      required: true
      reason: >
        Corrigir causa raiz no fluxo conversacional (provider, policies,
        planning, tool registry, síntese natural e anti-heurística).
    - phase: "09-qa-validation"
      agent: tester-qa-mtr
      required: true
      reason: >
        Rodar lint/typecheck/test:contract/build e ciclo completo de smoke:
        sample, categorias críticas, completo fail-fast e full final.
    - phase: "10-documentation-final"
      agent: documentador-mtr
      required: true
      reason: >
        Consolidar relatório final e atualizar
        docs/handoffs/chat-smoke-quality-gate/12-chat-evolution-real-execution.md.
    - phase: "ci-commit"
      agent: ci-cd-github-mtr
      required: conditional
      reason: >
        Preparar commit somente se a decisão final for aprovado para commit,
        sem incluir .env, artifacts e dados sensíveis.
```

### Critérios de pronto desta rodada

- Etapa 1 a 3 concluídas com validação de ambiente e backend online.
- Etapa 4 concluída com anti-heurística confirmada em código.
- Etapa 5 concluída com lint/typecheck/test:contract/build:ts verdes.
- Etapas 6 a 10 concluídas com smoke fail-fast e full conforme regra.
- Etapa 12 concluída com relatório em
  docs/handoffs/chat-smoke-quality-gate/12-chat-evolution-real-execution.md.
- Etapa 13 concluída com quality gate final verde.
- Etapa 14 entregue com resumo completo obrigatório.
- Etapa 15 somente se decisão final for aprovado para commit.
- Provider indisponível deve retornar `failed` ou `blocked`, nunca `responded`.
- `SICAT_AI_SMOKE_ALLOW_MUTATIONS=false` durante toda a validação.
- Não reduzir cobertura de catálogo, score mínimo ou exigência do judge.
- Usar fail-fast durante correção; executar `:full` apenas após estabilidade.

### Critérios de pronto desta rodada

- [ ] Etapa 1/2/3 concluídas (env + backend + modelos GPT-5.1 carregados)
- [ ] Anti-heurística validada e corrigida quando necessário
- [ ] `npm run smoke:ai-chat:sample` estável em fail-fast
- [ ] Categorias críticas estáveis em fail-fast
- [ ] `npm run smoke:ai-chat` estável em fail-fast
- [ ] `npm run smoke:ai-chat:sample:full` e `npm run smoke:ai-chat:full` executados
- [ ] Quality gate final técnico (`lint`, `typecheck`, `test`, `test:contract`, `build:ts`, `quality:gate`) aprovado
- [ ] Relatório final obrigatório atualizado sem dados sensíveis

### Critérios adicionais de pronto

- [ ] Não existe `provider: "rule-based"` em resposta final válida do chat
- [ ] Provider indisponível retorna `status: failed|blocked` com `reasonCode: PROVIDER_UNAVAILABLE`
- [ ] Runner reprova `llm.provider=rule-based` e fallback heurístico
- [ ] Judge heurístico removido; sem `OPENAI_API_KEY` o runner deve falhar explicitamente

---

## Atualização 2026-04-26 — Separação de modelos IA

### Demanda incremental

Separar explicitamente o modelo do agente conversacional real, o modelo de síntese natural e o modelo do juiz do smoke.

### Requisitos mandatórios

- `OPENAI_AGENT_MODEL` para planejamento do agente e decisão de tool
- `OPENAI_SYNTHESIS_MODEL` para síntese natural baseada em `toolResult`
- `OPENAI_JUDGE_MODEL` somente no runner de smoke
- `OPENAI_MODEL` mantido apenas como fallback de compatibilidade
- default recomendado do agente/síntese: `gpt-5.1`
- default recomendado do judge: `gpt-4o-mini`
- nenhuma heurística textual para compensar modelo fraco
- provider indisponível continua retornando indisponibilidade explícita

### Evidência inicial do orquestrador

- `src/services/conversation/ai-config.ts` ainda expõe apenas `openAiModel` único com fallback `gpt-4o-mini`
- `scripts/ai-smoke/run-sicat-ai-smoke.mjs` ainda usa `OPENAI_MODEL` para o juiz
- `scripts/ai-smoke/bootstrap-sicat-smoke-env.mjs` e `scripts/ai-smoke/.env.example` ainda publicam só `OPENAI_MODEL`

### Reclassificação desta fase

```yaml
orchestration:
  work_id: "chat-smoke-quality-gate"
  intent: "fix + validate"
  complexity: "moderate"
  domains:
    - "backend-contract"
    - "qa"
    - "docs"
  first_agent: "programador-backend-mtr"
  phase_sequence:
    - phase: "03-backend-contracts"
      agent: programador-backend-mtr
      required: true
      reason: >
        Implementar separação OPENAI_AGENT_MODEL / OPENAI_SYNTHESIS_MODEL /
        OPENAI_JUDGE_MODEL, preservar fallback de compatibilidade via OPENAI_MODEL,
        atualizar docs e executar lint/typecheck/test/build/quality:gate.
    - phase: "09-qa-validation"
      agent: tester-qa-mtr
      required: conditional
      reason: >
        Executar smoke real sample/full quando o runtime e as credenciais estiverem disponíveis.
    - phase: "10-documentation-final"
      agent: documentador-mtr
      required: conditional
      reason: >
        Atualizar handoff final apenas se houver execução real ou mudança relevante de decisão.
```

### Critérios adicionais de pronto desta demanda

- [ ] `OPENAI_AGENT_MODEL` e `OPENAI_SYNTHESIS_MODEL` usados no backend
- [ ] `OPENAI_JUDGE_MODEL` usado somente no smoke runner
- [ ] `OPENAI_MODEL` apenas como fallback de compatibilidade
- [ ] defaults corretos: `gpt-5.1` (agente/síntese) e `gpt-4o-mini` (judge)
- [ ] `npm run lint` passa
- [ ] `npm run typecheck` passa
- [ ] `npm test` passa
- [ ] `npm run build:ts` passa
- [ ] `npm run quality:gate` passa

---

## Atualização 2026-04-26 — Hardening anti-mascaramento de provider

### Demanda incremental

Finalizar o hardening anti-heurística garantindo que nenhum provider heurístico seja mascarado como provider aceitável no fluxo conversacional.

### Evidência confirmada pelo orquestrador

- [src/services/conversation/conversation-service.ts](../../../src/services/conversation/conversation-service.ts) contém `normalizeLlmProviderName()` que mapeia `rule-based` para `provider-adapter`.
- [src/services/conversation/llm-provider.ts](../../../src/services/conversation/llm-provider.ts) ainda contém `buildDeterministicPlan()`.
- [scripts/ai-smoke/run-sicat-ai-smoke.mjs](../../../scripts/ai-smoke/run-sicat-ai-smoke.mjs) ainda não reprova toda a lista de providers inválidos.

### Reclassificação desta fase

```yaml
orchestration:
  work_id: "chat-smoke-quality-gate"
  intent: "fix + validate"
  complexity: "complex"
  domains:
    - "backend-contract"
    - "domain-rules"
    - "qa"
    - "docs"
  first_agent: "programador-backend-mtr"
  phase_sequence:
    - phase: "03-backend-contracts"
      agent: programador-backend-mtr
      required: true
      reason: >
        Remover mascaramento de provider, endurecer validação de provider no
        conversation-service e no smoke runner, blindar/remover deterministic plan,
        atualizar testes e documentação.
    - phase: "09-qa-validation"
      agent: tester-qa-mtr
      required: true
      reason: >
        Executar lint/typecheck/test/test:contract/build/quality:gate e,
        com ambiente disponível, rodar smoke:ai-chat:sample real.
    - phase: "10-documentation-final"
      agent: documentador-mtr
      required: true
      reason: >
        Consolidar relatório final obrigatório com decisão.
```

### Critérios adicionais de pronto desta rodada

- [ ] `normalizeLlmProviderName` removida ou corrigida sem mascaramento
- [ ] providers inválidos (`rule-based`, `provider-adapter`, `deterministic`, `keyword`, `static`, `fallback`, `mock`, `stub`, `unknown-llm`) não passam como resposta normal
- [ ] `buildDeterministicPlan` removida ou blindada por testes explícitos
- [ ] `explicit-tool-request` permitido apenas quando `body.toolRequest` existir
- [ ] runner reprova automaticamente providers inválidos e `responded` com indisponibilidade
- [ ] testes unitários de fallback/provider reforçados
- [ ] documentação de rubrica/judge atualizada com regra anti-mascaramento
