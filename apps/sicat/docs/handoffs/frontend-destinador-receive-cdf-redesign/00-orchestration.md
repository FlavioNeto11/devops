# 00 - Orchestration

## Demanda original (resumo)

Reanalisar as HARs e as evidencias visuais do SIGOR para redesenhar o fluxo frontend de manifestos/CDF no perfil do destinador ou destino final. O usuario descreveu que o destinador deve poder receber MTR e gerar CDF, enquanto o gerador e quem pode gerar MTR. Na UX desejada, o destinador nao deve ver opcao de replicar; deve haver recebimento individual e em lote a partir da tela de listagem; e a geracao de CDF deve sair do detalhe do manifesto para uma tela baseada em selecao de MTRs, respeitando a regra de que um MTR nao pode estar em mais de um CDF ao mesmo tempo.

## Classificacao obrigatoria

```yaml
orchestration:
  work_id: "frontend-destinador-receive-cdf-redesign"
  intent: "fix"
  complexity: "complex"
  domains:
    - "source-validation"
    - "domain-rules"
    - "frontend-ux"
    - "qa"
    - "docs"
    - "operate"
  first_agent: "validador-cetesb-mtr"
  phase_sequence:
    - phase: "01-source-validation"
      agent: "validador-cetesb-mtr"
      required: true
      reason: "A demanda depende explicitamente das HARs e dos prints do SIGOR como fonte de verdade para o comportamento esperado de recebimento de MTR e geracao de CDF."
    - phase: "05-domain-rules"
      agent: "manifestos-operacional-mtr"
      required: true
      reason: "E preciso consolidar as regras operacionais por papel: gerador vs destinador, recebimento individual/lote, e restricao de um MTR nao pertencer a mais de um CDF simultaneamente."
    - phase: "06-frontend-ux"
      agent: "frontend-vue-ux-mtr"
      required: true
      reason: "A entrega final solicitada e um redesenho de fluxo e interface no frontend com base nas regras validadas."
    - phase: "09-qa-validation"
      agent: "tester-qa-mtr"
      required: true
      reason: "Apos a implementacao, e preciso provar que a UX de listagem, recebimento popup, recebimento em lote e geracao de CDF por selecao ficou aderente ao fluxo validado."
    - phase: "10-documentation-final"
      agent: "documentador-mtr"
      required: true
      reason: "Consolidar a trilha de evidencias, regras operacionais e resultado final da entrega."
    - phase: "11-local-availability"
      agent: "estrutura-vscode-mtr"
      required: true
      reason: "Disponibilizar a stack local em localhost para validacao manual do usuario sobre a entrega concluida."
```

## Evidencias de entrada

- HAR de recebimento de MTR:
  - `docs/cetesb/mtr.cetesb.sp.gov.br_recebimento_mtr.har`
- HAR de download/baixa de CDF:
  - `docs/cetesb/mtr.cetesb.sp.gov.br_baixar_cdf_mtr.har`
- HAR de geracao de CDF:
  - `docs/cetesb/mtr.cetesb.sp.gov.br_gerar_cdf_mtr.har`
- Prints anexados pelo usuario mostrando:
  - tela atual do SICAT em `Manifestos` com menu de acoes e selecao em lote;
  - tela atual do detalhe do manifesto no SICAT com `Recebimento e CDF` embutidos indevidamente no detalhe;
  - popup real do SIGOR para recebimento de manifesto;
  - tela real do SIGOR para geracao de CDF com periodo, responsavel, gerador e selecao de MTRs.

## Hipoteses iniciais a validar

- No perfil de destinador/destino final, a acao principal operacional na listagem deve ser receber, nao replicar.
- Recebimento de MTR deve existir como popup/modal a partir da listagem, com suporte a um ou varios MTRs quando a operacao permitir lote.
- Geracao de CDF deve sair do detalhe do manifesto e virar fluxo/tela propria a partir da listagem, com selecao de MTRs.
- Um MTR nao pode participar de mais de um CDF simultaneamente.
- O gerador continua sendo o papel que cria/gera MTR, enquanto o destinador opera recebimento e CDF.

## Criterios de pronto

- As HARs e os prints do SIGOR foram analisados e convertidos em regras operacionais claras para o frontend.
- O frontend reflete corretamente as acoes disponiveis para o destinador na listagem.
- Recebimento individual/lote acontece por popup/modal a partir da tela de manifestos, nao no detalhe do MTR.
- Geracao de CDF acontece por fluxo/tela de selecao de MTRs aderente ao modelo do SIGOR, nao embutida no detalhe do manifesto.
- A regra de exclusividade de MTR em CDF e tratada de forma coerente no frontend conforme a fase de regras operacionais.
- Validacao final registrada.
- Stack local disponivel em localhost para validacao manual do usuario.

## Checkpoints esperados

- `docs/handoffs/frontend-destinador-receive-cdf-redesign/00-orchestration.md`
- `docs/handoffs/frontend-destinador-receive-cdf-redesign/01-source-validation.md`
- `docs/handoffs/frontend-destinador-receive-cdf-redesign/05-domain-rules.md`
- `docs/handoffs/frontend-destinador-receive-cdf-redesign/06-frontend-ux.md`
- `docs/handoffs/frontend-destinador-receive-cdf-redesign/09-qa-validation.md`
- `docs/handoffs/frontend-destinador-receive-cdf-redesign/10-documentation-final.md`
- `docs/handoffs/frontend-destinador-receive-cdf-redesign/11-local-availability.md`

## Continuidade operacional

Com as fases 01, 05, 06, 09 e 10 concluidas, a continuidade desta demanda fica restrita a disponibilizar a stack local para validacao manual do usuario.

Proximo agente obrigatorio: `estrutura-vscode-mtr`.

Objetivo da fase 11: subir a stack local adequada para navegacao e testes manuais, registrar URLs/portas efetivas, indicar o que ficou em execucao e anotar qualquer limitacao operacional observada durante o bootstrap.