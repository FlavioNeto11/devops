# Orquestração

## Demanda resumida

Remover o espaço lateral em branco presente nas telas do frontend para que o layout utilize toda a largura disponível da viewport.

## Classificação

```yaml
orchestration:
  work_id: "frontend-full-width-layout"
  intent: "fix"
  complexity: "simple"
  domains:
    - "frontend-ux"
  first_agent: "frontend-vue-ux-mtr"
  phase_sequence:
    - phase: "06-frontend-ux"
      agent: "frontend-vue-ux-mtr"
      required: true
      reason: "Ajustar containers, largura máxima e espaçamentos globais do layout frontend."
```

## Critério de pronto

- telas principais ocupam a largura útil da viewport sem faixa lateral branca indevida;
- correção preserva responsividade;
- especialista informa arquivos alterados e validação executada.

## Handoff esperado

- checkpoint `06-frontend-ux` com causa raiz, arquivos alterados e validação visual.
