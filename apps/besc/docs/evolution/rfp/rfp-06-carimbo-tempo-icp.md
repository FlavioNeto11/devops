# RFP-06 — Carimbo do tempo ICP-Brasil (RFC 3161) e certificados digitais

> **Aviso** — Este documento é uma **Solicitação de Proposta (RFP)** e tem caráter exclusivamente informativo e preparatório. **NÃO** constitui contrato, carta de intenções ou qualquer vínculo entre as partes; **NÃO** obriga o [CONTRATANTE / RAZÃO SOCIAL] a contratar; e **NÃO** constitui oferta, promessa de oferta ou distribuição de valores mobiliários. A plataforma descrita encontra-se em **MODO DEMONSTRAÇÃO**, 100% off-chain/simulada, com o **gate regulatório interno FECHADO** — não há oferta pública, emissão on-chain real ou movimentação de recursos. Os fornecedores eventualmente citados são **exemplos** de possíveis convidados a cotar, não representando endosso, indicação ou afirmação de contato prévio. As faixas numéricas de "referência interna" são apenas apoio de planejamento, **a confirmar pela proposta**.

## 1. Contexto do projeto

O "Projeto BESC Marketplace" é uma plataforma de tokenização de direitos creditórios vinculados a processos judiciais referentes a ações do antigo Banco do Estado de Santa Catarina (BESC, incorporado pelo Banco do Brasil).

A plataforma já está construída e em operação em **modo demonstração**: atualmente é 100% off-chain e simulada, com o gate regulatório interno fechado. Nenhuma oferta pública, emissão on-chain real ou movimentação de recursos ocorre nesse estágio. O objetivo desta contratação é obter o serviço técnico necessário para viabilizar um **go-live regulado**.

Em termos técnicos resumidos, a arquitetura emprega Kubernetes, PostgreSQL e blockchain permissionada Hyperledger Besu, com contratos no padrão ERC-3643 (tokens de valor mobiliário com identidade e compliance on-chain). Nenhum dado pessoal é gravado on-chain. A plataforma mantém uma **trilha de auditoria append-only (hash-chain)**, cuja raiz precisa ser ancorada externamente de forma periódica e confiável — motivo desta solicitação.

## 2. Objeto da contratação

Contratar, junto a **Autoridade de Carimbo do Tempo (ACT) / Autoridade Certificadora ICP-Brasil**, o fornecimento de:

- **Carimbos do tempo no padrão RFC 3161** para ancoragem externa e periódica da raiz da trilha de auditoria (Merkle root) da plataforma; e
- **Certificados digitais ICP-Brasil** (e-CNPJ / e-CPF em nuvem) para assinatura.

Esta contratação atende a um **requisito técnico do go-live (gap D8)**: garantir a **ancoragem externa da trilha de auditoria**, conferindo prova de existência e integridade temporal independente à cadeia de eventos registrada pela plataforma.

## 3. Escopo e entregáveis

### 3.1 Escopo

1. **Emissão de carimbos do tempo (RFC 3161)** para ancoragem periódica da raiz da trilha de auditoria (Merkle root), com frequência a ser dimensionada pela plataforma (ex.: diária ou horária).
2. **Certificados digitais ICP-Brasil** (e-CNPJ / e-CPF em nuvem) para assinatura.

Ambos os itens estão diretamente amarrados ao **gap D8** do go-live: a ancoragem externa da trilha de auditoria depende de carimbos do tempo confiáveis emitidos por ACT credenciada; a assinatura de artefatos e evidências depende de certificados ICP-Brasil válidos.

### 3.2 Entregáveis

- **Proposta de pacote de carimbos por volume + certificados digitais**, contemplando:
  - Tabela de preços por faixa de volume de carimbos e por titular/ano de certificado;
  - **SLA da ACT** (disponibilidade, latência) e condições de integração via API;
  - Documentação de integração (endpoints RFC 3161, formatos de requisição/resposta, autenticação);
  - Condições comerciais, validade da proposta e política de renovação/reajuste.

## 4. Premissas e informações do projeto

- A plataforma mantém uma **trilha de auditoria append-only (hash-chain)** cuja raiz será ancorada periodicamente por carimbos do tempo RFC 3161.
- O **volume de carimbos** deriva da frequência de ancoragem (por exemplo, diária ou horária) — por isso solicitamos **pacotes por volume**, com faixas/tiers, e não um preço único.
- Nenhum dado pessoal é gravado on-chain; a ancoragem opera apenas sobre hashes/raízes da trilha de auditoria.
- A plataforma permanece em **modo demonstração** (gate regulatório fechado); a contratação visa habilitar tecnicamente o go-live regulado, sem que isso implique, por si só, qualquer oferta ao público.
- Ambiente técnico de referência: Kubernetes, PostgreSQL, Hyperledger Besu, contratos ERC-3643 (contexto apenas informativo).
- **Parâmetros de dimensionamento (a preencher pela plataforma):** frequência de ancoragem alvo [FREQUÊNCIA DE ANCORAGEM — ex.: horária/diária] (driver do volume de carimbos) e número de titulares/signatários para os certificados [Nº DE TITULARES ESTIMADO] (driver do volume de certificados) — **solicitamos que a proposta apresente preços por faixas/tiers** que acomodem a variação desses volumes ao longo do tempo.

## 5. Perguntas que precisamos que a proposta responda

> Cada resposta deve permitir preencher um número de custo (preço, unidade, recorrência e prazo). As "referências internas" citadas são apenas apoio de planejamento, **a confirmar pela proposta**.

1. **Pacotes de carimbos do tempo por volume** — Qual o **preço por pacote de carimbos do tempo (RFC 3161)**, por **faixa de volume mensal** (ex.: até X, X–Y, acima de Y)? Indicar unidade (pacote/faixa), recorrência (mensal/anual) e prazo de ativação. *(Referência interna: cotar pacote por volume — a confirmar.)*
2. **Carimbo avulso e limites** — Qual o **preço por carimbo avulso** e quais os **limites de cada pacote** (excedentes, cobrança marginal por carimbo acima do teto)? Indicar unidade (por carimbo) e recorrência.
3. **Certificado digital para assinatura** — Qual o **preço do certificado digital ICP-Brasil** (e-CNPJ e/ou e-CPF em nuvem), **por titular/ano**? Indicar unidade (por titular), recorrência (anual) e prazo de emissão. *(Referência interna: R$ 120 – 350/ano — a confirmar.)*
4. **SLA, latência e integração** — Quais os **níveis de SLA de disponibilidade e latência da ACT**, e quais as condições e eventuais custos de **integração via API** (setup, tarifação por chamada, ambiente de homologação)? Indicar qualquer custo associado (único/mensal) e prazo de integração.
5. **Renovação, reajuste e validade** — Qual a **política de renovação/reajuste** (índice, periodicidade) e a **validade da proposta**? Indicar recorrência e prazo.

## 6. Preencha e devolva (resumo estruturado)

| Item | Valor proposto | Unidade | Recorrência (única/mensal/anual/por unidade) | Validade da proposta | Observações |
|---|---|---|---|---|---|
| Carimbo de tempo ICP-Brasil (RFC 3161) — pacote por volume | [preencher] | [pacote / faixa de volume] | [única/mensal/anual/por unidade] | [dd/mm/aaaa] | Referência interna: cotar (pacote por volume) — a confirmar pela proposta |
| Certificado ICP-Brasil (assinatura, por titular/ano) | [preencher] | [por titular] | [anual] | [dd/mm/aaaa] | Referência interna: R$ 120 – 350/ano — a confirmar pela proposta |

## 7. Critérios de avaliação

A avaliação das propostas considerará, sem ordem de prevalência rígida e a critério do [CONTRATANTE / RAZÃO SOCIAL]:

- **Credenciamento e conformidade** — ACT/AC devidamente credenciada na ICP-Brasil e aderência ao RFC 3161.
- **Preço e transparência** — clareza da estrutura de preços por faixas/tiers, custos de excedente, integração e renovação.
- **SLA e desempenho técnico** — disponibilidade, latência e robustez da API de carimbo/emissão.
- **Facilidade de integração** — qualidade da documentação, existência de ambiente de homologação e suporte técnico.
- **Escalabilidade** — capacidade de acomodar aumento da frequência de ancoragem e do número de titulares.
- **Validade e condições comerciais** — prazo de validade da proposta, política de reajuste e suporte pós-contratação.

## 8. Prazo e forma de resposta

- **Prazo de resposta:** [PRAZO DE RESPOSTA — sugestão: 15 dias corridos] a contar do recebimento desta solicitação.
- **Formato:** proposta em **PDF**, contemplando a tabela da Seção 6 preenchida e as respostas da Seção 5.
- **Envio para:** [CONTATO — nome, e-mail, telefone].
- **Dúvidas:** poderão ser encaminhadas ao mesmo contato acima até [PRAZO PARA DÚVIDAS — sugestão: 5 dias corridos antes do prazo de resposta].
- Reforça-se que esta RFP **não vincula** as partes, **não constitui contrato** e **não representa oferta de valores mobiliários**; eventual contratação dependerá de instrumento próprio a ser negociado e assinado.

## Referências

- RFC 3161 (Time-Stamp Protocol)
- ITI — Autoridades de Carimbo do Tempo (ICP-Brasil)
