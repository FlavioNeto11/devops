# RFP-03 — KYC/onboarding e programa de PLD-FT (prevenção à lavagem de dinheiro)

> **Aviso** — Este documento é uma **Solicitação de Proposta (RFP)** e tem finalidade exclusivamente exploratória. **Não é contrato, não vincula as partes e não constitui oferta de valores mobiliários.** A plataforma descrita encontra-se em **modo demonstração**, 100% off-chain/simulada, com o **gate regulatório interno fechado** — nenhuma oferta pública, emissão on-chain real ou movimentação de recursos ocorre. Os fornecedores eventualmente citados são **exemplos de possíveis convidados a cotar**, sem qualquer endosso, indicação ou afirmação de que já tenham sido contatados. As faixas de valores mencionadas são **referência interna de planejamento, a confirmar pela proposta**.

## 1. Contexto do projeto

O "Projeto BESC Marketplace" é uma plataforma de **tokenização de direitos creditórios** ligados a processos judiciais referentes a ações do antigo Banco do Estado de Santa Catarina (BESC, incorporado pelo Banco do Brasil).

A plataforma **já está construída e operando em modo de demonstração**: atualmente é **100% off-chain/simulada**, e o **gate regulatório interno está fechado** — não há oferta pública, emissão on-chain real ou qualquer movimentação de recursos. O objetivo desta contratação é obter o serviço necessário para viabilizar um **go-live regulado**.

Arquitetura técnica resumida (quando relevante à proposta): Kubernetes, PostgreSQL, blockchain permissionada Hyperledger Besu e contratos no padrão **ERC-3643** (tokens de valor mobiliário com identidade e compliance on-chain). **Nenhum dado pessoal é gravado on-chain.**

## 2. Objeto da contratação

Contratação de **verificação de identidade (KYC)** e da estruturação do **programa de PLD-FT (Prevenção à Lavagem de Dinheiro e ao Financiamento do Terrorismo)**, incluindo monitoramento contínuo e comunicação de operações suspeitas ao COAF.

Esta contratação atende diretamente ao **Item #5 `kyc_aml_pldft` do gate regulatório interno**, cujo cumprimento é condição para a transição do modo demonstração para o go-live regulado.

## 3. Escopo e entregáveis

**Escopo:**

1. **KYC de titulares e investidores (PF e PJ):** verificação de identidade, prova de vida e validação documental.
2. **Screening e monitoramento contínuo (KYT):** triagem de PEP (Pessoas Expostas Politicamente) e listas de sanções, monitoramento contínuo e geração de alertas.
3. **Setup do programa PLD-FT:** elaboração de política e procedimentos, treinamento e implantação do canal de comunicação de operação suspeita ao COAF.

**Entregáveis esperados:**

- Proposta contendo **preço por verificação KYC** (PF e PJ, em faixas de volume), **mensalidade de monitoramento/KYT + screening PEP/sanções** e **escopo e valor do setup do programa de PLD-FT/COAF**.

Todos os entregáveis devem estar alinhados ao cumprimento do **Item #5 `kyc_aml_pldft`** do gate regulatório.

## 4. Premissas e informações do projeto

- **Volume:** o número de verificações escala com o **[Nº DE PROCESSOS ESTIMADO]** e o número de investidores esperados. **Solicitamos preços por FAIXAS/tiers de volume**, e não valor único de referência.
- **Público:** majoritariamente **nacional** (pessoas físicas e jurídicas brasileiras).
- **Funding-alvo do projeto:** [FUNDING-ALVO] (informação de planejamento, a confirmar).
- **Estágio atual:** plataforma em **modo demonstração** (gate fechado); a contratação visa **exclusivamente** habilitar o go-live regulado.
- **Ênfase:** por favor, apresente **preços em faixas de volume** — o número de verificações cresce proporcionalmente ao número de processos e de investidores.

> As faixas a seguir são **referência interna de planejamento, a confirmar pela proposta** — não constituem preço fixado nem teto/piso:
> - Programa PLD-FT/COAF (setup): R$ 30 mil – 120 mil (valor único)
> - Compliance PLD-FT (monitoramento) + KYC (mensalidade): R$ 2 mil – 13 mil/mês somados
> - KYC do titular/investidor (por verificação): R$ 2 – 8/verificação

## 5. Perguntas que precisamos que a proposta responda

Cada resposta deve permitir preencher um **número de custo** (preço, unidade, recorrência e prazo). As faixas da seção 4 são apenas referência interna a confirmar.

1. **Preço por verificação KYC — Pessoa Física**, apresentado em **faixas de volume** (informe os tiers, o preço unitário em cada faixa e o volume mínimo/máximo por faixa).
2. **Preço por verificação KYC — Pessoa Jurídica**, também em **faixas de volume** (tiers, preço unitário por faixa e limites de volume).
3. **Mensalidade de monitoramento/KYT + screening PEP e listas de sanções** (valor mensal; indicar se há componente fixo, variável por volume ou por alerta gerado).
4. **Custo de setup do programa de PLD-FT/COAF** (valor único; discriminar política/procedimentos, treinamento e implantação do canal de comunicação ao COAF; informar prazo de implantação).
5. **Cobertura e integração:** quais bases são consultadas, **SLA de verificação** (tempo médio/limite por verificação) e disponibilidade de **integração via API**; indicar eventual custo de setup/integração e recorrência de manutenção.
6. **Recorrências e reajustes:** existem custos recorrentes adicionais (manutenção, suporte, atualização de listas, revisão de política)? Qual a **validade da proposta** e a política de reajuste?

## 6. Preencha e devolva (resumo estruturado)

| Item | Valor proposto | Unidade | Recorrência (única/mensal/anual/por unidade) | Validade da proposta | Observações |
|---|---|---|---|---|---|
| Programa PLD-FT/COAF (setup) | [preencher] | [ex.: projeto] | única | [dd/mm/aaaa] | [escopo, prazo de implantação] |
| Compliance PLD-FT (monitoramento) + KYC (mensalidade) — somados | [preencher] | [ex.: R$/mês] | mensal | [dd/mm/aaaa] | [detalhar componentes fixo/variável] |
| KYC do titular/investidor (por verificação) | [preencher] | [ex.: R$/verificação] | por unidade | [dd/mm/aaaa] | [informar faixas de volume PF/PJ] |

## 7. Critérios de avaliação

As propostas serão avaliadas de forma comparativa, considerando, sem ordem de precedência estrita:

- **Aderência ao escopo e ao Item #5 `kyc_aml_pldft`** do gate regulatório.
- **Estrutura de preços por faixas de volume** (clareza, previsibilidade e escalabilidade com o [Nº DE PROCESSOS ESTIMADO]).
- **Cobertura de bases** consultadas (documental, PEP, sanções) e qualidade/atualização das fontes.
- **SLA de verificação** e capacidade de **integração via API**.
- **Robustez do programa de PLD-FT/COAF** (política, procedimentos, treinamento e canal de comunicação).
- **Conformidade regulatória** e experiência comprovada no setor.
- **Segurança e privacidade de dados** (tratamento de dados pessoais fora da cadeia on-chain).
- **Custo total estimado** para os cenários de volume informados.

## 8. Prazo e forma de resposta

- **Prazo de resposta:** [PRAZO DE RESPOSTA — sugestão: 15 dias corridos a contar do recebimento deste RFP].
- **Formato:** proposta em **PDF**, contemplando a tabela da seção 6 preenchida e as respostas da seção 5.
- **Envio e contato:** encaminhar para **[CONTATO — nome, e-mail, telefone]**.
- **Contratante:** [CONTRATANTE / RAZÃO SOCIAL].
- Dúvidas sobre este RFP podem ser encaminhadas ao mesmo contato acima antes do término do prazo de resposta.

Reiteramos que este documento **não vincula as partes, não constitui contrato e não representa oferta de valores mobiliários**, e que a plataforma permanece em **modo demonstração** até a eventual conclusão do processo de go-live regulado.

## Referências

- Lei nº 9.613/1998 e regulação do COAF sobre PLD-FT.
- Instrução CVM/BCB aplicável a PLD-FT do setor.
