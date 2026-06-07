# 00 - Orchestration

## Demanda resumida

Ajustar a estrutura Copilot para que pedidos isolados de subir o ambiente local, disponibilizar localhost ou preparar a stack apenas para uso/validacao manual do usuario nao abram um handoff proprio. Esse tipo de pedido deve ser tratado como operacao direta. A fase `estrutura-vscode-mtr` continua valida apenas quando a disponibilizacao local fizer parte de uma cadeia maior de implementacao/validacao/documentacao.

## Classificacao

```yaml
orchestration:
  work_id: "localhost-direct-run-no-handoff"
  intent: "meta"
  complexity: "simple"
  domains:
    - "docs"
  first_agent: "meta-evolution-copilot"
  phase_sequence:
    - phase: "06-meta-evolution"
      agent: "meta-evolution-copilot"
      required: true
      reason: "ajustar regras do orquestrador, prompts e discoverability para diferenciar operacao direta de cadeia com handoff"
    - phase: "09-qa-validation"
      agent: "tester-qa-mtr"
      required: true
      reason: "validar coerencia da nova regra e ausencia de contradicao com a politica atual"
    - phase: "10-documentation-final"
      agent: "documentador-mtr"
      required: true
      reason: "consolidar a nova regra de forma reutilizavel"
```

## Fontes de verdade iniciais

- `.github/agents/orquestrador-mtr.agent.md`
- `.github/agents/estrutura-vscode-mtr.agent.md`
- `.github/instructions/agent-orchestration.instructions.md`
- `.github/prompts/executar-demanda-plataforma.prompt.md`
- documentos de discoverability que mencionem `estrutura-vscode-mtr` ou handoffs para localhost

## Criterios de pronto

- pedidos isolados de `subir ambiente`, `subir stack local`, `deixar localhost no ar`, `preparar ambiente para eu validar` deixam de ser descritos como handoff proprio
- a regra continua preservando `estrutura-vscode-mtr` como fase intermediaria dentro de cadeias maiores
- a documentacao de discoverability nao induz o usuario a tratar operacao simples de ambiente como handoff autonomo

## Checkpoints esperados

- `docs/handoffs/localhost-direct-run-no-handoff/06-meta-evolution.md`
- `docs/handoffs/localhost-direct-run-no-handoff/09-qa-validation.md`
- `docs/handoffs/localhost-direct-run-no-handoff/10-documentation-final.md`

## Handoff imediato

Proximo agente obrigatorio: `meta-evolution-copilot`.

Objetivo: ajustar a estrutura Copilot para que operacoes isoladas de ambiente local sejam tratadas como execucao direta e nao como abertura de handoff, mantendo `estrutura-vscode-mtr` apenas como etapa de uma cadeia maior quando aplicavel.