# RFP-05 — Seguros — Responsabilidade Civil Profissional (E&O), Cyber e D&O

> **Aviso** — Este documento é uma **Solicitação de Proposta (RFP)** e tem caráter exclusivamente informativo e preparatório. **Não constitui contrato**, não gera obrigação de contratar para nenhuma das partes e **não vincula** a Contratante nem os convidados a cotar. **Não é oferta, promessa ou solicitação de investimento em valores mobiliários.** A plataforma referida encontra-se em **modo demonstração**, com o gate regulatório interno **fechado** (100% off-chain/simulada, sem oferta pública, emissão on-chain real ou movimentação de recursos). O objetivo desta contratação é obter o serviço necessário para viabilizar um eventual **go-live regulado**. Os fornecedores/segmentos eventualmente citados são **exemplos de possíveis convidados a cotar**, não representando endosso, indicação ou afirmação de que já tenham sido contatados.

## 1. Contexto do projeto

O "Projeto BESC Marketplace" é uma plataforma de **tokenização de direitos creditórios** vinculados a processos judiciais referentes a ações do antigo Banco do Estado de Santa Catarina (BESC, posteriormente incorporado pelo Banco do Brasil).

A plataforma **já está construída e operando em modo demonstração**: atualmente é **100% off-chain e simulada**, e o **gate regulatório interno está fechado** — nenhuma oferta pública, emissão on-chain real ou movimentação de recursos ocorre no ambiente atual.

Do ponto de vista técnico, a arquitetura é composta por **Kubernetes** (orquestração), **PostgreSQL** (dados estruturados), **blockchain permissionada Hyperledger Besu** e **contratos no padrão ERC-3643** (tokens de valor mobiliário com identidade e compliance on-chain). **Nenhum dado pessoal é gravado on-chain.** O tratamento de dados pessoais eventualmente existente ocorre em camada off-chain, sujeito à **LGPD**.

Esta contratação integra o conjunto de providências para viabilizar um **go-live regulado** e responsável.

## 2. Objeto da contratação

Contratação de corretora de seguros para **cotação de apólices** que dão cobertura à operação da plataforma, especificamente:

- **Responsabilidade Civil Profissional (E&O)**;
- **Cyber** (incidentes cibernéticos e vazamento de dados);
- **D&O** (responsabilidade de administradores), quando aplicável.

Este objeto atende ao item do gate: **Requisito de compliance operacional (Faixa C do blueprint)** — cobertura de risco como condição operacional para o go-live regulado.

## 3. Escopo e entregáveis

**Escopo:**

1. Seguro de **Responsabilidade Civil Profissional (E&O)**.
2. Seguro **Cyber** (incidentes cibernéticos e vazamento de dados).
3. Seguro **D&O** (responsabilidade de administradores), **se aplicável** à estrutura da Contratante.

**Entregáveis:**

- **Cotações** contendo, para cada linha de cobertura, os respectivos **prêmios anuais, limites, coberturas e franquias**, apresentadas de forma comparável e itemizada.

O escopo e os entregáveis acima estão diretamente vinculados ao item do gate **"Requisito de compliance operacional (Faixa C do blueprint)"**: a existência de cobertura securitária adequada (E&O, Cyber e, quando cabível, D&O) é tratada como pré-requisito de compliance operacional para o go-live regulado da plataforma.

## 4. Premissas e informações do projeto

- **Natureza da operação:** plataforma de **tokenização/marketplace**, com uso de **blockchain permissionada** (Hyperledger Besu) e **tratamento de dados pessoais** em camada off-chain, sujeito à **LGPD**.
- **Estado atual:** **modo demonstração**, gate regulatório interno **fechado**; sem oferta pública, emissão on-chain real ou movimentação de recursos.
- **Dados on-chain:** nenhum dado pessoal é gravado on-chain.
- **Exposição/faturamento:** derivam de **[FUNDING-ALVO]** — a ser informado quando disponível. Solicita-se que a proposta contemple **faixas/tiers** de exposição, permitindo cotação por patamar.
- **Volumetria:** **[Nº DE PROCESSOS ESTIMADO]** — quando o volume for citado, favor apresentar as condições em **faixas/tiers**, não em valor único.
- **Estrutura societária/administradores:** **[DESCREVER — existência de conselho/administradores para fins de D&O]**, a ser confirmada pela Contratante para avaliar a aplicabilidade do D&O.
- **Referências internas de planejamento** (Faixa C do blueprint) são meramente indicativas e **a confirmar pela proposta** (ver seção 6).

## 5. Perguntas que precisamos que a proposta responda

> Cada resposta deve permitir preencher um número de custo real (preço, unidade, recorrência e prazo). As faixas de referência interna citadas na seção 6 servem apenas como parâmetro de planejamento, **a confirmar pela proposta** — jamais como preço fixado.

1. **Prêmio anual do seguro E&O** (Responsabilidade Civil Profissional): informar o **valor do prêmio anual**, a **moeda**, o **limite de indenização (LMI)**, as **coberturas incluídas** e o **período de vigência**.
2. **Prêmio anual do seguro Cyber**: informar o **valor do prêmio anual**, o **limite de indenização**, as **coberturas** (incidentes cibernéticos, vazamento/violação de dados pessoais — LGPD, resposta a incidentes, extorsão cibernética, interrupção de negócios, etc.) e a **vigência**.
3. **Prêmio anual do seguro D&O** (se aplicável): informar o **valor do prêmio anual**, o **limite de indenização**, as **coberturas** e a **vigência**; caso não aplicável à estrutura atual, indicar as **condições em que passaria a ser recomendado** e a **base de custo estimada**.
4. **Requisitos de contratação/aceitação de risco**: quais **condições e evidências** são exigidas para emitir/aceitar cada apólice (por exemplo: **auditoria de smart contract**, **política de segurança da informação**, **existência de DPO/encarregado**, **plano de resposta a incidentes**, questionários de risco) — e se algum deles impacta **valor do prêmio** ou **franquia** (indicar o **delta de custo**, se houver).
5. **Franquias e principais exclusões** de cada apólice: informar o **valor/percentual de franquia** por linha de cobertura e as **principais exclusões**, especialmente as relativas a **ativos digitais/tokens**, **blockchain**, **oferta de valores mobiliários** e **operação em modo demonstração vs. produção regulada** (indicar como cada cenário afeta o preço).
6. **Estrutura de preço por faixa de exposição/funding**: apresentar a **tabela de prêmios por faixa/tier** de exposição (vinculada a **[FUNDING-ALVO]** e a **[Nº DE PROCESSOS ESTIMADO]**), com **unidade** e **critério de reajuste**.
7. **Recorrência e reajuste**: indicar a **recorrência** do prêmio (anual, mensal, etc.), a **forma de pagamento**, e eventuais **taxas adicionais** (emissão, IOF, corretagem) que compõem o custo final.
8. **Prazos**: **prazo para emissão da cotação**, **prazo para emissão da apólice** após aceite e **validade** de cada cotação apresentada.

## 6. Preencha e devolva (resumo estruturado)

> Referência interna de planejamento (Faixa C do blueprint), **a confirmar pela proposta** — não constitui preço fixado nem teto: **Seguro E&O + Cyber (+ D&O) — R$ 8 mil – 50 mil/ano**.

| Item | Valor proposto | Unidade | Recorrência (única/mensal/anual/por unidade) | Validade da proposta | Observações |
|---|---|---|---|---|---|
| Seguro E&O + Cyber (+ D&O) — referência interna R$ 8 mil – 50 mil/ano | [PREENCHER] | [PREENCHER — ex.: BRL/ano; por faixa de funding] | [PREENCHER — única/mensal/anual/por unidade] | [PREENCHER — ex.: 30 dias] | [PREENCHER — limites, franquias, exclusões, condicionantes de contratação] |

## 7. Critérios de avaliação

As propostas serão avaliadas, sem ordem de precedência rígida e a critério da Contratante, considerando:

- **Adequação das coberturas** ao perfil de risco descrito (tokenização/marketplace, blockchain permissionada, LGPD).
- **Relação custo-benefício**: prêmio anual frente aos limites, franquias e exclusões oferecidos.
- **Amplitude e clareza das coberturas Cyber e E&O** (e D&O, se aplicável), incluindo tratamento de incidentes de dados pessoais.
- **Exequibilidade dos requisitos de contratação** (auditoria de smart contract, política de segurança, DPO, etc.) e seu impacto no custo.
- **Experiência da corretora/seguradora** com clientes de **tecnologia e serviços financeiros**, especialmente ativos digitais.
- **Clareza, comparabilidade e completude** das cotações e da estrutura de preço por faixa/tier.
- **Prazos** de emissão e **validade** da proposta.

## 8. Prazo e forma de resposta

- **Prazo de resposta:** **[PRAZO DE RESPOSTA — sugestão: 15 dias corridos]** a contar do recebimento deste RFP.
- **Formato:** proposta em **PDF**, contendo as cotações itemizadas (seção 3), as respostas às perguntas (seção 5) e o resumo estruturado preenchido (seção 6).
- **Envio e contato:** encaminhar para **[CONTATO — nome, e-mail, telefone]**, em nome de **[CONTRATANTE / RAZÃO SOCIAL]**.
- **Esclarecimentos:** dúvidas sobre este RFP podem ser encaminhadas ao mesmo contato antes do término do prazo de resposta.

Reforça-se que este RFP **não vincula as partes**, **não constitui contrato** e **não representa oferta de valores mobiliários**; a eventual contratação dependerá de instrumento próprio, negociado separadamente.

## Referências

- Boas práticas de gestão de risco cibernético e responsabilidade profissional.
