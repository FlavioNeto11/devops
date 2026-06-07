# Orchestration

```yaml
orchestration:
  work_id: "homepage-canvas-continuous-storytelling"
  intent: "refactor"
  complexity: "moderate"
  domains:
    - "frontend-ux"
    - "qa"
  first_agent: "frontend-vue-ux-mtr"
  phase_sequence:
    - phase: "06-frontend-ux"
      agent: frontend-vue-ux-mtr
      required: true
      reason: "Refatorar integração visual da homepage preservando os 3 canvases como protagonistas."
    - phase: "09-qa-validation"
      agent: tester-qa-mtr
      required: true
      reason: "Validar fluidez narrativa, ausência de regressão visual e build frontend."
```

## Demanda Resumida
- Preservar os 3 canvases existentes como base principal da experiência.
- Eliminar sensação de blocos empilhados na homepage.
- Costurar hero, capítulos e CTA final com continuidade visual premium.
- Melhorar wrappers, transições, conectores, ambientação e narrativa de scroll sem rebaixar os canvases.

## Critérios de Pronto
- Página não aparenta pilha de seções isoladas.
- Hero, canvas 1, canvas 2, canvas 3 e CTA final formam fluxo contínuo.
- Títulos e microtextos com composição editorial integrada ao frame visual.
- Sem regressão de comportamento interno dos canvases.
- Frontend sem erros de lint/compile nos arquivos alterados.

## Checkpoints Esperados
- `docs/handoffs/homepage-canvas-continuous-storytelling/06-frontend-ux.md`
- `docs/handoffs/homepage-canvas-continuous-storytelling/09-qa-validation.md`

## Reabertura 2026-04-23 - Delta visual
- Contexto: apos consolidacao recente do canvas vertical unificado, captura de scroll completo mostrou subocupacao do stage dentro do bloco narrativo.
- Sintoma observado: o canvas sticky nao utiliza a altura/composicao esperada durante o percurso; a area visivel fica pequena em relacao ao espaco reservado, gerando grande vazio no restante do scroll.
- Ownership reaberto:
  - fase: `06-frontend-ux`
  - agent: `frontend-vue-ux-mtr`
  - foco: ajustar ocupacao espacial, proporcao do stage sticky, distribuicao do conteudo interno e progressao visual ao longo do bloco.
- Criterio adicional de pronto:
  - o canvas consolidado deve ocupar visualmente o bloco narrativo de forma convincente em captura de scroll completo, sem parecer um card pequeno perdido em uma faixa muito alta.

## Continuacao 2026-04-23 - Execucao de proximos passos
- Contexto: usuario solicitou executar os proximos passos registrados como ressalvas/backlog apos aprovacao com ressalvas.
- Escopo da continuacao:
  1. alinhar ancora `#unified-story-canvas` com elemento real no DOM;
  2. hardening responsivo para reduzir dependencia de clipping lateral em tablet/mobile;
  3. validar ausencia de regressao visual e tecnica apos os ajustes.
- Ownership da continuacao:
  - fase: `06-frontend-ux` -> `frontend-vue-ux-mtr`
  - fase: `09-qa-validation` -> `tester-qa-mtr`
  - fase: `10-documentation-final` -> `documentador-mtr`

## Continuacao 2026-04-23 - Correcao visual dark/scroll/overlap
- Contexto: usuario reportou regressao visual apos rodada anterior.
- Sintomas reportados:
  1. modo dark com qualidade visual ruim no bloco unificado;
  2. aparecimento de scroll indevido logo no inicio da secao;
  3. no final da secao, o bloco unificado fica sobreposto/na frente do bloco seguinte.
- Escopo da continuacao:
  - ajustar tema dark do canvas unificado e seus tokens/contrastes;
  - remover overflow/scrollbar indevido no inicio sem quebrar sticky;
  - corrigir lifecycle/stacking no fim para evitar sobreposicao com bloco seguinte;
  - revalidar desktop/tablet/mobile.
- Ownership da continuacao:
  - fase: `06-frontend-ux` -> `frontend-vue-ux-mtr`
  - fase: `09-qa-validation` -> `tester-qa-mtr`
  - fase: `10-documentation-final` -> `documentador-mtr`

## Continuacao 2026-04-23 - Regressao de entrada e fechamento do canvas unificado
- Contexto: novas evidencias visuais mostram que, ao entrar na secao do canvas unificado, o passo 1 quase nao aparece (entrada ja tende ao passo 2), e no fim da secao ainda ocorre composicao quebrada com sobreposicao no bloco seguinte.
- Sintomas reportados:
  1. inicio da secao com passo 1 pouco visivel;
  2. fechamento com sobreposicao visual sobre CTA/bloco seguinte;
  3. pedido de scroll narrativo mais longo e animacoes mais suaves.
- Escopo da continuacao:
  - alongar trilha util de scroll do canvas unificado;
  - rebalancear timeline para manter passo 1 dominante na entrada;
  - suavizar easing/transicoes entre milestones;
  - garantir saida limpa da secao sem sobreposicao no final.
- Ownership da continuacao:
  - fase: `06-frontend-ux` -> `frontend-vue-ux-mtr`
  - fase: `09-qa-validation` -> `tester-qa-mtr`
  - fase: `10-documentation-final` -> `documentador-mtr`

## Continuacao 2026-04-23 - Visibilidade passo 4 e rolagem concorrente
- Contexto: usuario reportou nova regressao funcional/ux no canvas unificado apos os ultimos ajustes.
- Sintomas reportados:
  1. passo 4 nao fica visivel de forma clara;
  2. no passo 1 existe scroll interno competindo com o scroll externo da pagina;
  3. movimentacao do canvas percebida como estranha;
  4. area de scroll ainda curta (animacoes terminam rapido).
- Escopo da continuacao:
  - garantir exibicao clara do passo 4 durante janela util de narrativa;
  - remover/mitigar rolagem interna concorrente do palco para priorizar scroll externo;
  - suavizar a cinematica de transicao/movimento entre milestones;
  - aumentar novamente a trilha util de scroll para desacelerar progressao visual.
- Ownership da continuacao:
  - fase: `06-frontend-ux` -> `frontend-vue-ux-mtr`
  - fase: `09-qa-validation` -> `tester-qa-mtr`
  - fase: `10-documentation-final` -> `documentador-mtr`

## Continuacao 2026-04-23 - Fine tuning cinematico
- Contexto: apos estabilizacao funcional e QA aprovado, usuario solicitou rodada adicional de refinamento visual.
- Escopo da continuacao:
  - melhorar timing/easing das transicoes entre milestones;
  - suavizar movimentacao percebida do palco/frame e elementos internos;
  - manter a narrativa mais cinematica sem alterar contratos funcionais ja aprovados.
- Guardrails obrigatorios:
  - preservar passo 1 dominante na entrada;
  - preservar passo 4 dominante no trecho final;
  - manter zero overlap com CTA;
  - manter dark mode, ancora, sticky e ausencia de overflow horizontal.
- Ownership da continuacao:
  - fase: `06-frontend-ux` -> `frontend-vue-ux-mtr`
  - fase: `09-qa-validation` -> `tester-qa-mtr`
  - fase: `10-documentation-final` -> `documentador-mtr`

## Continuacao 2026-04-23 - Timing 1->2 e clipping de textos na fase 1
- Contexto: usuario reportou regressao de composicao na milestone 1.
- Sintomas reportados:
  1. fim da fase 1 ja exibe a fase 2 cedo demais (transicao 1->2 prematura);
  2. na fase 1, textos/cards de Geofence e NFC ficam no canto e cortam.
- Escopo da continuacao:
  - atrasar entrada visual da fase 2 para preservar dominancia da fase 1 ate mais perto do handoff;
  - corrigir layout da grade/legendas da fase 1 para manter Geofence e NFC totalmente visiveis;
  - preservar comportamento ja validado de 2->3 e 3->4.
- Ownership da continuacao:
  - fase: `06-frontend-ux` -> `frontend-vue-ux-mtr`
  - fase: `09-qa-validation` -> `tester-qa-mtr`
  - fase: `10-documentation-final` -> `documentador-mtr`
