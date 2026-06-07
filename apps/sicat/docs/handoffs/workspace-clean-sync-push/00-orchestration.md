# Orquestração

## Demanda resumida

Organizar o workspace para publicação no repositório remoto, removendo lixo gerado, mantendo somente alterações relevantes, sincronizando com o repositório principal e realizando push.

## Classificação

```yaml
orchestration:
  work_id: "workspace-clean-sync-push"
  intent: "ci"
  complexity: "moderate"
  domains:
    - "ci"
  first_agent: "ci-cd-github-mtr"
  phase_sequence:
    - phase: "ci-git-operations"
      agent: "ci-cd-github-mtr"
      required: true
      reason: "Executar limpeza de arquivos gerados, organizar staging/commit, sincronizar com principal e push remoto com segurança."
```

## Critérios de pronto

- arquivos gerados/lixo removidos ou ignorados corretamente;
- apenas alterações intencionais permanecem versionadas;
- branch local sincronizada com principal sem conflitos pendentes;
- commit(s) realizados e push concluído no remoto.