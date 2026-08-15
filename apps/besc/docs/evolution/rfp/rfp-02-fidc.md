# RFP-02 — Estruturação e administração de FIDC de direitos creditórios não-padronizados (FIDC-NP)

> **Aviso** — Este documento é uma **Solicitação de Proposta (RFP)** de caráter exclusivamente informativo. **Não constitui contrato**, **não vincula** as partes, **não configura** oferta, promessa de contratação ou aceitação, e **não constitui oferta pública de valores mobiliários** nem convite ao investimento. A plataforma objeto deste RFP encontra-se em **modo demonstração** (100% off-chain/simulada), com o **gate regulatório interno FECHADO** — nenhuma oferta pública, emissão on-chain real ou movimentação de recursos ocorre. Os nomes ou perfis de fornecedores eventualmente citados são **exemplos** de possíveis convidados a cotar, **sem** qualquer endosso, indicação ou afirmação de contato prévio. As faixas numéricas apresentadas são **referência interna de planejamento, a confirmar pela proposta**. **Aplicável somente ao cenário "Regulado completo (FIDC-NP)".**

## 1. Contexto do projeto

O "Projeto BESC Marketplace" é uma plataforma de tokenização de direitos creditórios ligados a processos judiciais referentes a ações do antigo Banco do Estado de Santa Catarina (BESC, incorporado pelo Banco do Brasil). A plataforma **já está construída e operando em modo demonstração**: hoje é integralmente off-chain/simulada e o gate regulatório interno está fechado — nenhuma oferta pública, emissão on-chain real ou movimentação de recursos ocorre.

O objetivo desta contratação é obter o parecer e o serviço necessários para viabilizar um **go-live regulado**. Em termos técnicos, quando relevante para a estruturação: a arquitetura prevê Kubernetes, PostgreSQL e blockchain permissionada Hyperledger Besu, com contratos no padrão ERC-3643 (tokens de valor mobiliário com identidade e compliance on-chain). **Nenhum dado pessoal é gravado on-chain.**

Este RFP endereça especificamente o trilho regulatório baseado em **fundo de investimento em direitos creditórios não-padronizados (FIDC-NP)**, no qual os tokens seriam lastreados nas cotas/carteira do fundo.

## 2. Objeto da contratação

Avaliar a viabilidade e cotar a **montagem e a administração de um FIDC-NP** para lastrear os tokens em direitos creditórios judiciais, incluindo a estruturação inicial do veículo e a operação recorrente (administração fiduciária, custódia e auditoria).

Esta contratação atende diretamente ao **Item #3 `fidc_structure` do gate regulatório interno** — etapa exigida **apenas se o trilho regulatório escolhido for o FIDC**. A liberação do gate depende do parecer de viabilidade e da estrutura ora solicitados.

Destinatário desta solicitação: **Administrador fiduciário / estruturador de fundos (FIDC)**.

## 3. Escopo e entregáveis

**Escopo:**

1. **Análise de elegibilidade** dos direitos creditórios (crédito litigioso) para um FIDC-NP, à luz da Resolução CVM 175.
2. **Montagem do veículo:** definição e articulação de administrador, gestor, custodiante e auditor; estruturação de cotas sênior/subordinada.
3. **Operação recorrente:** administração fiduciária, custódia e auditoria anual do fundo.

**Entregáveis:**

- Proposta **all-in de estruturação** e **proposta de administração recorrente**, com papéis e responsabilidades de cada prestador claramente delimitados.

**Amarração ao gate:** o escopo e os entregáveis acima instruem o **Item #3 `fidc_structure`** do gate regulatório interno, cuja abertura é condição para qualquer evolução para o cenário regulado. **Aplicável somente ao cenário "Regulado completo (FIDC-NP)".**

## 4. Premissas e informações do projeto

- **Natureza do lastro:** direitos creditórios judiciais **litigiosos**, o que tende a caracterizar um **FIDC-NP**, tipicamente **restrito a investidor profissional/qualificado**.
- **Dimensionamento (a confirmar):** patrimônio-alvo do fundo derivado de **[FUNDING-ALVO]**; carteira derivada de **[Nº DE PROCESSOS ESTIMADO]**. Solicitamos que os números de custo sejam apresentados em **faixas/tiers** conforme o porte.
- **Estágio da plataforma:** modo demonstração, off-chain, com gate regulatório fechado; a contratação visa exclusivamente ao go-live regulado.
- **Arquitetura de emissão (contexto):** tokens no padrão ERC-3643 sobre Hyperledger Besu, sem dado pessoal on-chain — a estruturação deve considerar a interação entre a titularidade das cotas/carteira do fundo e a representação tokenizada.
- **Referência interna de planejamento (a confirmar pela proposta):**
  - Estruturação inicial de FIDC — **R$ 100 mil – 300 mil+** (valor único, referência interna).
  - Taxa de administração do FIDC — **0,8% – 2,0% a.a. sobre o PL**, com piso mensal de **~R$ 8 mil – 20 mil/mês** (referência interna).
  - Auditoria anual do FIDC — **R$ 50 mil – 150 mil/ano** (referência interna).

  > Estes valores são **referência interna de planejamento**, citados apenas para calibrar a leitura — **não** são preços fixados e devem ser **confirmados/ajustados pela proposta**.

## 5. Perguntas que precisamos que a proposta responda

Para cada item abaixo, informe **valor, unidade, recorrência e prazo** aplicáveis; sempre que o valor variar com o porte, apresente **faixas/tiers**.

1. **Estruturação inicial do FIDC-NP:** qual o **custo de montagem/estruturação** (valor único, em R$)? Discrimine o que está incluído (elegibilidade, regulamento, articulação de prestadores) e o **prazo de montagem** (em dias).
2. **Taxa de administração recorrente:** qual o **percentual a.a. sobre o PL** e o **piso mensal em R$**? Indique como a taxa escala por faixa de PL.
3. **Auditoria anual obrigatória:** qual o **custo da auditoria anual** do fundo (R$/ano)? É cotado por você ou por prestador à parte?
4. **Custodiante e demais prestadores:** qual o **custo do custodiante** e dos demais prestadores (gestor, escriturador, controladoria), se cotados à parte? Informe valor, unidade e recorrência de cada um.
5. **Viabilidade econômica e prazo:** qual o **PL mínimo economicamente viável** do fundo (em R$) e o **prazo total de montagem** (em dias) até o fundo apto a operar?

## 6. Preencha e devolva (resumo estruturado)

| Item | Valor proposto | Unidade | Recorrência (única/mensal/anual/por unidade) | Validade da proposta | Observações |
|---|---|---|---|---|---|
| Estruturação inicial de FIDC | [R$ ___] | [R$] | [única] | [dd/mm/aaaa] | [referência interna: R$ 100 mil – 300 mil+, a confirmar] |
| Taxa de administração FIDC | [___% a.a. / piso R$ ___] | [% a.a. sobre PL / R$ por mês] | [anual/mensal] | [dd/mm/aaaa] | [referência interna: 0,8% – 2,0% a.a., piso ~R$ 8–20 mil/mês, a confirmar] |
| Auditoria anual do FIDC | [R$ ___] | [R$] | [anual] | [dd/mm/aaaa] | [referência interna: R$ 50 mil – 150 mil/ano, a confirmar] |

## 7. Critérios de avaliação

As propostas serão avaliadas de forma comparativa, considerando:

- **Aderência regulatória:** consistência da análise de elegibilidade do crédito litigioso ao FIDC-NP e à Resolução CVM 175.
- **Completude do escopo:** cobertura de todos os prestadores (administrador, gestor, custodiante, auditor) e clareza dos papéis e responsabilidades.
- **Competitividade e transparência de custos:** valor all-in de estruturação, taxa de administração recorrente e custos de auditoria/custódia, com faixas/tiers bem definidos.
- **Prazo de montagem** e **PL mínimo viável** propostos.
- **Experiência comprovada** em estruturação e administração de fundos com lastro em **créditos judiciais**.
- **Solidez operacional** e capacidade de suporte recorrente ao longo da vida do fundo.

> A avaliação **não** gera obrigação de contratar nem vincula o [CONTRATANTE / RAZÃO SOCIAL] a qualquer proponente.

## 8. Prazo e forma de resposta

- **Prazo de resposta:** [PRAZO DE RESPOSTA — sugestão: 15 dias corridos] a contar do recebimento deste RFP.
- **Formato:** proposta em **PDF**, contemplando a tabela da Seção 6 preenchida e as respostas da Seção 5.
- **Envio e contato:** encaminhar para **[CONTATO — nome, e-mail, telefone]**.
- **Validade:** indicar a **validade da proposta** (data-limite) para cada item cotado.
- **Esclarecimentos:** dúvidas sobre este RFP podem ser dirigidas ao contato acima antes do encerramento do prazo.

> Reiteramos: este RFP **não** é contrato, **não** vincula as partes e **não** constitui oferta de valores mobiliários. A plataforma permanece em **modo demonstração** com o gate regulatório fechado. **Aplicável somente ao cenário "Regulado completo (FIDC-NP)".**

## Referências

- **Resolução CVM 175** (fundos de investimento; anexo normativo aplicável a FIDC / FIDC-NP).
