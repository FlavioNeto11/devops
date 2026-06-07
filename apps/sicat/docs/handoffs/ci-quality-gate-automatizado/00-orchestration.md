# Orquestracao - ci-quality-gate-automatizado

## Demanda resumida
Criar estrutura automatizada de Quality Gate no SICAT para bloquear commit/push/PR com erro pendente, cobrindo lint, typecheck, testes, OpenAPI, validacoes internas, CETESB/HAR, Sonar e verificacao de segredos, com execucao local e no CI.

## Classificacao

```yaml
orchestration:
  work_id: "ci-quality-gate-automatizado"
  intent: "ci"
  complexity: "complex"
  domains:
    - "ci"
    - "qa"
    - "docs"
  first_agent: "ci-cd-github-mtr"
  phase_sequence:
    - phase: "07-observability-admin"
      agent: "ci-cd-github-mtr"
      required: true
      reason: "implementar quality gate de pipeline, hooks, scripts e governanca de validacao pre-merge"
    - phase: "09-qa-validation"
      agent: "tester-qa-mtr"
      required: true
      reason: "validar execucao completa do quality gate e confirmar ausencia de falhas pendentes"
    - phase: "10-documentation-final"
      agent: "documentador-mtr"
      required: true
      reason: "consolidar evidencias, estado final e criterio de autorizacao/bloqueio de commit"
```

## Criterios de pronto desta cadeia
- Agente de qualidade criado em `.github/copilot/agents/sicat-quality-gate.agent.md` com regras obrigatorias de bloqueio.
- ESLint presente e scripts `lint`/`lint:fix` operacionais no `package.json`.
- Sonar configurado em `sonar-project.properties` e script `sonar` adicionado sem segredos versionados.
- Husky configurado com `pre-commit` e `pre-push` bloqueando falhas obrigatorias.
- Workflow `.github/workflows/ci.yml` executando quality gate no push/PR para `main`.
- Script central `quality:gate` com parada na primeira falha.
- Script de segredos `check:secrets` integrado ao quality gate e ao CI.
- `.gitignore` atualizado sem remover entradas existentes.
- `npm ci` e `npm run quality:gate` executados; se houver erro, corrigido e revalidado.
- Commit somente autorizado se todas validacoes obrigatorias passarem; nunca usar `--no-verify`.

## Checkpoints esperados
- `docs/handoffs/ci-quality-gate-automatizado/07-observability-admin.md`
- `docs/handoffs/ci-quality-gate-automatizado/09-qa-validation.md`
- `docs/handoffs/ci-quality-gate-automatizado/10-documentation-final.md`

## Cadeia imediata iniciada
1. `ci-cd-github-mtr`: implementar toda a estrutura tecnica de quality gate solicitada, executar validacoes e registrar checkpoint da fase.
