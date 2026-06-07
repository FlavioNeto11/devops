# 05 - Domain Rules

## Objetivo da fase

Consolidar as regras operacionais do redesenho frontend para o perfil de destinador ou destino final, distinguindo:

- fatos sustentados pelas HARs e pelos contratos internos ja existentes;
- decisoes de politica necessarias para fechar a UX sem inventar integracao remota nova;
- limites claros para a implementacao da fase seguinte.

Esta fase nao implementa codigo.

## Fontes analisadas

- `docs/handoffs/frontend-destinador-receive-cdf-redesign/00-orchestration.md`
- `docs/handoffs/frontend-destinador-receive-cdf-redesign/01-source-validation.md`
- `docs/cetesb/mtr.cetesb.sp.gov.br_recebimento_mtr.har`
- `docs/cetesb/mtr.cetesb.sp.gov.br_gerar_cdf_mtr.har`
- `docs/cetesb/mtr.cetesb.sp.gov.br_baixar_cdf_mtr.har`
- `openapi/mtr_automacao_openapi_interna.yaml`
- `frontend/src/views/ManifestsView.vue`
- `frontend/src/components/CetesbOperationalFlowsPanel.vue`
- `frontend/src/composables/useCetesbOperationalFlows.js`
- `src/workers/operation-handlers.ts`

## Regras consolidadas

### 1. Acoes visiveis para destinador na listagem de manifestos

#### Fato sustentado por evidencia

- O fluxo real do SIGOR para destinador inclui recebimento formal de MTR e geracao de CDF como operacoes proprias do destinador, nao como geracao de novo MTR pelo proprio destinador.
- O recebimento exige manifesto identificado, responsavel de recebimento e envio do `POST /api/mtr/manifesto/recebimento/`.
- A geracao de CDF parte de uma pesquisa propria de MTRs recebidos e depois de um `POST /api/mtr/certificadoDestinacao/` com `listaManifesto`.
- A consulta e baixa de CDF ocorre em listagem separada de certificados emitidos, nao como extensao natural do menu de criacao de MTR.

#### Regra de dominio para o frontend

- Na listagem de manifestos em contexto de conta CETESB do tipo destinador, as acoes operacionais primarias devem ser:
  - receber MTR;
  - iniciar fluxo de geracao de CDF;
  - visualizar o manifesto.
- A consulta ou baixa de CDF deve existir como area ou aba propria ligada ao fluxo de CDF, nao como acao primaria por linha de manifesto.
- Acoes neutras de leitura, como visualizar e imprimir ou baixar documento ja existente, podem continuar visiveis se nao alterarem o papel operacional do destinador.

### 2. Recebimento deve ser individual, em lote, ou ambos

#### Fato sustentado por evidencia

- As HARs provam recebimento individual de manifesto.
- O contrato interno atual tambem e singular: `POST /v1/manifestos/receive` aceita um unico `receiptPayload`, e o payload remoto observado contem um unico `manifesto`.
- Nao ha evidencia direta de um `POST` remoto unico com varios manifestos sendo recebidos simultaneamente na CETESB.

#### Decisao de politica necessaria para o redesenho

- O frontend deve oferecer ambos:
  - recebimento individual por linha;
  - recebimento em lote a partir da selecao da listagem.
- O recebimento em lote nao deve ser modelado como um unico envio remoto multi-manifesto.
- O recebimento em lote deve ser tratado como orquestracao de varios recebimentos individuais, um comando por manifesto selecionado, preservando feedback por item e consolidado do lote.

#### Regra operacional fechada

- O manifesto continua sendo a unidade atomica de recebimento.
- O lote e apenas uma conveniencia de UX para disparar varios recebimentos atomicos.
- Se algum item do lote nao estiver elegivel, o frontend deve bloquear esse item individualmente, sem inferir um payload remoto de lote inexistente.

### 3. Geracao de CDF deve ser fluxo separado do detalhe e quais insumos minimos precisa

#### Fato sustentado por evidencia

- A HAR de geracao mostra um fluxo proprio de pesquisa de manifestos recebidos para certificado.
- A pesquisa de elegibilidade usa periodo e contexto do destinador no caminho do endpoint.
- Ha consulta previa de responsaveis do destinador.
- A pesquisa aceita lista de parceiros geradores selecionados no corpo.
- A criacao do certificado envia `listaManifesto` com um ou mais MTRs selecionados.

#### Regra de dominio para o frontend

- A geracao de CDF deve sair do detalhe do manifesto e virar fluxo proprio a partir da listagem.
- O detalhe do manifesto pode, no maximo, servir como ponto de entrada para abrir o fluxo de CDF ja com contexto pre-preenchido, mas nao deve continuar como lugar principal de emissao.
- O fluxo de CDF deve ter duas etapas explicitas:
  1. pesquisa de manifestos elegiveis;
  2. selecao e emissao do certificado.

#### Insumos minimos do fluxo

##### Fatos sustentados por evidencia

- contexto do destinador ativo;
- periodo inicial e final;
- manifestos retornados pela pesquisa de MTR recebido;
- selecao de ao menos um manifesto para compor `listaManifesto`;
- responsavel do CDF carregado do destinador.

##### Decisoes de politica para fechar a UX

- O filtro por gerador deve existir, porque e comprovado pela HAR e melhora a selecao, mas deve ser tratado como filtro opcional, nao como precondicao obrigatoria universal.
- O manifesto atual pode ser usado apenas como pre-filtro inicial do fluxo, nunca como substituto da pesquisa e da selecao final.
- A UX deve exigir selecao explicita de MTRs antes da emissao, mesmo que o backend aceite `listaManifesto` vazia e reapure a busca inteira.
- O responsavel deve ser tratado como campo obrigatorio na interface, ainda que a camada atual aceite payload parcial. Isso mantem aderencia ao fluxo observado no SIGOR.

### 4. Regra de elegibilidade de MTR para gerar CDF

#### Fato sustentado por evidencia

- Os MTRs pesquisados para gerar CDF aparecem com `situacaoManifesto.simDescricao = "Recebido"`.
- No fluxo observado de geracao, os MTRs retornados na pesquisa trazem `cdfEmitidoNumero = null`.
- O worker atual reapura a pesquisa de manifestos elegiveis e so envia para geracao manifestos efetivamente retornados por `searchReceivedManifestsForCdf(...)`.

#### Regra operacional fechada

- Um MTR so e elegivel para selecao em CDF quando, ao consultar a pesquisa de manifestos recebidos para certificado:
  - estiver no contexto do destinador ativo;
  - estiver em estado operacional `Recebido`;
  - estiver presente na resposta da pesquisa dentro da janela de periodo e filtros aplicados;
  - nao vier marcado como ja emitido no proprio retorno de elegibilidade, observado na amostra como `cdfEmitidoNumero = null` para itens aptos.
- A fonte de verdade de elegibilidade deve ser sempre a pesquisa remota de manifestos recebidos para CDF, nao a listagem local de manifestos do SICAT isoladamente.

### 5. Um MTR pode pertencer a mais de um CDF ao mesmo tempo

#### O que a evidencia prova

- A evidencia nao prova diretamente a regra juridica completa de exclusividade entre CDFs.
- A evidencia prova o criterio operacional do fluxo observado: os itens candidatos a CDF aparecem sem numero de CDF emitido no retorno de elegibilidade.

#### Decisao de politica para a UX

- O frontend deve tratar o MTR como exclusivo para um unico CDF elegivel por vez.
- Na pratica de interface, um MTR ja associado a CDF emitido nao deve poder ser selecionado novamente enquanto nao voltar a aparecer como elegivel na pesquisa remota.
- O frontend nao deve oferecer selecao duplicada do mesmo MTR em mais de um rascunho local simultaneo do mesmo usuario.

#### Classificacao

- `EVIDENCE-BACKED FACT`: elegibilidade do fluxo observado depende de retorno remoto com MTR `Recebido` e sem indicio de CDF emitido.
- `POLICY DECISION`: assumir exclusividade de participacao do MTR em um unico CDF por vez para fechamento da UX, ate prova contraria mais forte de dominio.

### 6. O que deve permanecer oculto ou indisponivel para destinador

#### Fato sustentado por evidencia e semantica do sistema

- A orquestracao desta demanda e os fluxos HAR analisados separam com clareza o papel do gerador do papel do destinador.
- O backend e o frontend atuais ainda expoem acoes de criacao e replicacao de manifesto na mesma listagem, mas isso reflete estado atual de implementacao, nao a regra operacional validada para o destinador.

#### Regra de dominio para o frontend

- Em modo destinador, devem permanecer ocultas ou indisponiveis as acoes de autoria ou reautoria de MTR, incluindo:
  - replicar manifesto;
  - criar ou gerar novo MTR a partir da listagem do destinador;
  - submeter manifesto como se o destinador fosse o emissor originario;
  - reenviar manifesto com semantica de reenvio do gerador;
  - operacoes em lote equivalentes a gerar, submeter ou replicar MTR.
- Se houver necessidade futura de cancelamento por destinador, isso deve vir respaldado por evidencia especifica propria. Nesta fase, cancelamento nao deve ser promovido como acao operacional primaria do destinador.
- O destinador deve ver apenas acoes coerentes com seu papel operacional de recebimento, consulta e certificacao.

## Matriz de classificacao por ponto pedido

### 1. Quais acoes devem ser visiveis ao destinador na listagem

- `EVIDENCE-BACKED FACT`: receber MTR, consultar fluxo de CDF e visualizar manifesto sao aderentes ao papel observado.
- `POLICY DECISION`: colocar `Gerar CDF` como entrada de fluxo no nivel da listagem, e nao manter emissao dentro do detalhe.

### 2. Recebimento deve ser single, batch, ou ambos

- `EVIDENCE-BACKED FACT`: o recebimento remoto comprovado e singular por manifesto.
- `POLICY DECISION`: a UX deve oferecer ambos, com lote implementado como varios recebimentos singulares.

### 3. CDF deve ser fluxo separado e quais insumos minimos precisa

- `EVIDENCE-BACKED FACT`: o SIGOR usa fluxo proprio com periodo, responsavel, filtro de gerador e selecao de MTRs recebidos.
- `POLICY DECISION`: o frontend deve exigir selecao explicita e responsavel obrigatorio no fluxo novo.

### 4. Regra de elegibilidade de MTR e multipla participacao em CDF

- `EVIDENCE-BACKED FACT`: MTR elegivel aparece como `Recebido` e sem `cdfEmitidoNumero` no retorno observado da pesquisa de CDF.
- `POLICY DECISION`: tratar o MTR como exclusivo para um unico CDF por vez ate nova evidencia.

### 5. O que deve ficar oculto para o destinador

- `EVIDENCE-BACKED FACT`: gerar ou replicar MTR pertence ao dominio do gerador, nao ao fluxo comprovado do destinador.
- `POLICY DECISION`: retirar do destinador qualquer CTA de autoria, replicacao, submissao e reenvio de MTR.

## Riscos e perguntas em aberto

1. A evidencia disponivel nao prova se o filtro de gerador no SIGOR aceita multiplos geradores na mesma interacao ou apenas um por vez; o contrato estrutural aceita lista, mas a amostra observada mostra um gerador selecionado.
2. A evidencia disponivel nao prova formalmente a regra juridica de impossibilidade absoluta de um mesmo MTR compor mais de um CDF em todos os estados de negocio; o que esta provado e o criterio de elegibilidade do fluxo observado.
3. O estado atual do backend e do frontend ainda admite detalhes de contrato que merecem alinhamento posterior, como a divergencia entre valores numericos observados para `tipoCertificadoDestinacao` nas HARs e em partes do contrato interno. A UX nao deve depender desse codigo numerico para decidir comportamento visual.
4. As HARs nao demonstram recebimento remoto multi-manifesto em uma unica requisicao. Qualquer lote no frontend deve continuar sendo apenas um orquestrador de operacoes singulares.

## Limites recomendados para implementacao frontend

- A listagem de manifestos deve ser a origem dos fluxos operacionais do destinador.
- O detalhe do manifesto deve perder a responsabilidade de emitir CDF e, no maximo, abrir a tela propria com pre-filtros.
- O recebimento individual deve existir por linha quando o manifesto tiver identificadores CETESB suficientes.
- O recebimento em lote deve nascer da selecao da grid e disparar uma fila de recebimentos unitarios, com resultado por item.
- O fluxo de CDF deve ser uma tela ou workspace proprio com:
  - periodo obrigatorio;
  - filtro opcional por gerador;
  - lista de MTRs elegiveis;
  - selecao explicita de MTRs;
  - responsavel obrigatorio;
  - area separada para consulta e baixa de certificados emitidos.
- A elegibilidade de MTR para CDF deve ser resolvida sempre a partir da pesquisa remota de manifestos recebidos para certificado.
- O frontend em contexto de conta `receiver` ou destinador deve ocultar acoes de replicacao, submissao, reenvio e criacao de MTR.
- Componentes diretamente impactados na proxima fase de UX:
  - `frontend/src/views/ManifestsView.vue`
  - `frontend/src/views/ManifestDetailView.vue`
  - `frontend/src/components/CetesbOperationalFlowsPanel.vue`
  - fluxo de conta CETESB ativa do tipo destinador em `frontend/src/views/SessionAccountView.vue`

## Validacoes desta fase

- Leitura dos checkpoints `00-orchestration` e `01-source-validation`.
- Cruzamento com contrato interno em `openapi/mtr_automacao_openapi_interna.yaml`.
- Revisao da interface atual e dos pontos de mistura indevida entre detalhe e fluxo operacional em `frontend/src/components/CetesbOperationalFlowsPanel.vue`.
- Revisao da listagem atual de acoes em `frontend/src/views/ManifestsView.vue`.
- Revisao da semantica backend de recebimento singular e elegibilidade de CDF em `src/workers/operation-handlers.ts`.

## Handoff para a proxima fase

- Proxima fase esperada pela orquestracao: `06-frontend-ux`
- Proximo agente recomendado: `frontend-vue-ux-mtr`
- Objetivo da proxima fase:
  - redesenhar a listagem e o fluxo de CDF para aplicar estas regras sem reintroduzir logica de dominio na view;
  - separar claramente operacoes do destinador das acoes de gerador;
  - materializar recebimento individual e em lote como UX sobre operacoes atomicas;
  - retirar geracao de CDF do detalhe do manifesto.