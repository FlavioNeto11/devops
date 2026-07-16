# RFP-04 — Auditoria de segurança dos smart contracts (suíte ERC-3643 lite)

> **Aviso** — Este documento é uma **Solicitação de Proposta (RFP)** e tem finalidade exclusivamente informativa e de cotação. **Não é contrato, não vincula as partes, não gera obrigação de contratar e não constitui oferta, promessa ou solicitação de valores mobiliários.** A plataforma descrita encontra-se em **modo demonstração**, 100% off-chain/simulada, com o **gate regulatório interno FECHADO** — não há oferta pública, emissão on-chain real nem movimentação de recursos. Os nomes de fornecedores eventualmente citados são **exemplos** de possíveis convidados a cotar; **não** representam endosso, indicação, preferência ou afirmação de que já foram contatados. Faixas numéricas citadas são **referência interna de planejamento, a confirmar pela proposta**.

## 1. Contexto do projeto

O "Projeto BESC Marketplace" é uma plataforma de **tokenização de direitos creditórios** vinculados a processos judiciais referentes a ações do antigo Banco do Estado de Santa Catarina (BESC, posteriormente incorporado pelo Banco do Brasil).

A plataforma **já está construída e em operação em modo demonstração**: atualmente é **100% off-chain/simulada**, e o **gate regulatório interno está fechado** — nenhuma oferta pública, emissão on-chain real ou movimentação de recursos ocorre no ambiente atual.

A presente contratação integra o conjunto de providências necessárias para viabilizar um **go-live regulado**. Do ponto de vista técnico (resumo, quando pertinente à auditoria): a solução roda sobre **Kubernetes** e **PostgreSQL**, e a camada on-chain prevista utiliza **blockchain permissionada Hyperledger Besu** com contratos no padrão **ERC-3643** (tokens de valor mobiliário com identidade e compliance on-chain). **Nenhum dado pessoal é gravado on-chain.**

## 2. Objeto da contratação

Contratação de **firma de auditoria de smart contracts** para realizar a **auditoria de segurança da suíte de contratos ERC-3643 lite** que substituirá o registro atualmente em uso, **antes de qualquer emissão on-chain real**.

Este objeto atende a um **requisito técnico do go-live (gap D4)** e constitui **pré-condição para operar com valor real**. Enquanto a auditoria e as respectivas correções não estiverem concluídas, a plataforma permanece em modo demonstração.

> **Ênfase de escopo:** o objeto desta auditoria é a **suíte ERC-3643 lite** (padrão de security token permissionado), **e não** o registro custom atualmente em uso (`TitleRegistry.sol`), que será **elevado/substituído** por essa suíte. A auditoria deve incidir sobre o código-alvo ERC-3643 lite.

## 3. Escopo e entregáveis

**Escopo:**

1. **Auditoria de segurança da suíte ERC-3643 lite**, cobrindo:
   - **Token de valor mobiliário** (base ERC-20 com restrições de transferência/compliance);
   - **IdentityRegistry** (registro de identidades on-chain);
   - **Módulos de compliance** (**ModularCompliance** e módulos associados).
2. **Relatório de auditoria** com **achados classificados por severidade** e **recomendações** de correção.
3. **Reauditoria das correções** aplicadas pela equipe do projeto (**informar na proposta se está inclusa** e, se não, o custo correspondente).

**Entregáveis:**

- **Relatório de auditoria assinado** pela firma, contendo achados por severidade, evidências e recomendações.
- **Relatório de reauditoria pós-correções** (escopo/condições a confirmar na proposta).

O vínculo destes entregáveis ao **gap D4** deve ser explícito: o parecer resultante é insumo direto para a decisão interna de **abertura do gate regulatório** e operação com valor real.

## 4. Premissas e informações do projeto

- Contratos escritos em **Solidity**, implantados em **rede permissionada Hyperledger Besu (consenso QBFT)**.
- Suíte da ordem de **~3 contratos principais + interfaces**. Hoje existe um **registro custom (`TitleRegistry.sol`)** que **será elevado ao padrão ERC-3643 lite** — a auditoria recai sobre a **suíte ERC-3643 lite**, não sobre o registro custom atual.
- **Nenhum dado pessoal é gravado on-chain.**
- A **base de código** será compartilhada **sob NDA** com o fornecedor selecionado para cotação/execução.
- **Volumes e parâmetros de negócio** (ex.: [Nº DE PROCESSOS ESTIMADO], [FUNDING-ALVO]) serão informados sob demanda em **faixas/tiers**, e não impactam diretamente o escopo técnico da auditoria de contratos, salvo indicação em contrário na proposta.

## 5. Perguntas que precisamos que a proposta responda

> Cada resposta deve permitir preencher um **número de custo** (preço, unidade, recorrência e prazo). As faixas de referência interna citadas neste RFP são **apenas referência de planejamento, a confirmar pela proposta** — não constituem preço fixado.

1. **Preço por auditoria** para o escopo descrito na Seção 3. Informar a **premissa adotada** (nº de contratos e/ou linhas de código consideradas), a **unidade** de precificação (por auditoria / por contrato / por hora) e eventual variação por faixa de tamanho da suíte.
2. **Reauditoria após correções:** está **inclusa** no preço acima? Se **não**, qual o **custo adicional** (valor, unidade e nº de ciclos de reauditoria incluídos)?
3. **Prazo estimado** (em **dias corridos/úteis**) da auditoria e da reauditoria, e **formato do relatório** entregue.
4. **Experiência específica com o padrão ERC-3643** (security tokens permissionados / T-REX): projetos anteriores, escopo comparável e credenciais da equipe alocada (impacto no preço/prazo, se houver).
5. **Condições comerciais complementares** que afetem o número final: **validade da proposta**, **forma/cronograma de pagamento**, **impostos/tributos** inclusos ou não, e eventuais **custos extras** (retest adicional, ferramentas, viagens, etc.).

## 6. Preencha e devolva (resumo estruturado)

| Item | Valor proposto | Unidade | Recorrência (única/mensal/anual/por unidade) | Validade da proposta | Observações |
|---|---|---|---|---|---|
| Auditoria de smart contract ERC-3643 — *referência interna R$ 55 mil – 275 mil+ por auditoria* (a confirmar pela proposta) | [PREENCHER] | [por auditoria / por contrato / hora] | [única / por unidade] | [dd/mm/aaaa] | Escopo: token (base ERC-20) + IdentityRegistry + ModularCompliance. Faixa citada é referência interna, não preço fixado. |
| Reauditoria pós-correções (condicional — preencher **somente se não inclusa** no item acima) | [PREENCHER ou "INCLUSA"] | [por ciclo / por auditoria] | [única / por unidade] | [dd/mm/aaaa] | Informar nº de ciclos de retest cobertos. |

## 7. Critérios de avaliação

As propostas serão avaliadas de forma comparativa, considerando (sem peso pré-fixado e sem vinculação):

- **Aderência ao escopo** (Seção 3) e clareza dos entregáveis, incluindo tratamento explícito da suíte **ERC-3643 lite**.
- **Experiência comprovada** com auditoria de smart contracts e, em especial, com o **padrão ERC-3643 / security tokens permissionados**.
- **Metodologia e profundidade** da auditoria (cobertura de severidades, ferramentas, análise manual + automatizada) e **qualidade do relatório**.
- **Prazo** de execução e de reauditoria.
- **Custo total** e transparência da precificação (preço, unidade, recorrência, itens condicionais).
- **Inclusão e condições da reauditoria** pós-correções.
- **Termos de confidencialidade** e disponibilidade para atuar **sob NDA**.

## 8. Prazo e forma de resposta

- **Prazo de resposta:** [PRAZO DE RESPOSTA — sugestão: 15 dias corridos] a contar do recebimento deste RFP.
- **Formato:** proposta em **PDF**, contemplando as respostas da Seção 5 e a tabela preenchida da Seção 6.
- **Envio e contato:** encaminhar para [CONTATO — nome, e-mail, telefone] em nome de [CONTRATANTE / RAZÃO SOCIAL].
- **NDA:** o compartilhamento da base de código está condicionado à assinatura de **acordo de confidencialidade (NDA)**; indicar na proposta a disponibilidade para tanto.
- **Dúvidas:** questões de esclarecimento podem ser enviadas ao contato acima até [DATA-LIMITE PARA DÚVIDAS].

> Reforça-se que esta solicitação **não vincula as partes**, **não constitui oferta de valores mobiliários** e que a plataforma permanece em **modo demonstração** até a conclusão das providências de go-live regulado.

## Referências

- **Padrão ERC-3643** (T-REX, security tokens permissionados).
- **Hyperledger Besu** (rede permissionada, consenso QBFT).
