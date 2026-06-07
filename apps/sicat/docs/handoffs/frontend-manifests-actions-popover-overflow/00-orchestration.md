# 00 - Orchestration

## Demanda original (resumo)

Na tela de manifestos, ao clicar no botao de acoes da grid, o menu esta abrindo dentro do container com scroll da tabela. Isso afeta o scroll do elemento e corta o menu visualmente. O comportamento desejado e abrir fora desse container, sem ficar preso ao overflow da grid.

## Classificacao obrigatoria

```yaml
orchestration:
  work_id: "frontend-manifests-actions-popover-overflow"
  intent: "fix"
  complexity: "complex"
  domains:
    - "meta"
    - "frontend-ux"
    - "qa"
    - "docs"
  first_agent: "meta-evolution-copilot"
  phase_sequence:
    - phase: "00-agent-tooling"
      agent: "meta-evolution-copilot"
      required: true
      reason: "O usuario exigiu que os agentes de frontend/QA usem Playwright via MCP para validar a tela; se nao houver acesso atual, a configuracao precisa ser corrigida antes da nova rodada de teste."
    - phase: "06-frontend-ux"
      agent: "frontend-vue-ux-mtr"
      required: true
      reason: "O defeito persiste na renderizacao/interacao da UI da grid de manifestos e deve ser corrigido no frontend com evidencia real de viewport/rodape."
    - phase: "09-qa-validation"
      agent: "tester-qa-mtr"
      required: true
      reason: "Apos a correcao, e preciso validar com Playwright que o menu abre na direcao correta no caso real e fecha adequadamente."
    - phase: "10-documentation-final"
      agent: "documentador-mtr"
      required: true
      reason: "Consolidar causa raiz, correcao e validacao final."
```

## Evidencia inicial

- Relato do usuario: na tela de manifestos, o menu do botao de acoes abre dentro do scroll da grid.
- Evidencia visual anexada mostrando o dropdown/menu restrito ao container da tabela.
- Comportamento esperado: o menu deve abrir fora do container de scroll da grid para nao ser cortado e nao interferir no scroll da tabela.

## Evidencia adicional apos primeira correcao

- O menu deixou de ficar preso ao overflow da grid, mas continua abrindo sempre para baixo.
- Em linhas proximas ao rodape da viewport, o popover pode ficar parcialmente inacessivel ou ultrapassar a area visivel inferior.
- O usuario relatou que em alguns casos nao ha scroll disponivel para recuperar a parte inferior do menu.
- Comportamento esperado complementar: o popover deve calcular espaco disponivel e abrir para cima quando nao houver area suficiente abaixo do trigger.

## Evidencia adicional apos segunda correcao

- O reposicionamento vertical passou a funcionar, mas o menu ainda nao fecha corretamente quando o usuario clica fora dele.
- O usuario agora explicita os dois requisitos finais da entrega: abrir para cima quando estiver muito proximo da borda inferior e fechar ao clicar fora.
- Alem da correcao funcional completa, o usuario pediu publicacao no repositorio ao final da cadeia.

## Evidencia adicional apos publicacao anterior

- A evidencia visual mais recente mostra que, em um caso real na tela de manifestos, o menu de acoes ainda abre para baixo e fica escondido atras/abaixo da area visivel no contexto do scroll lateral/rodape da tela.
- Isso contradiz o fechamento anterior do workstream e reabre a demanda com foco em reproducao real de viewport, nao apenas cenarios automatizados anteriores.
- O usuario requisitou explicitamente uso de Playwright e, se os agentes nao tiverem acesso ao MCP correspondente, a configuracao desses agentes deve ser ajustada para permitir os testes com as tools listadas.

## Criterios de pronto

- O menu de acoes da grid de manifestos nao fica mais preso ao overflow do container rolavel.
- O menu de acoes escolhe direcao adequada e nao fica inacessivel ao usuario quando o trigger estiver proximo da borda inferior da viewport.
- O menu fecha corretamente quando o usuario clica fora do popover.
- A interacao continua funcional em desktop e sem regressao obvia de usabilidade.
- Validacao final registrada.

## Checkpoints esperados

- `docs/handoffs/frontend-manifests-actions-popover-overflow/00-orchestration.md`
- `docs/handoffs/frontend-manifests-actions-popover-overflow/00-agent-tooling.md`
- `docs/handoffs/frontend-manifests-actions-popover-overflow/06-frontend-ux.md`
- `docs/handoffs/frontend-manifests-actions-popover-overflow/09-qa-validation.md`
- `docs/handoffs/frontend-manifests-actions-popover-overflow/10-documentation-final.md`

## Handoff imediato

Proximo agente obrigatorio: `meta-evolution-copilot`.

Objetivo da fase 00-agent-tooling: verificar se os agentes responsaveis por frontend e QA tem acesso ao MCP do Playwright solicitado pelo usuario e, se nao tiverem, ajustar a configuracao de agentes para disponibilizar essas tools antes da nova rodada de correcao e teste.