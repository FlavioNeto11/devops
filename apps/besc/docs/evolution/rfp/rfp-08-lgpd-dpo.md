# RFP-08 — Programa de LGPD e DPO as a Service

> **Aviso** — Este documento é uma **Solicitação de Proposta (RFP)** e tem finalidade exclusivamente de cotação. **NÃO é contrato**, **NÃO vincula** as partes, **NÃO constitui oferta de valores mobiliários** e não gera qualquer obrigação de contratação. A plataforma objeto deste RFP encontra-se em **MODO DEMONSTRAÇÃO**, 100% off-chain/simulada, com o **gate regulatório interno FECHADO** — não há oferta pública, emissão on-chain real ou movimentação de recursos. Os nomes de fornecedores eventualmente mencionados são **exemplos** de possíveis convidados a cotar, sem qualquer endosso, indicação ou afirmação de contato prévio. As faixas de valor citadas são **referência interna de planejamento, a confirmar pela proposta**.

**Destinatário:** Consultoria de privacidade / DPO as a Service
**Contratante:** [CONTRATANTE / RAZÃO SOCIAL]
**Contato para esta RFP:** [CONTATO — nome, e-mail, telefone]
**Data de emissão:** [DATA]
**Prazo de resposta:** [PRAZO DE RESPOSTA — sugestão: 15 dias corridos]

---

## 1. Contexto do projeto

O "Projeto BESC Marketplace" é uma plataforma de tokenização de direitos creditórios ligados a processos judiciais referentes a ações do antigo Banco do Estado de Santa Catarina (BESC, posteriormente incorporado pelo Banco do Brasil).

A plataforma **já está construída e operando em modo demonstração**: hoje é **100% off-chain/simulada**, e o **gate regulatório interno está fechado** — nenhuma oferta pública, emissão on-chain real ou movimentação de recursos ocorre no ambiente atual. O objetivo desta contratação é obter os serviços necessários para viabilizar um **go-live regulado**, em conformidade com a legislação aplicável.

Em termos técnicos resumidos (quando relevante para o escopo de privacidade): a solução roda sobre Kubernetes e PostgreSQL, com blockchain permissionada Hyperledger Besu e contratos no padrão ERC-3643 (tokens de valor mobiliário com identidade e compliance on-chain). **Por design, nenhum dado pessoal é gravado on-chain** — os dados pessoais de titulares e investidores são tratados exclusivamente nas camadas off-chain da plataforma.

## 2. Objeto da contratação

Contratação de **setup do programa de LGPD** e do **serviço recorrente de DPO (encarregado) as a service**, de modo a estabelecer e manter a conformidade da plataforma com a Lei nº 13.709/2018 (LGPD) e as orientações da ANPD, endereçando o tratamento de dados pessoais de titulares e investidores no contexto do go-live regulado.

Esta contratação atende ao **Item #6 (lgpd) do gate regulatório interno** e é **complementar aos 7 RFPs do blueprint**, com o propósito específico de **fechar as linhas de LGPD/DPO da planilha de planejamento**, tornando-as cotáveis.

## 3. Escopo e entregáveis

### 3.1 Escopo

**A. Setup de LGPD (projeto de implantação, valor único)**
- Mapeamento de dados (ROPA — Registro das Operações de Tratamento), abrangendo titulares e investidores.
- Definição/validação das **bases legais** de tratamento por finalidade.
- Elaboração de **políticas** (privacidade, tratamento, cookies, retenção e segurança da informação, conforme aplicável).
- Diretrizes de **minimização** e **retenção** por categoria de dado.
- **Relatório de Impacto à Proteção de Dados Pessoais (RIPD)**.

**B. DPO as a Service (serviço recorrente, mensalidade)**
- **Encarregado designado** (DPO) como ponto de contato.
- **Atendimento a titulares** (exercício de direitos).
- **Interlocução com a ANPD**.
- Tratamento e resposta a **incidentes** de segurança envolvendo dados pessoais, conforme escopo e SLA a serem propostos.

### 3.2 Entregáveis

- **Proposta de setup** do programa de LGPD (valor único), incluindo mapeamento de dados (ROPA), políticas, definição de bases legais, diretrizes de minimização/retenção e **RIPD**.
- **Mensalidade de DPO as a service**, com escopo de atendimento (titulares, ANPD, incidentes) e SLA claramente definidos.

## 4. Premissas e informações do projeto

- A plataforma trata **dados pessoais de titulares e investidores**; **por design, nenhum dado pessoal é gravado on-chain**.
- É necessário **RIPD** e **política de retenção por categoria de dado**.
- A plataforma opera atualmente em **modo demonstração** (gate regulatório fechado); o serviço visa habilitar o **go-live regulado**.
- Ambiente técnico off-chain: Kubernetes e PostgreSQL (camadas onde os dados pessoais são efetivamente tratados).
- Volume estimado de escala a confirmar: **[Nº DE PROCESSOS ESTIMADO]** e **[Nº ESTIMADO DE TITULARES/INVESTIDORES]** — solicita-se, sempre que possível, a estruturação de valores em **faixas/tiers**.
- Este RFP é **complementar** aos 7 RFPs do blueprint, destinado a fechar as linhas de LGPD/DPO da planilha.

## 5. Perguntas que precisamos que a proposta responda

> As faixas de valor da nossa referência interna de planejamento (ver seção 6, coluna Observações) servem apenas como **parâmetro a confirmar** — jamais como preço fixado. Responda com **números reais**, indicando **valor, unidade, recorrência e prazo**.

1. **Setup do programa de LGPD** — qual o **valor único** para o pacote completo (mapeamento de dados/ROPA, políticas, definição de bases legais, diretrizes de minimização/retenção e RIPD)? Informe valor, unidade (projeto/pacote), recorrência (única) e **prazo de execução** em dias/semanas.
2. **DPO as a service** — qual a **mensalidade** do serviço de encarregado? Informe valor, unidade (mês), recorrência (mensal), período mínimo de contratação e reajuste aplicável.
3. **Escopo do atendimento e SLA** — qual o escopo detalhado do atendimento (titulares, ANPD, incidentes) e os respectivos **SLAs** (prazos de resposta, janelas de atendimento, canais)? Há limites de volume (ex.: nº de solicitações de titulares/mês) e **custo por unidade excedente**? Informe valor por unidade excedente, quando houver.
4. **RIPD e entregáveis de setup** — o RIPD e demais entregáveis estão integralmente incluídos no valor único do setup, ou há itens cobrados à parte? Se houver, liste-os com valor e unidade.
5. **Revisões e atualizações** — atualizações de políticas/ROPA/RIPD após o setup estão incluídas na mensalidade de DPO ou são cobradas separadamente? Informe valor, unidade e recorrência (ex.: anual/por revisão).
6. **Serviços eventuais** — treinamentos, resposta a incidentes de maior complexidade, apoio a fiscalização/ANPD ou horas adicionais de consultoria: informe **valor por hora/por evento** e condições.
7. **Modelo de faixas/tiers** — como a proposta escala em função do volume de tratamento de dados (**[Nº DE PROCESSOS ESTIMADO]** e **[Nº ESTIMADO DE TITULARES/INVESTIDORES]**)? Apresente, se possível, **faixas/tiers** com os respectivos valores.
8. **Validade da proposta** — por quanto tempo os valores propostos permanecem válidos?

## 6. Preencha e devolva (resumo estruturado)

| Item | Valor proposto | Unidade | Recorrência (única/mensal/anual/por unidade) | Validade da proposta | Observações |
|---|---|---|---|---|---|
| Programa LGPD (setup) — mapeamento/ROPA, políticas, bases legais, RIPD | [preencher] | [projeto/pacote] | única | [dd/mm/aaaa] | Referência interna de planejamento (a confirmar): R$ 20 mil – 80 mil |
| DPO as a service | [preencher] | [mês] | mensal | [dd/mm/aaaa] | Referência interna de planejamento (a confirmar): R$ 2,5 mil – 6,5 mil/mês |
| Serviços eventuais / horas adicionais (opcional) | [preencher] | [hora/evento] | por unidade | [dd/mm/aaaa] | Preencher se aplicável |

## 7. Critérios de avaliação

A avaliação das propostas considerará, de forma não exclusiva e sem obrigatoriedade de contratação:

- **Competência e experiência comprovada** em LGPD e em atuação como encarregado (DPO), preferencialmente com casos no setor financeiro, de mercado de capitais e/ou de ativos digitais/tokenização.
- **Adequação e completude do escopo** face aos entregáveis (ROPA, políticas, bases legais, minimização/retenção, RIPD) e ao serviço recorrente de DPO.
- **Clareza e robustez dos SLAs** de atendimento a titulares, ANPD e incidentes.
- **Custo-benefício** (valor único de setup e mensalidade de DPO) e **transparência** da estrutura de preços, inclusive faixas/tiers e itens excedentes.
- **Metodologia, cronograma e capacidade de atendimento**, incluindo dimensionamento de equipe e substituição do encarregado.
- **Referências e conformidade** com as orientações da ANPD.

## 8. Prazo e forma de resposta

- **Prazo de resposta:** [PRAZO DE RESPOSTA — sugestão: 15 dias corridos] a contar do recebimento desta RFP.
- **Formato:** proposta em **PDF**, contemplando os itens da seção 6 devidamente preenchidos e as respostas às perguntas da seção 5.
- **Envio para:** [CONTATO — nome, e-mail, telefone].
- **Dúvidas:** encaminhar ao mesmo contato acima dentro do prazo de resposta.
- **Validade mínima sugerida da proposta:** [VALIDADE — sugestão: 60 dias].

Reforça-se que esta RFP **não vincula** as partes, **não constitui contrato** e **não representa oferta de valores mobiliários**; a eventual contratação dependerá de negociação e instrumento próprio a ser celebrado entre as partes.

## Referências

- Lei nº 13.709/2018 (Lei Geral de Proteção de Dados Pessoais — LGPD).
- Orientações da ANPD sobre RIPD (Relatório de Impacto à Proteção de Dados Pessoais) e sobre o encarregado (DPO).
