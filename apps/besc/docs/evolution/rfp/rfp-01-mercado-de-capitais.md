# RFP-01 — Assessoria jurídica de mercado de capitais — enquadramento e estruturação da oferta

> **Aviso** — Este documento é uma **Solicitação de Proposta (RFP)** e tem finalidade exclusiva de coleta de propostas comerciais. **Não constitui contrato**, não vincula as partes, não gera obrigação de contratar e **não constitui oferta, promessa de oferta ou distribuição de valores mobiliários**. A plataforma descrita encontra-se em **modo demonstração**, 100% off-chain/simulada, com o **gate regulatório interno FECHADO** — não há, nesta fase, qualquer oferta pública, emissão on-chain real ou movimentação de recursos. Os nomes ou tipos de fornecedores eventualmente citados são **meros exemplos** de possíveis convidados a cotar; sua menção **não representa endosso, indicação, preferência nem afirmação de contato prévio**. As faixas de valor porventura mencionadas são **referência interna de planejamento, a confirmar pela proposta**.

## 1. Contexto do projeto

O "Projeto BESC Marketplace" é uma plataforma de **tokenização de direitos creditórios** ligados a processos judiciais referentes a ações do antigo Banco do Estado de Santa Catarina (BESC, posteriormente incorporado pelo Banco do Brasil).

A plataforma **já está construída e em operação em modo demonstração**: hoje é integralmente off-chain e simulada, e o **gate regulatório interno está fechado**. Nenhuma oferta pública, emissão on-chain real ou movimentação de recursos ocorre nesta fase.

O objetivo desta contratação é obter o **parecer e a assessoria jurídica** necessários para viabilizar um **go-live regulado** — ou seja, a transição do modo demonstração para uma operação em conformidade com o arcabouço regulatório aplicável.

Quando relevante para a análise jurídica, registra-se o resumo técnico da arquitetura: orquestração em Kubernetes, base de dados em PostgreSQL, blockchain permissionada Hyperledger Besu e contratos no padrão **ERC-3643** (tokens de valor mobiliário com identidade e compliance on-chain). **Nenhum dado pessoal é gravado on-chain.**

## 2. Objeto da contratação

Contratação de **escritório de advocacia de mercado de capitais**, com atuação junto à CVM e experiência em tokenização, para:

1. **Emissão de parecer de enquadramento do ativo** (o token é ou não valor mobiliário); e
2. **Assessoria na estruturação regulatória da oferta e do veículo**.

Este é o **caminho crítico** do projeto: sem o enquadramento e a definição do rito de oferta, nenhuma decisão de produto, tecnologia ou funding pode avançar em direção ao go-live regulado.

Os serviços deste RFP alimentam diretamente o **gate regulatório interno** da plataforma, especificamente:

- **Item #1 — `is_security`**: definição sobre se o ativo é valor mobiliário.
- **Item #2 — `offer_registration`**: definição do rito de oferta cabível.
- **Fronteira do Item #4 — `vasp_bcb`**: delimitação da competência CVM × BCB (valor mobiliário vs. ativo virtual).
- **Item #7 — `taxation`** (cotado à parte): parecer tributário sobre as duas receitas da plataforma e o ganho de capital dos titulares/investidores.

## 3. Escopo e entregáveis

### 3.1 Escopo

1. **Parecer de enquadramento do ativo (alimenta o gate #1 `is_security`)** — análise sobre se o token constitui valor mobiliário, aplicando o teste do **contrato de investimento coletivo** (CVM Parecer de Orientação 40), com **classificação pela essência econômica** do ativo e do arranjo.

2. **Parecer sobre o rito de oferta (alimenta o gate #2 `offer_registration`)** — análise do rito cabível: **registro** (Res. CVM 160) vs. **crowdfunding** (Res. CVM 88) vs. **hipóteses de dispensa**; identificação de **tetos, limites por investidor** e **riscos da circulação secundária** dos tokens.

3. **Opinião sobre a fronteira CVM × BCB (alimenta a fronteira do gate #4 `vasp_bcb`)** — análise, à luz da **Lei 14.478/2022** e da **Res. BCB 519/2025** (Marco de Ativos Virtuais / VASP), sobre se o ativo se classifica como **valor mobiliário** (competência CVM) ou como **ativo virtual** (competência BCB), reconhecendo que essa fronteira **redefine o produto inteiro**.

4. **Parecer tributário (alimenta o gate #7 `taxation`) — cotado à parte** — enquadramento fiscal das **duas receitas da plataforma** (taxa de primeira transferência e aluguel dos tokens), tributação do **ganho de capital** de titulares e investidores (PF/PJ) e obrigações acessórias junto à RFB. Pode ser emitido pela prática tributária do próprio escritório ou por tributarista parceiro — em qualquer caso, com responsável técnico identificado.

5. **(Opcional) Parecer de certeza/exigibilidade por caso** — análise individual, por processo judicial, da certeza e exigibilidade do crédito litigioso subjacente, ofertável como **serviço recorrente por processo**.

### 3.2 Entregáveis

- **Pareceres assinados por advogado(a) habilitado(a) (OAB)**, contendo **data**, **delimitação de escopo** e **responsável técnico identificado**.
- Cada parecer deve indicar de forma clara as **premissas adotadas**, as **fontes normativas** e o **grau de certeza/ressalvas** da conclusão.

## 4. Premissas e informações do projeto

- **Lastro do ativo**: direitos creditórios ligados a processos judiciais litigiosos (**crédito litigioso**).
- **Estágio atual**: plataforma em **modo demonstração**, off-chain, com **gate regulatório fechado** — nenhuma oferta real, emissão on-chain ou movimentação de recursos.
- **Gate regulatório**: a plataforma modela internamente um "gate regulatório" composto por **7 pareceres**; os serviços deste RFP alimentam os itens **#1 (`is_security`)**, **#2 (`offer_registration`)**, **#7 (`taxation`, cotado à parte)** e a **fronteira do #4 (`vasp_bcb`)**.
- **Modelo de receita** (relevante ao parecer tributário): taxa de primeira transferência (saída da tesouraria) + aluguel dos tokens, com contabilidade de dupla entrada append-only.
- **Arquitetura técnica** (quando relevante): Kubernetes, PostgreSQL, Hyperledger Besu (permissionada), contratos ERC-3643; **sem dados pessoais on-chain**.
- **Volumes a confirmar pelo contratante**: **[Nº DE PROCESSOS ESTIMADO]** (informar em **faixas/tiers**) e **[FUNDING-ALVO]** (informar em **faixas/tiers**).
- **Contratante**: [CONTRATANTE / RAZÃO SOCIAL].

## 5. Perguntas que precisamos que a proposta responda

Para cada item abaixo, a proposta deve permitir preencher um **número de custo** (valor, unidade, recorrência e prazo). Onde houver mais de um modelo possível de cobrança, indicar o preferencial e as alternativas.

1. **Honorário do parecer de enquadramento (`is_security`)**: qual o valor e a **forma de cobrança** (fixo, por hora ou por êxito)? Se por hora, informe o **valor-hora** e a **estimativa de horas**; se por êxito, informe o **percentual/base de cálculo**.
2. **Honorário da estruturação regulatória da oferta/veículo**: qual o valor, o **escopo incluído** e a **forma de cobrança**? Detalhe o que está e o que **não** está compreendido (ex.: elaboração de documentos, interlocução com CVM, revisões).
3. **Fronteira CVM × BCB (`vasp_bcb`)**: essa opinião está **inclusa** no escopo dos itens anteriores ou é **cotada à parte**? Se à parte, informe o **valor** e a forma de cobrança.
4. **Parecer tributário (`taxation`)**: qual o **valor** e a forma de cobrança do parecer sobre as duas receitas + ganho de capital? É emitido pela prática tributária do próprio escritório ou por parceiro?
5. **Prazo estimado (em dias)** para a entrega de **cada** parecer, contado a partir do aceite e do recebimento das informações necessárias.
6. **Parecer de certeza/exigibilidade por processo** (se ofertado como serviço recorrente): qual o **custo por processo**, a **unidade** (por processo) e a **recorrência** (única ou por lote), além do **prazo por unidade**? Há **desconto por volume/tier**?

> As faixas de valor eventualmente conhecidas pelo contratante são **referência interna de planejamento, a confirmar pela proposta** — não constituem preço fixado nem teto/piso.

## 6. Preencha e devolva (resumo estruturado)

| Item | Valor proposto | Unidade | Recorrência (única/mensal/anual/por unidade) | Validade da proposta | Observações |
|---|---|---|---|---|---|
| Parecer jurídico de enquadramento (`is_security`) — *referência interna R$ 30 mil – 150 mil, a confirmar* | [ ] | [ ] | [ ] | [ ] | [ ] |
| Parecer tributário (`taxation` — 2 receitas + ganho de capital) — *referência interna R$ 20 mil – 100 mil, a confirmar* | [ ] | [ ] | [ ] | [ ] | [ ] |
| Estruturação regulatória da oferta/veículo — *referência interna R$ 150 mil – 500 mil+, a confirmar* | [ ] | [ ] | [ ] | [ ] | [ ] |
| Parecer de certeza/exigibilidade (por processo) — *referência interna R$ 2 mil – 10 mil+, a confirmar* | [ ] | [ ] | [ ] | [ ] | [ ] |

> As referências em itálico são **planejamento interno, a confirmar pela proposta**, e **não** vinculam o proponente nem o contratante.

## 7. Critérios de avaliação

As propostas serão avaliadas de forma comparativa, considerando (sem ordem de peso predefinida, a critério do contratante):

1. **Experiência comprovada** em mercado de capitais junto à CVM, especialmente em **contrato de investimento coletivo / tokens** (Parecer de Orientação 40) e na **fronteira CVM × BCB**.
2. **Qualidade técnica e clareza** da abordagem proposta, incluindo tratamento explícito de ressalvas e riscos.
3. **Adequação do escopo** aos itens do gate regulatório (#1, #2, #7 e fronteira do #4).
4. **Prazo de entrega** de cada parecer.
5. **Estrutura de honorários** — transparência, previsibilidade e razoabilidade da forma de cobrança.
6. **Responsável técnico identificado** e disponibilidade da equipe.
7. **Capacidade de priorização** — dada a natureza de **caminho crítico** desta contratação.

## 8. Prazo e forma de resposta

- **Prazo de resposta**: [PRAZO DE RESPOSTA — sugestão: 15 dias corridos], contados do recebimento deste RFP.
- **Formato**: proposta em **PDF**, assinada, contendo a **tabela da Seção 6 preenchida** e as respostas às perguntas da Seção 5.
- **Envio e dúvidas**: [CONTATO — nome, e-mail, telefone].
- **Prioridade**: **este RFP destrava o caminho crítico do projeto** — solicitamos, cordialmente, **prioridade de resposta** e, se possível, a indicação de prazo para uma **primeira devolutiva** ainda que preliminar.
- **Validade da proposta**: indicar na tabela da Seção 6 (campo "Validade da proposta").

> Reforçamos: este documento **não é contrato, não vincula as partes e não constitui oferta de valores mobiliários**. A eventual contratação dependerá de instrumento próprio a ser celebrado entre as partes.

## Referências

- **CVM Parecer de Orientação 40** — contrato de investimento coletivo / tokens.
- **Res. CVM 88** (crowdfunding, em reforma — consulta pública 2025) · **Res. CVM 160** (ofertas) · **Res. CVM 175** (fundos/FIDC).
- **Lei 14.478/2022** e **Res. BCB 519/2025** — Marco de Ativos Virtuais / VASP (vigente em 02/02/2026).
