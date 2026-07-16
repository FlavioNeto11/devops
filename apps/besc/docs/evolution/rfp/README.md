---
title: "Pacote de RFPs — go-live da tokenização BESC"
status: proposta
updated: 2026-07-16
language: pt-BR
---

# Pacote de RFPs — transformar as faixas do blueprint em números reais

Este pacote reúne **solicitações de proposta (RFPs) prontas para envio**, uma por serviço a contratar
no caminho para o go-live regulado ([12-blueprint-custos-go-live](../12-blueprint-custos-go-live.md)).
Cada RFP pede exatamente os dados que hoje aparecem como **"faixa a cotar"** na planilha
[`blueprint-custos-besc.xlsx`](../blueprint-custos-besc.xlsx), para que, ao receber as propostas, você
substitua a faixa pelo **número real** e a calculadora de cenários recalcule sozinha.

> **Aviso.** As RFPs são documentos de **coleta de propostas** — não são contrato, não vinculam as
> partes e não constituem oferta de valores mobiliários. A plataforma está em **modo demonstração**
> (gate regulatório fechado). Os fornecedores citados nas RFPs são **exemplos** de possíveis convidados
> a cotar, sem endosso ou contato prévio. Reconfirme enquadramento e números com profissionais
> habilitados — é a premissa do [gate regulatório](../10-gate-regulatorio.md).

## Como usar (fluxo de ponta a ponta)

1. **Preencha os placeholders** de cada RFP entre colchetes: `[CONTRATANTE / RAZÃO SOCIAL]`,
   `[CONTATO — nome, e-mail, telefone]`, `[PRAZO DE RESPOSTA — sugestão: 15 dias corridos]`,
   `[Nº DE PROCESSOS ESTIMADO]`, `[FUNDING-ALVO]` e afins.
2. **Envie** cada RFP a 2–3 fornecedores do tipo indicado (concorrência melhora preço e prazo).
3. **Ao receber a proposta**, registre-a na aba **"Cotações recebidas"** do xlsx (ou na
   [`matriz-cotacoes.csv`](./matriz-cotacoes.csv)) — colunas amarelas: fornecedor, cotado mín/máx,
   validade, data, observação.
4. **Atualize a linha de custo**: na aba **"Linhas de custo"** do xlsx, substitua **Mín/Máx** da célula
   indicada pelo valor cotado e marque **Confiança = `cotado`**, **Fonte = `<fornecedor>`**.
5. A aba **"Cenários"** recalcula os três totais automaticamente. Pronto: faixa virou número real.

## Mapa RFP → item do gate → linha de custo → célula da planilha

Célula = onde atualizar na aba **"Linhas de custo"** (mín em coluna **C**, máx em **D**).

| RFP | Serviço / destinatário | Item do gate / gap | Linha(s) de custo | Célula(s) |
|---|---|---|---|---|
| [01](./rfp-01-mercado-de-capitais.md) | Assessoria jurídica de mercado de capitais | #1 `is_security`, #2 `offer_registration`, fronteira #4 `vasp_bcb` | Parecer de enquadramento · Estruturação da oferta/veículo · Parecer de certeza/exigibilidade (por caso) | C2/D2 · C3/D3 · C15/D15 |
| [02](./rfp-02-fidc.md) | Estruturação e administração de FIDC-NP | #3 `fidc_structure` | Estruturação inicial de FIDC · Auditoria anual do FIDC · (Taxa de adm. = % do PL, calculada na aba Cenários) | C4/D4 · C12/D12 |
| [03](./rfp-03-kyc-pld.md) | KYC/onboarding + PLD-FT/COAF | #5 `kyc_aml_pldft` | PLD-FT/COAF (setup) · Compliance PLD-FT + KYC (mensalidade) · KYC por verificação | C7/D7 · C11/D11 · C17/D17 |
| [04](./rfp-04-auditoria-smart-contract.md) | Auditoria de smart contract (ERC-3643 lite) | técnico — gap **D4** | Auditoria de smart contract ERC-3643 | C5/D5 |
| [05](./rfp-05-seguros.md) | Seguros E&O + Cyber + D&O | compliance — Faixa C | Seguro E&O + Cyber + D&O | C13/D13 |
| [06](./rfp-06-carimbo-tempo-icp.md) | Carimbo do tempo ICP-Brasil (RFC 3161) + certificados | técnico — gap **D8** | Certificado ICP-Brasil (por titular/ano) · Carimbo RFC 3161 (pacote por volume, sem célula fixa) | C18/D18 |
| [07](./rfp-07-custodia-hsm.md) | Custódia de chaves — KMS vs HSM dedicado | técnico — gap **D3** | Custódia KMS · Custódia HSM dedicado (alimentam o toggle de custódia) | C19/D19 · C20/D20 |
| [08](./rfp-08-lgpd-dpo.md) | Programa LGPD + DPO as a service | #6 `lgpd` | Programa LGPD (setup) · DPO as a service | C6/D6 · C10/D10 |

> Os RFPs **01–07** são os sete listados no [blueprint §7](../12-blueprint-custos-go-live.md#7-rfps-a-disparar-já-para-transformar-faixa-em-número-real). O **08 (LGPD/DPO)** é
> complementar, incluído para tornar cotáveis as linhas de LGPD/DPO da planilha (o item #6 do gate).

## Linhas de custo que NÃO têm RFP (e por quê)

| Linha de custo | Como cotar |
|---|---|
| Nós Besu permissionados · Infra de produção (C8/D8 · C9/D9) | **Provisionamento em nuvem** com preço público — use a calculadora do provedor (AWS/Azure/GCP), não um RFP de fornecedor. |
| Laudo/perícia · Custas cartorárias (C14/D14 · C16/D16) | **Por processo** (Faixa D): perícia segue a tabela do perito (CNJ Res. 232/2016); custas seguem a tabela pública do cartório. Cotadas **caso a caso**, não por um RFP único. |
| Taxa CVM da oferta | Definida por **lei** (Lei 7.940); já é **calculada** na aba Cenários a partir do funding. |
| Taxa de administração do FIDC | **% do PL** — cotada dentro do **RFP-02** e calculada na aba Cenários. |

## Sequência recomendada

Dispare **hoje** os RFPs **01 e 03–06** e contrate a assessoria (passo A0) — custo baixo, destrava o
caminho crítico. O **RFP-02 (FIDC)** só se o trilho escolhido for FIDC-NP. O **RFP-04 (auditoria)** e o
**RFP-07 (custódia)** entram quando o contrato ERC-3643 lite estiver pronto para auditar e a exigência
de custódia (KMS vs HSM) tiver sido apurada nos pareceres #5/#6. Detalhe em
[12-blueprint §8](../12-blueprint-custos-go-live.md#8-sequência-recomendada-sem-gastar-antes-da-hora).

---
_Pacote gerado a partir de [12-blueprint-custos-go-live](../12-blueprint-custos-go-live.md).
Planilha: [blueprint-custos-besc.xlsx](../blueprint-custos-besc.xlsx) ·
intake: [matriz-cotacoes.csv](./matriz-cotacoes.csv)._
