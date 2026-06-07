# 00 - Orchestration

## Demanda resumida

Separar de forma real as experiencias de CDF no frontend:

- rota /cdf para consulta, acompanhamento e download de certificados emitidos;
- rota /cdf/novo para fluxo operacional de geracao de novo CDF com base em manifestos elegiveis.

A entrega deve eliminar a sobreposicao atual de UX/funcao entre as duas rotas, mantendo compatibilidade com endpoints existentes e sem quebrar contratos.

## Classificacao obrigatoria

```yaml
orchestration:
  work_id: "cdf-list-create-separation"
  intent: "refactor"
  complexity: "complex"
  domains:
    - "frontend-ux"
    - "qa"
    - "docs"
  first_agent: "frontend-vue-ux-mtr"
  phase_sequence:
    - phase: "06-frontend-ux"
      agent: "frontend-vue-ux-mtr"
      required: true
      reason: "separar rotas, views e componentes para listagem de CDF emitido versus geracao de novo CDF"
    - phase: "09-qa-validation"
      agent: "tester-qa-mtr"
      required: true
      reason: "executar validacoes obrigatorias e provar que as duas rotas ficaram funcional e visualmente diferentes"
    - phase: "10-documentation-final"
      agent: "documentador-mtr"
      required: true
      reason: "consolidar diagnostico, mudancas, validacoes e decisao final aprovado/bloqueado"
```

## Criterios de pronto

- /cdf e /cdf/novo com responsabilidades e interfaces distintas.
- /cdf sem formulario/acao de geracao de CDF.
- /cdf/novo sem parecer tela principal de consulta de certificados emitidos.
- fluxo de pre-selecao via query param manifestId em /cdf/novo preservado.
- download de PDF de CDF emitido preservado na tela de consulta.
- fluxo de geracao de CDF preservado na tela de criacao.
- ajuste de item ativo de navegacao para diferenciar /cdf e /cdf/novo.
- validacoes obrigatorias executadas e verdes: lint, typecheck, test, build:ts e quality:gate (se disponivel).

## Checkpoints esperados

- docs/handoffs/cdf-list-create-separation/00-orchestration.md
- docs/handoffs/cdf-list-create-separation/06-frontend-ux.md
- docs/handoffs/cdf-list-create-separation/09-qa-validation.md
- docs/handoffs/cdf-list-create-separation/10-documentation-final.md

## Cadeia imediata iniciada

1. frontend-vue-ux-mtr: implementar separacao real entre consulta de certificados emitidos e geracao de novo CDF.
