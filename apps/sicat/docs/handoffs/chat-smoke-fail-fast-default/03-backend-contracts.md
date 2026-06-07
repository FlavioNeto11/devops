# Fase 03 - backend-contracts

Data: 2026-04-26
Work ID: chat-smoke-fail-fast-default
Agente: programador-backend-mtr
Status: concluido

## Objetivo da fase

Implementar fail-fast como comportamento padrao no runner de smoke conversacional, manter modo full apenas por opcao explicita e garantir relatorio parcial consistente mesmo com parada antecipada.

## Arquivos analisados

- scripts/ai-smoke/run-sicat-ai-smoke.mjs
- package.json
- scripts/ai-smoke/README.md
- tests/unit/ai-smoke-runner-quality-gate.test.js
- docs/handoffs/chat-smoke-fail-fast-default/00-orchestration.md

## Decisoes tecnicas

1. Fail-fast padrao ficou ativo por default via resolucao de opcoes no runner.
2. Dry-run desativa fail-fast sempre e nao dispara parada antecipada.
3. Modo full foi implementado de forma explicita via scripts npm com --no-fail-fast.
4. Ajuste automatico sample vs catalogo completo foi aplicado com override por flags:
- sample: batchSize 0 e regra de batch desativada por default
- completo: batchSize 25 e stopAfterBatchIfBelowPassRate 0.7
5. Regras numericas com valor 0 desativam apenas a regra correspondente.
6. Runner sempre grava JSON e MD, inclusive em early stop, e loga caminhos + motivo.
7. Foram exportadas funcoes puras para teste unitario:
- createEarlyStopState
- updateEarlyStopState
- shouldStopEarly
- resolveSmokeRunOptions

## Arquivos alterados

- scripts/ai-smoke/run-sicat-ai-smoke.mjs
- package.json
- scripts/ai-smoke/README.md
- tests/unit/ai-smoke-runner-fail-fast.test.js

Observacao: docs/copilot/auditoria-links-quebrados.md foi atualizado automaticamente por validacoes de links.

## Cobertura de requisitos

- Novas flags CLI implementadas:
  --fail-fast, --no-fail-fast, --max-failures, --max-consecutive-failures,
  --low-score-threshold, --max-consecutive-low-scores, --min-pass-rate,
  --batch-size, --stop-after-batch-if-below-pass-rate
- Defaults obrigatorios implementados.
- Scripts principais mantidos com fail-fast default.
- Scripts full adicionados com --no-fail-fast.
- Dry-run preservado sem early stop.
- Parada antecipada com contadores e motivo implementada em executeScenarios.
- Relatorio JSON e MD com campos earlyStopped/earlyStopReason/earlyStopCounters.
- Secao markdown "Execucao interrompida antecipadamente" implementada.
- Secao markdown "Prompt de correcao sugerido para Copilot" sempre gerada.
- process.exitCode = 1 em falhas/early stop preservado.

## Validacoes executadas

Ordem solicitada:

1. npm run lint
- resultado: aprovado

2. npm run typecheck
- resultado: aprovado

3. npm test
- resultado: aprovado (355 pass, 0 fail)

4. npm run test:contract
- resultado: aprovado

5. npm run build:ts
- resultado: aprovado

6. npm run quality:gate
- resultado: aprovado

## Smoke sample

Pre-condicoes verificadas:
- scripts/ai-smoke/.env presente
- backend online confirmado via npm run smoke:health

Execucao realizada:
- comando: npm run smoke:ai-chat:sample
- resultado: early stop esperado por fail-fast default
- resumo: 1/4 aprovados, early stop por MAX_CONSECUTIVE_FAILURES_REACHED
- relatorios gerados:
  - artifacts/ai-smoke/sicat-ai-smoke-2026-04-26T19-43-39-716Z.json
  - artifacts/ai-smoke/sicat-ai-smoke-2026-04-26T19-43-39-716Z.md

## Handoff para proxima fase

Proximo agente requerido: tester-qa-mtr (fase 09-qa-validation)

Prompt sugerido para o proximo agente:

Validar regressao do runner de smoke conversacional com fail-fast default, cobrindo:
- default fail-fast ativo
- scripts full com --no-fail-fast
- dry-run sem early stop
- regras de parada por consecutivas, low score e batch pass rate
- consistencia dos campos early stop nos relatorios JSON/MD
- sem executar smoke full

Conferir tambem que os novos testes unitarios de fail-fast continuam estaveis no pipeline.
