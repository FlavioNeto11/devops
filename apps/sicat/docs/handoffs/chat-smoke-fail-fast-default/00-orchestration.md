# Orquestracao - chat-smoke-fail-fast-default

**Data:** 2026-04-26  
**work_id:** `chat-smoke-fail-fast-default`  
**Orquestrador:** `orquestrador-mtr`

## Demanda original resumida

Implementar fail-fast por padrao no runner de smoke conversacional do Chat SICAT, com modo full explicito via `--no-fail-fast`, scripts npm dedicados, testes unitarios da logica de parada antecipada, documentacao atualizada e validacoes completas.

## Classificacao

```yaml
orchestration:
  work_id: "chat-smoke-fail-fast-default"
  intent: "implement"
  complexity: "complex"
  domains:
    - "backend-contract"
    - "qa"
    - "docs"
  first_agent: "programador-backend-mtr"
  phase_sequence:
    - phase: "03-backend-contracts"
      agent: programador-backend-mtr
      required: true
      reason: "Implementar fail-fast default no runner, novos argumentos CLI, scripts npm full, relatorios de early stop, testes unitarios e README do smoke."
    - phase: "09-qa-validation"
      agent: tester-qa-mtr
      required: true
      reason: "Executar validacoes formais, confirmar comportamento fail-fast/default/full/dry-run e rodar apenas smoke sample se ambiente habilitado."
    - phase: "10-documentation-final"
      agent: documentador-mtr
      required: true
      reason: "Consolidar handoff final com status, evidencias, pendencias e decisao conclusiva."
```

## Criterios de pronto

- [ ] `scripts/ai-smoke/run-sicat-ai-smoke.mjs` com fail-fast default e flags:
  - `--fail-fast`
  - `--no-fail-fast`
  - `--max-failures`
  - `--max-consecutive-failures`
  - `--low-score-threshold`
  - `--max-consecutive-low-scores`
  - `--min-pass-rate`
  - `--batch-size`
  - `--stop-after-batch-if-below-pass-rate`
- [ ] Defaults obrigatorios implementados:
  - `failFast=true`
  - `maxFailures=0`
  - `maxConsecutiveFailures=3`
  - `lowScoreThreshold=0.65`
  - `maxConsecutiveLowScores=3`
  - `minPassRate=0`
  - `batchSize=25`
  - `stopAfterBatchIfBelowPassRate=0.70`
- [ ] `package.json` com scripts principais fail-fast por padrao e scripts `:full` com `--no-fail-fast`
- [ ] Dry-run preservado sem chamadas reais e sem early stop
- [ ] Relatorio JSON/MD sempre gerado em early stop com metadados completos
- [ ] Secao "Prompt de correcao sugerido para Copilot" no markdown
- [ ] Testes unitarios cobrindo regras de early stop e defaults
- [ ] Validacoes: `lint`, `typecheck`, `test`, `test:contract`, `build:ts`, `quality:gate` (se existir)
- [ ] Sem executar smoke full automatico
- [ ] Smoke sample executado apenas se `.env` de smoke existir e backend online

## Regras de seguranca e escopo

- Nao commitar `.env`, `scripts/ai-smoke/.env`, tokens, segredos ou artefatos sensiveis.
- Nao reintroduzir heuristica para mascarar falha de provider.
- Falha fatal de ambiente continua interrompendo execucao independentemente de fail-fast.

## Checkpoints esperados

- `docs/handoffs/chat-smoke-fail-fast-default/03-backend-contracts.md`
- `docs/handoffs/chat-smoke-fail-fast-default/09-qa-validation.md`
- `docs/handoffs/chat-smoke-fail-fast-default/10-documentation-final.md`
