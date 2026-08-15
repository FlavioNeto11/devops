# RFP-07 — Custódia de chaves criptográficas — KMS vs HSM dedicado (ou custodiante)

> **Aviso** — Este documento é uma **Solicitação de Proposta (RFP)** e tem caráter exclusivamente exploratório. **NÃO** constitui contrato, proposta comercial, ordem de compra ou qualquer compromisso vinculante entre as partes, e **NÃO** representa oferta pública ou privada de valores mobiliários. A plataforma objeto deste RFP encontra-se em **MODO DEMONSTRAÇÃO** — 100% off-chain/simulada, com o **gate regulatório interno FECHADO** (nenhuma oferta pública, emissão on-chain real ou movimentação de recursos ocorre). Os fornecedores eventualmente citados são **EXEMPLOS** de possíveis convidados a cotar — não constituem endosso, indicação, recomendação nem afirmação de que já tenham sido contatados. Faixas de valores citadas são **referência interna de planejamento, a confirmar pela proposta**.

## 1. Contexto do projeto

O **Projeto BESC Marketplace** é uma plataforma de tokenização de direitos creditórios ligados a processos judiciais referentes a ações do antigo Banco do Estado de Santa Catarina (BESC, incorporado pelo Banco do Brasil).

A plataforma **já está construída e em operação em modo demonstração**: hoje é integralmente off-chain/simulada, e o gate regulatório interno permanece fechado — não há oferta pública, emissão on-chain real ou movimentação de recursos. O objetivo desta contratação é obter o serviço técnico necessário para viabilizar um **go-live regulado**.

Arquitetura técnica resumida (quando relevante à cotação): orquestração em **Kubernetes**, base de dados **PostgreSQL**, blockchain permissionada **Hyperledger Besu** e contratos no padrão **ERC-3643** (tokens de valor mobiliário com identidade e compliance on-chain). **Nenhum dado pessoal é gravado on-chain.**

## 2. Objeto da contratação

Cotar a **custódia das chaves criptográficas** da operação on-chain do Projeto BESC Marketplace, comparando **KMS gerenciado** e **HSM dedicado (FIPS 140-2/3)**, com **segregação de funções**.

Este RFP atende a um **requisito técnico do go-live (gap D3) — custódia real das chaves de emissão**. As chaves em questão são utilizadas para assinar transações na rede permissionada Besu; por premissa de segurança, **nenhuma chave trafega ou é armazenada em texto claro no código**.

Solicitamos expressamente que a proposta contemple as **DUAS opções (KMS e HSM dedicado)**, de modo a permitir a comparação lado a lado e alimentar o toggle de custódia da nossa planilha de planejamento.

## 3. Escopo e entregáveis

**Escopo:**

- **Opção A — KMS gerenciado** (ex.: AWS/Azure/GCP): guarda de chaves e execução de operações de assinatura.
- **Opção B — HSM dedicado** (ex.: CloudHSM, FIPS 140-2/3), com **alta disponibilidade (2× HSM)**.
- **Segregação de funções**: emissor ≠ compliance ≠ operador — papéis distintos, com chaves e/ou aprovações separadas (idealmente com políticas de quórum M-de-N).

O escopo acima está diretamente vinculado ao **gap D3 (custódia real das chaves de emissão)**, requisito técnico para a liberação do go-live regulado.

**Entregáveis:**

1. **Proposta comparativa KMS vs HSM dedicado**, contendo preço mensal de cada opção e as respectivas capacidades de segregação de funções, em nível de detalhe suficiente para decisão técnica e de compliance.

## 4. Premissas e informações do projeto

- A escolha entre **KMS** e **HSM dedicado** dependerá da exigência de compliance apurada nos **pareceres #5/#6 do gate** — por isso solicitamos **ambas** as opções cotadas.
- As chaves são utilizadas para **assinar transações na rede permissionada Besu**; **nenhuma chave em texto claro no código**.
- A plataforma permanece em **modo demonstração** (gate fechado) até a conclusão do processo de go-live regulado; a contratação visa habilitar a operação real de custódia.
- Volumes de operação (número de chaves e de operações de assinatura) ainda estão em dimensionamento — ver placeholders abaixo. Solicitamos preços em **faixas/tiers**.
  - [Nº DE PROCESSOS ESTIMADO — informar faixa/tier]
  - [Nº DE CHAVES CRIPTOGRÁFICAS ESTIMADO — informar faixa]
  - [VOLUME ESTIMADO DE OPERAÇÕES DE ASSINATURA/MÊS — informar faixa/tier]
- **Referência interna de planejamento (a confirmar pela proposta):**
  - Custódia de chaves — **KMS** — referência interna ~R$ 50 – 300/mês.
  - Custódia de chaves — **HSM dedicado** — referência interna ~R$ 6,5 mil/mês/HSM (×2 HA ≈ R$ 13 mil/mês).
  - *As faixas acima são apenas referência interna de planejamento e não constituem preço fixado, teto ou compromisso — devem ser confirmadas/ajustadas pela proposta.*

## 5. Perguntas que precisamos que a proposta responda

Para cada item, informe **preço, unidade, recorrência e prazo** de forma que possamos preencher um número de custo real na seção 6.

1. **KMS gerenciado — preço mensal:** qual o custo mensal por **chave** e por **volume de operações de assinatura**? Indique unidade (por chave / por 10 mil operações etc.), recorrência e eventuais tiers de volume.
2. **HSM dedicado — preço mensal:** qual o custo mensal **por HSM** e qual o custo adicional para **alta disponibilidade (2× HSM)**? Informe unidade (por HSM), recorrência e custos de provisionamento/setup, se houver.
3. **Segregação de funções e políticas de aprovação:** há suporte a segregação de funções (emissor/compliance/operador) e a políticas de aprovação **M-de-N / quórum**? Detalhe capacidades e eventuais custos adicionais (por política, por papel, por licença).
4. **Certificações e residência de dados:** quais **certificações (FIPS 140-2/3)** são atendidas e há opção de **residência de dados no Brasil (sa-east-1)**? Informe eventual diferença de preço por região.
5. **Custos acessórios (opcional):** existem custos de setup, suporte, migração de chaves, rotação, backup/DR ou SLA premium? Liste com unidade e recorrência.

## 6. Preencha e devolva (resumo estruturado)

Preencha exatamente os itens abaixo. Se um item não se aplicar à sua oferta, indique "N/A".

| Item | Valor proposto | Unidade | Recorrência (única/mensal/anual/por unidade) | Validade da proposta | Observações |
|---|---|---|---|---|---|
| Custódia de chaves — KMS (referência interna ~R$ 50 – 300/mês) | [ ] | [por chave / por volume de operações] | [ ] | [ ] | [ ] |
| Custódia de chaves — HSM dedicado (referência interna ~R$ 6,5 mil/mês/HSM; ×2 HA ≈ R$ 13 mil/mês) | [ ] | [por HSM / conjunto 2× HA] | [ ] | [ ] | [ ] |

## 7. Critérios de avaliação

As propostas serão avaliadas de forma comparativa, considerando (sem ordem de peso predefinida, a critério do [CONTRATANTE / RAZÃO SOCIAL]):

- **Aderência ao escopo e ao gap D3** — capacidade de prover custódia real das chaves de emissão nas duas modalidades solicitadas (KMS e HSM).
- **Compliance e certificações** — FIPS 140-2/3, residência de dados no Brasil (sa-east-1) e adequação às exigências que vierem a ser apuradas nos pareceres #5/#6 do gate.
- **Segregação de funções** — suporte efetivo a papéis distintos (emissor/compliance/operador) e a quórum M-de-N.
- **Custo total de propriedade** — clareza, previsibilidade e competitividade dos preços mensais e acessórios, incluindo o custo de alta disponibilidade.
- **Confiabilidade e SLA** — disponibilidade, redundância, backup/DR e suporte.
- **Clareza da proposta** — completude no preenchimento da seção 6 e transparência nas premissas.

## 8. Prazo e forma de resposta

- **Prazo de resposta:** [PRAZO DE RESPOSTA — sugestão: 15 dias corridos a contar do recebimento deste RFP].
- **Formato:** proposta em **PDF**, contemplando obrigatoriamente as **duas opções (KMS e HSM dedicado)** e a tabela da seção 6 preenchida.
- **Envio para:** [CONTATO — nome, e-mail, telefone].
- **Validade mínima da proposta:** [VALIDADE — sugestão: 30 dias].
- Dúvidas sobre o escopo podem ser encaminhadas ao contato acima antes do prazo final.

*Reiteramos que este RFP não vincula as partes, não constitui contrato nem oferta de valores mobiliários, e que a plataforma permanece em modo demonstração até a conclusão do go-live regulado.*

## Referências

- FIPS 140-2/3 (módulos criptográficos).
- Boas práticas de segregação de funções em custódia de chaves.
