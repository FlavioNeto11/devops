# 00 - Orchestration

## Demanda original (resumo)

Ajustar os agentes e a estratégia global de orquestracao para que a disponibilizacao em localhost entre como etapa padrao nas demandas que exigem validacao do usuario ou validacao manual da entrega. O objetivo e evitar que a exposicao da stack local dependa de uma decisao ad hoc no fim da cadeia.

## Classificacao obrigatoria

```yaml
orchestration:
  work_id: "localhost-validation-default"
  intent: "meta"
  complexity: "moderate"
  domains:
    - "docs"
    - "qa"
    - "operate"
  first_agent: "meta-evolution-copilot"
  phase_sequence:
    - phase: "06-meta-evolution"
      agent: "meta-evolution-copilot"
      required: true
      reason: "A regra precisa ser incorporada na estrutura Copilot global sem enviesar uma demanda especifica."
    - phase: "09-qa-validation"
      agent: "tester-qa-mtr"
      required: true
      reason: "Validar que a nova regra ficou clara, coerente e aplicavel nas cadeias futuras."
    - phase: "10-documentation-final"
      agent: "documentador-mtr"
      required: true
      reason: "Consolidar a mudanca estrutural e o impacto esperado na orquestracao futura."
```

## Regra alvo

- Toda demanda que inclua validacao manual, critica do usuario, smoke local ou entrega navegavel deve considerar uma fase explicita de disponibilizacao localhost antes do encerramento.
- Essa fase deve ser tratada como parte da mesma rodada operacional, nao como rodada separada, salvo instrucao explicita em contrario do usuario.
- O owner operacional dessa etapa continua sendo `estrutura-vscode-mtr`, mas o gatilho para incluir a fase deve vir do `orquestrador-mtr` e das instrucoes globais associadas.

## Criterios de pronto

- O orquestrador passa a tratar disponibilizacao localhost como etapa padrao quando houver validacao manual/local da entrega.
- As instrucoes globais deixam claro que isso pertence a mesma cadeia da demanda e nao deve ser empurrado para uma rodada separada.
- O especialista de workspace fica alinhado para receber essa fase como continuidade natural da demanda.
- A mudanca fica documentada e validada.

## Checkpoints esperados

- `docs/handoffs/localhost-validation-default/00-orchestration.md`
- `docs/handoffs/localhost-validation-default/06-meta-evolution.md`
- `docs/handoffs/localhost-validation-default/09-qa-validation.md`
- `docs/handoffs/localhost-validation-default/10-documentation-final.md`

## Handoff imediato

Proximo agente obrigatorio: `meta-evolution-copilot`.

Objetivo da fase 06: ajustar agentes/instrucoes globais relevantes para que disponibilizacao localhost entre como etapa padrao nas demandas com validacao manual/local, preservando o carater generico da plataforma.