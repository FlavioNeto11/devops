---
title: "12 — Blueprint de custos e configuração para o go-live real"
status: proposta
updated: 2026-07-16
language: pt-BR
---

# 12 — Blueprint: quanto custa tokenizar os processos BESC de verdade

> **Leia primeiro — aviso.** Este é um documento de **planejamento e estimativa**, não um parecer
> jurídico, contábil, tributário ou financeiro, nem oferta de valores mobiliários. Todo
> **enquadramento regulatório** (CVM/BCB) e **todo custo** aqui dependem de **validação por
> profissionais habilitados** — é a própria premissa do gate regulatório
> ([10-gate-regulatorio](./10-gate-regulatorio.md)). Os valores são **FAIXAS de mercado a confirmar
> por cotação/RFP**, com nível de confiança e fonte datada. A regulação está **em movimento**: o
> Marco de Ativos Virtuais / VASP (Res. BCB 519) passou a vigorar em **02/02/2026** e a Res. CVM 88
> está **em reforma** (consulta pública 2025) — reconfirme os números antes de qualquer decisão.
> Câmbio de referência: ~R$ 5,40–5,60/USD (sensível ao dia).

## 1. Onde estamos e o que este blueprint responde

A plataforma BESC está **construída e no ar**, porém **100% off-chain/simulada**: o marketplace
(título→token, elasticidade, máquina jurídica, receita) roda com o `SimulatedLedgerAdapter`, e o
**gate regulatório `go_live_enabled` está fechado** — nenhuma emissão on-chain real, dinheiro real ou
oferta a público real acontece até os **7 pareceres do gate** serem satisfeitos
([09-roadmap](./09-roadmap.md), [10-gate-regulatorio](./10-gate-regulatorio.md)).

Este documento responde: **(a) quanto custa** tokenizar os processos de verdade e **(b) tudo que
precisa ser configurado/contratado/feito** — em três dimensões de custo (setup, recorrente, por
processo), um checklist de configuração, e **três cenários lado a lado** para você calibrar.

A planilha irmã [`blueprint-custos-besc.csv`](./blueprint-custos-besc.csv) (e a versão `.xlsx` com
calculadora) traz as mesmas linhas de custo em formato editável, com totais que recalculam ao mudar
o número de processos, o funding-alvo e a escolha de custódia.

## 2. Achado central: o caminho crítico é REGULATÓRIO, não técnico

A maior alavanca de custo **e de risco** é o **enquadramento do ativo** (parecer `is_security`). Um
token que representa direito ligado a um processo judicial é, com alta probabilidade, **valor
mobiliário** → **trilho CVM**. E como se trata de **crédito litigioso**, o lastro tende a exigir
**FIDC de direitos creditórios não-padronizados (FIDC-NP)**, restrito a investidor
**profissional/qualificado** e mais caro de estruturar. **Ofertar sem o enquadramento correto = oferta
irregular** (infração à CVM). Ou seja: o maior "custo" do projeto é **errar o trilho**.

Consequência para a ordem de execução: **os 7 pareceres do gate são o caminho crítico** — eles
destravam o `go_live_enabled`, que por sua vez autoriza a emissão on-chain com valor real. A parte
técnica (blockchain, custódia, contrato) é grande, mas **paralelizável** e sem valor legal até o gate
abrir. Comece a contratar a assessoria jurídica **agora**, em paralelo a tudo.

## 3. Os 7 pareceres do gate regulatório (quem emite, o que exige)

Chaves canônicas = as do `TOKENIZATION_TEMPLATE` em `apps/besc/api/src/domain.js:188-194`;
detalhe em [10-gate-regulatorio §2](./10-gate-regulatorio.md). Cada evidência é um **parecer de
profissional habilitado e identificado** (nome, registro, data, escopo). Enquanto o conjunto não
estiver `granted`, `go_live_enabled=false`.

| # | Chave | O que exige | Quem emite |
|---|---|---|---|
| 0 | `needs_regulatory_advisor` (passo 0, não é item do gate) | **Contratar a assessoria** — pré-condição para emitir os 7 pareceres | — |
| 1 | `is_security` | É valor mobiliário? Teste do contrato de investimento coletivo (CVM Parecer de Orientação 40); classifica pela essência econômica | Advogado de mercado de capitais (CVM), OAB |
| 2 | `offer_registration` | Se é VM: registro de oferta (Res. CVM 160) **ou** crowdfunding (Res. CVM 88) **ou** dispensa; tetos, limites por investidor, risco da circulação secundária | Advogado CVM / assessor de ofertas |
| 3 | `fidc_structure` | Cabe FIDC (Res. CVM 175)? Direitos creditórios elegíveis/verificáveis; papéis obrigatórios (administrador/gestor/custodiante); cotas sênior/subordinada | Estruturador de fundos + advogado |
| 4 | `vasp_bcb` | Enquadra no Marco de Ativos Virtuais / BCB (Lei 14.478, Res. BCB 519)? **Linha divisória CVM×BCB muda o produto inteiro** | Advogado regulatório (bancário/criptoativos) |
| 5 | `kyc_aml_pldft` | Precisa de PLD-FT/COAF? KYC/KYT, screening PEP/sanções, monitoramento, comunicação de operação suspeita | Advogado/consultor de compliance PLD-FT |
| 6 | `lgpd` | Conformidade LGPD: base legal, minimização, retenção, RIPD, DPO; **PII nunca on-chain** (já garantido pelo design) | DPO / advogado de privacidade |
| 7 | `taxation` | Ganho de capital PF + obrigações RFB; tributação das **duas receitas** (fee de 1ª transferência + aluguel) | Tributarista |

**Como destrava (implementado em `apps/besc/api/src/marketplace/gate.js`):**
`go_live_enabled = (último ato de aprovação = 'granted') AND todos os 7 itens ∈ {satisfied,
not_applicable}, cada um com o documento de parecer anexado`. Revogar a aprovação ou reabrir qualquer
item re-trava na hora.

## 4. Custo — as três dimensões (faixas de mercado, jul/2026)

> Legenda de confiança: **alta** = preço público/lei · **média** = referência de mercado · **baixa** =
> ordem de grandeza, **exige cotação**. Fontes datadas no [Apêndice A](#apêndice-a--fontes).

### 4.1 SETUP (uma vez)

| Item | Faixa (R$) | Confiança | Observação |
|---|---|---|---|
| Parecer jurídico de enquadramento (`is_security`) | 30 mil – 150 mil | baixa | Cotar escritório de mercado de capitais |
| Estruturação regulatória da oferta/veículo | 150 mil – 500 mil+ | baixa | Topo da faixa em FIDC-NP + tokenização + oferta |
| Estruturação inicial de FIDC (se trilho FIDC) | 100 mil – 300 mil+ | média | Créditos judiciais → FIDC-NP (mais caro) |
| Auditoria de smart contract ERC-3643 (por auditoria) | 55 mil – 275 mil+ | média | Múltiplos contratos (token, IdentityRegistry, compliance) |
| Programa LGPD (setup) | 20 mil – 80 mil | baixa | Mapeamento, políticas, ROPA, RIPD |
| Programa PLD-FT/COAF (setup) | 30 mil – 120 mil | baixa | Política, monitoramento, treinamento |
| Taxa CVM da oferta (Lei 7.940) | 0,03% geral / **0,64% cotas de fundo**, mín. R$ 809 | alta | Ex.: R$ 10M em cotas ≈ **R$ 64 mil** |
| Elevar contrato `TitleRegistry.sol` → ERC-3643 lite (dev) | esforço interno | — | Fase 3; ver gap D4 (§5) |

### 4.2 RECORRENTE (mensal / anual)

| Item | Faixa | Confiança | Observação |
|---|---|---|---|
| Nós Besu permissionados (1–4 validadores, nuvem sa-east-1) | R$ 2 mil – 7 mil/mês | média | m5.large/t3.large basta no início; não superdimensionar |
| Custódia de chaves — **KMS** | ~R$ 50 – 300/mês | alta | AWS/Azure/GCP KMS cobre a maioria dos casos |
| Custódia de chaves — **HSM dedicado** (se compliance exigir) | ~R$ 6,5 mil/mês/HSM (×2 HA ≈ R$ 13 mil/mês) | alta | CloudHSM FIPS 140-2/3; decisão de compliance |
| Infra de produção (k8s gerenciado + Postgres Multi-AZ + backups) | R$ 3 mil – 8 mil/mês | média | Cresce com HA e observabilidade |
| Taxa de administração FIDC (se FIDC) | 0,8% – 2,0% a.a. do PL (piso ~R$ 8–20 mil/mês) | média | O piso domina em fundo pequeno |
| Auditoria anual do FIDC (se FIDC) | R$ 50 mil – 150 mil/ano | baixa | Cotar |
| DPO as a service | R$ 2,5 mil – 6,5 mil/mês | média | DPO interno pleno: R$ 8–20 mil/mês |
| Compliance PLD-FT (monitoramento) + KYC (mensalidade) | R$ 2 mil – 13 mil/mês somados | baixa | KYC exige RFP com seu volume |
| Seguro E&O + Cyber (+ D&O) | R$ 8 mil – 50 mil/ano | média | Cyber pode ser exigido; cotar corretora |
| Carimbo de tempo ICP-Brasil (RFC 3161) — pacote por volume | cotar | baixa | Serpro/Certisign/Valid; ancoragem externa da trilha |

### 4.3 VARIÁVEL (por processo — "quanto custa tokenizar cada processo")

| Item por processo | Faixa (R$) | Confiança | Observação |
|---|---|---|---|
| Laudo/perícia de avaliação do direito | 2 mil – 15 mil+ | média/baixa | Direito litigioso/ilíquido é obrigatório; hora × complexidade |
| Parecer de certeza/exigibilidade (jurídico por caso) | 2 mil – 10 mil+ | baixa | Ordem de grandeza; cotar |
| Custas cartorárias das cártulas (progressivo por valor) | ~150+/ato, escala com o valor | média/alta | Varia por estado (ex. SP); simulador do cartório |
| KYC do titular/investidor (por verificação) | ~2 – 8/verificação | baixa | Bundle de onboarding; RFP com volume |
| Certificado ICP-Brasil (assinatura, por titular/ano) | 120 – 350/ano | alta | e-CPF/e-CNPJ/nuvem |

> **Regra de bolso:** **custo por processo ≈ R$ 5 mil – 30 mil** (dominado por perícia + parecer +
> custas cartorárias). O total variável escala **linearmente** com o número de processos. A esteira do
> app (motor de pendências) já cobra cada um desses insumos por caso (§6, faixa D).

## 5. O que precisa ser CONFIGURADO/FEITO — checklist de go-live

Organizado em quatro faixas paralelizáveis. A faixa A (regulatória) é o caminho crítico.

### Faixa A — Regulatório (destrava o gate)
- [ ] **A0** Contratar assessoria jurídica/regulatória de mercado de capitais (passo 0).
- [ ] **A1–A7** Emitir os 7 pareceres (§3), anexar cada `opinion_document_ref`, marcar cada
  `regulatory_gate_item = satisfied|not_applicable`, e registrar o ato `granted` → `go_live_enabled=true`.

### Faixa B — Blockchain de produção (gaps entre o que está no ar e produção)
| Gap | Estado hoje | Produção exige |
|---|---|---|
| **D1** | Besu `--network=dev` **single-node** | **QBFT permissionado, genesis próprio, 4+ validadores (3f+1)** |
| **D2** | RPC/CORS/host-allowlist abertos (dev) | APIs de permissionamento + CORS/allowlist restritos |
| **D3** | **Sem custódia** (chave seria a conta dev pública do Besu) | Hot wallet omnibus em Sealed Secret (Fase 3) → **HSM/KMS + segregação emissor≠compliance≠operador** (consórcio) |
| **D4** | `TitleRegistry.sol` = registro custom (não ERC-20, sem IdentityRegistry/ModularCompliance, **não auditado**) | **Suíte ERC-3643 lite** (TitleToken + IdentityRegistry + ModularCompliance) **auditada** |
| **D5** | `LEDGER_ADAPTER=simulated` (Besu no ar é espelho desarmado) | `LEDGER_ADAPTER=besu` apontando para a rede QBFT após o gate |
| **D6** | Script/runbook de deploy de contrato **ausente** | Automação de deploy/bootstrap versionada |
| **D7** | Enforcement do gate é **soft** (só watermark) | **Trava fail-closed 403 (`requireGoLive()`)** recusando as 4 operações: marcar investidor apto, remover watermark, faturar fora do piloto, emitir on-chain real |
| **D8** | Sem ancoragem externa | **Carimbo RFC 3161/ICP-Brasil** ligado ao `anchorAuditRoot` |

### Faixa C — Compliance operacional
- [ ] KYC/onboarding (provedor contratado), fluxo de aprovação por `compliance`.
- [ ] Programa PLD-FT + monitoramento + canal de comunicação ao COAF.
- [ ] LGPD: DPO designado, RIPD assinado, política de retenção por categoria (PII **nunca** on-chain — já garantido).
- [ ] Seguro E&O + Cyber (+ D&O) contratado.

### Faixa D — Por processo (esteira já pronta no app)
Cada caso precisa sair de **`ready_for_structuring`** (ou `ready_with_caveats` com override registrado)
com: **titularidade comprovada** (pendência bloqueante), **laudo de avaliação**, **parecer de
certeza/exigibilidade**, **custódia documental**, **cessão admissível**. O motor de pendências do app
(`apps/besc/api/src/domain.js`) já cobra todos esses insumos — o custo é o de contratar cada um (§4.3).

## 6. Três cenários lado a lado

> Totais são **ordens de grandeza** compostas das faixas do §4; a planilha recalcula ao mudar as
> premissas. `N` = número de processos; funding = valor total captado.

| | **Piloto técnico** | **Regulado enxuto (CVM 88)** | **Regulado completo (FIDC-NP)** |
|---|---|---|---|
| Objetivo | Provar a operação on-chain, **sem valor real** (gate fechado, watermark) | Oferta real pequena, **funding ≤ R$ 15 mi** | Escala maior, veículo de fundo |
| Trilho regulatório | nenhum (demonstração) | crowdfunding CVM 88 | FIDC-NP (Res. 175) + oferta |
| Pareceres do gate | não (fica demonstração) | sim (os 7) | sim (os 7) + estruturação de fundo |
| Blockchain | Besu permissionado de teste + ERC-3643 lite **não auditado** | + **auditoria** do contrato | + auditoria + custódia robusta |
| Custódia de chaves | Sealed Secret (hot wallet) | **KMS** | **HSM dedicado** |
| **Setup (uma vez)** | ~R$ 0 regulatório + esforço interno | **~R$ 300 mil – 700 mil** | **~R$ 500 mil – 1,5 mi** |
| **Recorrente** | **~R$ 2 mil – 5 mil/mês** (infra) | **~R$ 15 mil – 35 mil/mês** | **~R$ 40 mil – 90 mil/mês** + taxa adm. (% do PL) |
| **Por processo** | — | ~R$ 5 mil – 30 mil × N | ~R$ 5 mil – 30 mil × N |
| Risco legal | nenhum (nada de valor real) | médio (depende dos pareceres) | médio/alto (estrutura complexa) |

> **Alerta VASP/BCB:** se o enquadramento cair em "ativo virtual / VASP" em vez de valor mobiliário, o
> **capital mínimo (R$ 10,8 mi – 37,2 mi)** domina todo o orçamento. **Provavelmente NÃO se aplica** —
> valor mobiliário vai para a CVM, e a Lei 14.478 exclui VM do escopo VASP. Mas é **a** decisão jurídica
> que move o orçamento em dezenas de milhões, e é justamente o parecer #4 (`vasp_bcb`) do gate.

## 7. RFPs a disparar já (para transformar faixa em número real)

Peça orçamento imediatamente a:
1. **Escritório de advocacia de mercado de capitais** — parecer de enquadramento (`is_security`) +
   estruturação da oferta/veículo. *(destrava o caminho crítico)*
2. **Administrador fiduciário de FIDC** — custo all-in por prestador (admin/gestor/custodiante/auditor),
   taxa de administração, montagem. *(só se o trilho for FIDC)*
3. **2–3 provedores de KYC/PLD** (idwall, Unico, Serpro Datavalid, BigDataCorp, Serasa, Caf) — com o
   seu **volume estimado**.
4. **1–2 firmas de auditoria de smart contract** (Hacken, OpenZeppelin, Trail of Bits, CertiK) — escopo
   ERC-3643 completo (token + IdentityRegistry + módulos de compliance).
5. **Corretora de seguros** — E&O + Cyber (+ D&O).
6. **Autoridade de Carimbo do Tempo (ICP-Brasil)** — Serpro/Certisign/Valid, pacote por volume.
7. **Provedor de custódia/HSM** — KMS vs CloudHSM (ou custodiante terceirizado), conforme exigência de
   compliance apurada no parecer #5/#6.

## 8. Sequência recomendada (sem gastar antes da hora)

1. **Hoje:** dispare os RFPs #1 e #3–#6; contrate a assessoria (A0). Custo baixo, destrava tudo.
2. **Em paralelo (opcional, barato):** rode o **piloto técnico** (Besu permissionado + ERC-3643 lite,
   gate fechado) para provar a operação on-chain sem risco legal — ~R$ 2–5 mil/mês de infra.
3. **Com os pareceres em mãos:** escolha o trilho (CVM 88 vs FIDC), feche os custos reais (as faixas
   viram números), audite o contrato, provisione custódia real e converta o watermark em trava 403 (D7).
4. **Gate `granted`:** ligue `LEDGER_ADAPTER=besu`, remova o watermark, comece a operar com valor real.

---

## Apêndice A — Fontes

Regulatório: [CVM Res. 88 consolidada](https://conteudo.cvm.gov.br/export/sites/cvm/legislacao/resolucoes/anexos/001/resol088consolid.pdf) ·
[CVM — consulta reforma da 88 (24/09/2025)](https://www.gov.br/cvm/pt-br/assuntos/noticias/2025/cvm-lanca-consulta-publica-sobre-a-reforma-da-resolucao-cvm-88) ·
[CVM Res. 160 consolidada](https://conteudo.cvm.gov.br/export/sites/cvm/legislacao/resolucoes/anexos/100/resol160consolid.pdf) ·
[CVM Res. 175 consolidada](https://conteudo.cvm.gov.br/export/sites/cvm/legislacao/resolucoes/anexos/100/resol175consolid.pdf) ·
[Taxa de fiscalização/oferta — Lei 7.940 (esclarecimentos CVM)](https://cepeda.law/cvm-divulga-oficio-circular-com-esclarecimentos-sobre-taxa-de-fiscalizacao/) ·
[Tabelas de taxas CVM](https://sistemas.cvm.gov.br/port/taxas/tabelas_site.htm) ·
[BCB VASP / Res. 519 (Machado Meyer)](https://www.machadomeyer.com.br/pt/inteligencia-juridica/publicacoes-ij/bancario-seguros-e-financeiro-ij/bcb-regulamenta-o-mercado-de-ativos-virtuais-no-brasil) ·
[Capital mínimo PSAV (NDM)](https://ndmadvogados.com.br/artigo/capital-social-minimo-psav-e-exchange/).

Custos FIDC / mercado: [bankme.tech](https://bankme.tech/blog/tributacao-fidc) · [giro.tech](https://giro.tech/fidc/) ·
crowdfunding [Kria ~7%](https://www.suno.com.br/noticias/kria-investimento-startups-tecnologia-crowdfunding/) ·
[EqSeed/Captable ~10%](https://blog.eqseed.com/com-regulacao-plataformas-de-equity-crowdfunding-elevam-captacao-e-preveem-crescimento/).

Compliance: [DPO as a service — preços](https://thebiginsights.com/custo-dpo-as-a-service-guia-de-precos/) ·
[PLD-FT (Compliance Brazil)](https://compliancebrazil.com.br/blog/prevencao-lavagem-dinheiro-pld-ft) ·
KYC [Didit vs idwall](https://didit.me/pt-BR/blog/didit-vs-idwall-cobertura-global-vs-kyc-exclusivo-para-brasil/).

Infra: [AWS EKS](https://aws.amazon.com/eks/pricing/) · [AWS KMS](https://aws.amazon.com/kms/pricing/) ·
[AWS CloudHSM](https://aws.amazon.com/cloudhsm/pricing/) · [RDS PostgreSQL](https://aws.amazon.com/rds/postgresql/pricing/) ·
[Besu on AWS](https://besu.hyperledger.org/public-networks/tutorials/aws-node-runners) ·
auditoria [Ulam](https://www.ulam.io/blog/smart-contract-audit) · ERC-3643 [Tokeny](https://tokeny.com/erc3643/).

Por processo: [Honorários de perito — CNJ Res. 232/2016 (Manual de Perícias)](https://www.manualdepericias.com.br/tabela-de-honorarios-de-perito-calculo-instantaneo/) ·
[Tabela de custas RTD-SP 2025 (ANOREG-SP)](https://www.anoregsp.org.br/noticias/91407/anoregsp-divulga-tabela-de-custas-e-emolumentos-dos-cartorios-do-estado-de-sao-paulo-para-2025) ·
[Certificado digital 2026 (Omie)](https://www.omie.com.br/blog/qual-e-o-valor-do-certificado-digital-a1-e-a3-em-2026/) ·
[ICP-Brasil — Autoridades de Carimbo do Tempo (ITI)](https://www.gov.br/iti/pt-br/assuntos/icp-brasil/autoridades-de-carimbo-do-tempo).

Seguros: [BrSeguro startups](https://www.brseguro.com/seguro-para-startups-tecnologia-e-inovacao) ·
[Rio Rubio — cyber](https://www.riorubiocorretora.com.br/seguro-cyber/).

---
_Relacionados: [05-camada-ledger-blockchain](./05-camada-ledger-blockchain.md) ·
[06-modelo-receita](./06-modelo-receita.md) · [09-roadmap](./09-roadmap.md) ·
[10-gate-regulatorio](./10-gate-regulatorio.md) · [ADR-005](./adr/ADR-005-ledger-port-besu-erc3643.md) ·
[ADR-007](./adr/ADR-007-gate-regulatorio-bloqueante.md) · planilha:
[blueprint-custos-besc.csv](./blueprint-custos-besc.csv)._
