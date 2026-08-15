---
title: "SICAT — Plano comercial: planos, preços e custos"
status: proposta
updated: 2026-07-16
language: pt-BR
---

# SICAT — Plano comercial: planos, preços e custos

> **Leia primeiro — aviso.** Este é um documento de **planejamento e estimativa**, não uma proposta
> comercial nem aconselhamento financeiro/contábil. Valores marcados **[PREMISSA]** são pontos de
> partida a validar com pilotos pagantes; faixas de mercado vêm de pesquisa web feita em
> **2026-07-16** com verificação adversarial de cada fonte (detalhe em
> [01-pesquisa-mercado.md](./01-pesquisa-mercado.md)). Os números dos cenários **saem da calculadora**
> ([planilha](./plano-comercial-sicat.xlsx), fonte única [tools/premissas.json](./tools/premissas.json)) —
> mude as premissas lá e recalcule; não edite números na mão. Câmbio de referência: R$ 5,10/US$ (PTAX 16/07/2026).

## 1. Sumário executivo

O SICAT cobra **assinatura mensal por porte + franquia de Documentos Operados (DO) + excedente por
DO**, com IA inclusa por cota e módulo fiscal (CT-e/MDF-e) como **add-on de roadmap**. Quatro planos:

| | Essencial | Profissional | Operacional | Enterprise |
|---|---|---|---|---|
| Mensalidade [PREMISSA] | **R$ 129** | **R$ 349** | **R$ 899** | **a partir de R$ 1.990** |
| Franquia DOs/mês | 30 | 300 | 1.500 | 5.000+ negociada |
| Margem bruta estimada | ~75% | ~65% | ~62% | ~56% |

No cenário-base do mês 12 (80 clientes), MRR ≈ **R$ 29,5 mil** com margem bruta de **67,8%** e
resultado de +R$ 10 mil/mês antes da folha. **Break-even: MRR ≈ R$ 14,8 mil** (~40 clientes no mix
base) sem folha; ≈ R$ 44,2 mil com folha core. O benchmark confirmou o posicionamento: o único preço
público do setor de gestão de resíduos é R$ 160/mês + R$ 1.500 de setup (meuResíduo, 15 saídas/mês),
o BPO humano cobra R$ 650–1.980/mês por até 10 MTRs, e todos os concorrentes diretos vendem "sob
consulta". Único desenvolvimento obrigatório antes de cobrar: o **metering de DOs** (1–2 semanas).

## 2. Onde estamos: o que o SICAT faz hoje (e o que não faz)

**Vendável hoje** (implementado e no ar, sobre a **API HTTP real** da CETESB-SP — integração de
verdade, não RPA de tela):

- **MTR**: emissão individual e **em lote**, acompanhamento, impressão em PDF, cancelamento (incl.
  lote), **recebimento/baixa** (destinador), replicação e relatórios com export CSV.
- **CDF** (Certificado de Destinação Final): geração e download, com tratamento automático da janela
  de 31 dias da CETESB.
- **MTR provisório** (emergência).
- **Multi-conta CETESB por usuário** (um usuário opera N empresas), RBAC completo, login próprio e
  SSO Keycloak/OIDC.
- **Plataforma operacional** — o diferencial contra o portal gratuito: fila transacional com
  retry/DLQ (operações aceitas são reprocessadas automaticamente quando a CETESB volta), dashboards
  de operador e de saúde, auditoria fim-a-fim por correlationId, console de jobs.
- **IA que opera o produto**: chat com 20 ferramentas (emitir/cancelar/imprimir MTR, consultar jobs,
  auditoria, orquestração em lote com guardrails), ingestão multimodal de arquivos (PDF/DOCX/XLSX/
  imagens), base de conhecimento com RAG e governança completa (AI Control Center).

**Não vendável como completo**: a **DMR** tem o fluxo local pronto (criar/consolidar), mas a
**transmissão à CETESB está pendente** — comercialmente é "preparação de DMR (transmissão: em
breve)", nunca "DMR completa". Quando sair, vira upgrade gratuito (goodwill), não add-on.

**Não existe hoje** (confirmado no código): emissão fiscal — **CT-e, MDF-e, CTR eletrônico municipal
(SP Regula), NFS-e** —, integração com o SINIR federal, e qualquer billing/assinatura embutido (a
cobrança nasce externa; ver P-05). O módulo fiscal entra como add-on de roadmap precificado na §7.

**Contra quem competimos**: o "concorrente zero" é fazer na mão no portal gratuito — a emissão de
MTR é oficialmente gratuita (gov.br/SIGOR). Um MTR manual leva ~4–6 minutos; 300 MTRs/mês ≈ 20–30 h
≈ **R$ 700–1.000 de mão de obra** [PREMISSA]. É esse tempo (mais a resiliência e a auditoria) que o
SICAT precifica — nunca o "acesso ao MTR".

## 3. Personas e segmentação

### A unidade de valor: Documento Operado (DO)

As três personas consomem eventos diferentes (gerador emite; destinador recebe/baixa e emite CDF;
transportadora opera contas de terceiros). Em vez de 9 tabelas persona × porte, o SICAT mede tudo em
**DO**:

- **Conta como 1 DO**: MTR emitido (cada item do lote conta 1), MTR provisório emitido, MTR
  recebido/baixado, CDF gerado.
- **NÃO conta**: impressão/reimpressão, cancelamento, consultas, relatórios, replicação (a emissão
  resultante conta) e — essencial para o SLA honesto — **retries automáticos da fila** (o cliente
  não paga pela instabilidade da CETESB; job reprocessado conta uma vez só, no sucesso).
- **Definições de medição para o contrato**: interação de IA = 1 mensagem do usuário processada pelo
  chat (incluindo as tool-calls que dispara); ingestão = 1 arquivo processado (≤ 10 MB); DO = evento
  faturável com desfecho de sucesso confirmado pela CETESB.

### As cercas que segmentam sem tabela separada

Duas cercas secundárias fazem cada persona cair no plano certo: **nº de contas CETESB** (morde
transportadoras e consultorias que operam carteiras de clientes) e **nº de usuários** (morde
geradores multiunidade e destinadores com equipe de balança). O enquadramento é pelo **maior**
critério atingido — quem estoura qualquer coluna sobe de porte.

| | Gerador | Transportadora | Destino final |
|---|---|---|---|
| **Micro** | oficina/clínica/comércio: 5–30 MTR/mês, 1 conta | autônomo que emite pelo gerador: já nasce PME/Pro pelas cercas de DOs e contas | raro (destino micro formalizado quase não existe) |
| **PME** | indústria média/rede pequena: 50–300 MTR/mês, 2–3 CNPJs | regional: 300–1.500 DOs/mês, 3–10 contas de clientes | aterro/reciclador pequeno: 200–1.500 baixas+CDF/mês |
| **Pro** | multiunidade: 300–1.500 MTR/mês, 5–10 CNPJs | grande / **consultoria ambiental** com carteira: 10+ contas | destinador médio: 1.500+ eventos, equipe de recebimento |
| **Enterprise** | rede varejo/indústria estadual: dezenas de CNPJs, SSO, SLA | operador logístico estadual | grande aterro/UTE: dezenas de milhares de baixas/mês |

O padrão dominante no mercado (VG/Vertown histórico) é cobrar **por planta do gerador com destinador
grátis** — estratégia de liquidez de rede de marketplace. O SICAT não é marketplace: cobra de quem
extrai valor operacional, em qualquer persona, e usa o Essencial barato como porta de entrada.

## 4. Benchmark de mercado (síntese)

> Detalhe completo, com todas as fontes, datas e vereditos de verificação: [01-pesquisa-mercado.md](./01-pesquisa-mercado.md).
> Zero divergências nos 56 achados acessíveis; 5 fontes inacessíveis registradas como tal.

**Gestão de resíduos/MTR** — o mercado não publica preço (venda consultiva B2B):

| Referência | Preço | Leitura para o SICAT |
|---|---|---|
| meuResíduo "Gerador Light" | R$ 160/mês + R$ 1.500 setup (15 saídas/mês) — **média** (post oficial de 2023) | piso público de entrada; o Essencial (R$ 129, sem setup, 30 DOs) fica abaixo |
| G Solution (BPO humano) | R$ 650 → 1.980/mês, até 10 MTRs/mês — **alta** | teto de disposição a pagar; o Profissional entrega 30× mais DOs pela metade do Bronze |
| VG Resíduos/Vertown (histórico 2017-18) | R$ 680–690/mês por planta — **baixa** | ordem de grandeza do Operacional; VG = Vertown (mesma empresa) |
| Vertown, Ambipar, Trashin, InfoHand +9 | sob consulta — **alta** | liberdade de pricing, mas exige justificativa de valor na venda |
| Portal SIGOR/SINIR | **gratuito** — **alta** | precificamos automação/escala/IA, nunca acesso |

**Emissores fiscais** (âncora do add-on da §7):

| Referência | Preço | Leitura para o SICAT |
|---|---|---|
| Focus NFe | Solo R$ 89,90 → Growth R$ 548/mês; excedente R$ 0,10–0,12/doc; CT-e/MDF-e inclusos — **alta** | custo do parceiro fiscal validado: R$ 0,10–0,14/doc |
| Bsoft (emissor do transportador) | CT-e R$ 92 · CT-e+MDF-e R$ 140/mês — **alta** | âncora do preço final: add-on do SICAT parte de R$ 99 com prêmio pelo vínculo MTR↔CT-e |
| PlugNotas, Migrate/InvoiCy | sob consulta — **alta** | candidatos a parceria por volume |

## 5. Estrutura de custos

> Legenda de confiança: **alta** = preço público lido na fonte oficial em 2026-07-16; **média** =
> agregador/fonte com mais de 12 meses; **baixa** = fonte antiga/indireta (ordem de grandeza);
> **premissa** = estimativa interna a validar. Espelho desta tabela:
> aba "Linhas de custo" da planilha + [CSV](./plano-comercial-sicat.linhas-de-custo.csv).

**Fixo mensal:**

| Item | Faixa (R$) | Confiança | Observação |
|---|---|---|---|
| Infra cloud — lançamento (≤ 30 clientes) | 150–800 | alta | Magalu BV2/BV4 + storage no free tier do R2 (nacional, ~R$ 150–300) até AWS sa-east-1 gerenciada (~R$ 785) |
| Infra cloud — crescimento (≤ 150) | 1.800–3.500 | média | 2 nós + Postgres gerenciado HA + monitoração |
| Infra cloud — escala (150+) | 4.000–8.000 | baixa | cluster gerenciado + réplica + DR |
| Custo fixo de operação (sem folha) | 10.000 | premissa | infra + 0,5 FTE suporte/CS + ferramentas/contabilidade + marketing |
| Folha core (1 dev + fundador parcial) | 20.000 | premissa | linha separada nos cenários |

**Variável por cliente/mês:** suporte/CS a R$ 60/h [PREMISSA] × horas por plano (0,25 h no Essencial
a 5 h + CSM no Enterprise) + onboarding mensalizado + infra/storage rateados (R$ 8–60 por plano).

**Variável por uso:**

| Item | Valor | Confiança | Observação |
|---|---|---|---|
| IA — por turno de chat | **≈ R$ 0,06** | média | classe Haiku (US$ 1/5 por MTok, oficial) com prompt caching ~70% e câmbio 5,10; fórmula viva na aba Premissas |
| IA — por arquivo ingerido | ≈ R$ 0,26 | média | ~50 mil tokens de input |
| Storage de PDFs | ~R$ 0,10–0,25/GB·mês | média | 1.500 DOs/mês × 24 meses ≈ 5,4 GB ≈ R$ 1 — desprezível (cabe no free tier do R2 no lançamento) |
| Banco/fila por DO | ~R$ 0,001 | premissa | Postgres-como-fila: sem broker para pagar |

Com as cotas 100% usadas (pior caso), o custo total por cliente fica em ~R$ 32 (Essencial), ~R$ 124
(Profissional), ~R$ 345 (Operacional) e ~R$ 880 (Enterprise) — margens brutas de **75% / 65% / 62% /
56%**. Uso real de IA tende a 30–50% da cota, então as margens reais são maiores. **Regra de
sanidade: manter margem ≥ 60% em todos os planos; se a IA corroer, ajustar cota antes de preço.**

## 6. O modelo de pricing: híbrido com cotas de IA inclusas

### Cartão de planos [PREMISSA — faixas na planilha]

| | **Essencial** (Micro) | **Profissional** (PME) | **Operacional** (Pro) | **Enterprise** |
|---|---|---|---|---|
| Mensalidade | R$ 99–149 (partida **129**) | R$ 299–399 (partida **349**) | R$ 799–1.099 (partida **899**) | a partir de **R$ 1.990** (custom) |
| Franquia DOs/mês | 30 | 300 | 1.500 | 5.000+ negociada |
| Excedente por DO | R$ 1,50 | R$ 1,00 | R$ 0,70 | R$ 0,45 |
| Contas CETESB | 1 | 3 | 10 | ilimitadas* |
| Usuários | 2 | 5 | 15 | ilimitados* |
| Emissão em lote / recebimento / CDF / MTR provisório | ✔ | ✔ | ✔ | ✔ |
| DMR | preparação ("transmissão: em breve") | idem | idem | idem |
| Relatórios + export CSV | básico | completo | completo + agendado | completo + API |
| Fila/DLQ visível + dashboards | básico | ✔ | ✔ | ✔ + suporte dedicado |
| Auditoria por correlationId | 90 dias | 12 meses | 24 meses | 60 meses/export |
| Retenção de PDFs | 12 meses | 24 meses | 60 meses | contratual |
| **IA: interações + arquivos/mês** | 100 + 10 | 500 + 50 | 2.000 + 200 | 5.000 + 500 (custom) |
| SSO Keycloak / RBAC custom | — / básico | — / ✔ | ✔ / ✔ | ✔ + IdP do cliente |
| Suporte | e-mail | e-mail+chat D+1 | prioridade 8×5 | SLA + CSM |
| Onboarding | self-service | assistido (1 h) | assistido (4 h) | projeto |

\* ilimitado comercial com fair use contratual.

**Racional dos degraus**: a franquia cresce mais rápido que o preço em todos os degraus (10×/2,7×,
5×/2,6×, 3,3×/2,2×), então o R$/DO incluso **cai** de R$ 4,30 → R$ 1,16 → R$ 0,60 → R$ 0,40 — quem
cresce é premiado. O excedente de cada plano fica acima do R$/DO do plano seguinte, então o upgrade
é sempre racional; alertas em 80/100/120% da franquia (entregues junto com o metering, P-05)
empurram a conversa antes da fatura doer.

**Por que a IA é inclusa com cota (e não add-on)**: é o diferenciador de venda contra o portal
gratuito e contra os concorrentes — dos players com página pública, só Vertown ("diagnóstico com
IA") e Ambisis ("emite e monitora MTRs com IA") declaram IA; **nenhum expõe IA conversacional que
opera a conta CETESB do cliente com guardrails e trilha de auditoria**, que é o que o SICAT entrega;
o custo é baixo e controlável (pior caso no Profissional:
500 × R$ 0,06 + 50 × R$ 0,26 ≈ **R$ 44/mês ≈ 13% da mensalidade**); e a margem é protegida por
mecanismos, não esperança: cota por plano + hard cap técnico de tokens/org/dia + prompt caching
(~70% de hit no prefixo estável de system+tools) + fair use + cláusula de repactuação se o custo de
provedor variar > 25%. Outlier compra o add-on **IA Escala**: +R$ 149/mês por bloco de 1.000
interações + 100 ingestões [PREMISSA].

### Gates de upsell

| Gate | Puxa | Por quê funciona |
|---|---|---|
| Contas CETESB (1→3→10→∞) | qualquer → superior | cerca natural de transportadora/consultoria; valor cresce com a carteira |
| Usuários | Micro→PME→Pro | equipe = operação séria = disposição a pagar |
| SSO + RBAC custom | PME→Pro/Ent | requisito de TI corporativa; custo marginal ~zero (Keycloak já existe) |
| Retenção/auditoria longa | PME→Pro→Ent | compliance ambiental exige histórico; storage custa centavos — margem quase pura |
| Fila/DLQ + relatórios agendados | PME→Pro | só quem opera volume sente essa dor |
| Cotas de IA | todos | ver acima |

### Regras comerciais

- **Excedente**: medido no mês, faturado no seguinte; **teto de 2× a mensalidade** — acima disso,
  upgrade compulsório na renovação (evita fatura-surpresa e força a conversa comercial).
- **Anual**: 2 meses grátis ("12 pelo preço de 10"). Enterprise: 12–24 meses com IPCA + cláusula de
  repactuação de cota de IA.
- **Sem free tier**: o "grátis" já existe (portal CETESB). Um plano gratuito do SICAT canibalizaria
  o Essencial e atrairia exatamente o usuário de 5 MTR/mês que nunca converte, pagando custo de
  suporte e de sessão CETESB. **Trial de 14 dias** (20 DOs + 30 interações de IA + 5 ingestões +
  1 conta, sem cartão), dados preservados por 60 dias após expirar.
- **Migração**: upgrade imediato com pro-rata (franquia nova vale integral no mês); downgrade só na
  virada do ciclo, bloqueado se o uso corrente exceder as cercas do destino (contas excedentes ficam
  read-only até adequação).
- **Canal**: consultorias ambientais e transportadoras com carteira = parceiros com 15–20% de
  comissão recorrente [PREMISSA] ou conta master Pro/Enterprise com sub-organizações — o multi-conta
  CETESB + RBAC já suportam o modelo.

## 7. Add-on fiscal (roadmap precificado — NÃO existe hoje)

Escopo: **CT-e** (transporte intermunicipal/interestadual de resíduos) + **MDF-e** (obrigatório para
acompanhar a carga — por isso o bundle nunca separa), depois NFS-e (coletas intramunicipais) e CTR
eletrônico municipal (SP Regula). Contratável a partir do **Profissional** (o micro que precisa de
CT-e já estoura para PME pelas cercas da §3).

| Componente | Faixa [PREMISSA] | Racional |
|---|---|---|
| Setup por CNPJ (única vez) | **R$ 499–999** | credenciamento assistido na SEFAZ-SP, certificado A1, CFOPs 5.351 (intra) / 6.351 (interestadual), série/numeração, homologação — trabalho humano real |
| Mensalidade CT-e+MDF-e por CNPJ | **R$ 99–299** (partida 179) | ancorado no Bsoft (CT-e R$ 92 / bundle R$ 140); o SICAT cobra prêmio pelo **vínculo MTR↔CT-e↔MDF-e da mesma viagem** — ninguém mais amarra o manifesto ambiental ao documento fiscal |
| Por documento (degressivo) | **R$ 0,60 / 0,45 / 0,35** (até 200 / até 1.000 / acima) | custo do parceiro validado em R$ 0,10–0,14/doc (Focus NFe) → margem 2,5–6×; storage do XML por 5 anos incluso |
| NFS-e (fase 2) | +R$ 99–149/CNPJ + R$ 0,40/nota | coletas intramunicipais; padrão NFS-e Nacional + capital primeiro |
| CTR SP Regula (fase 3) | +R$ 99–199/CNPJ | nicho capital; gatilho: ≥ 10 clientes pedindo |

**Pré-requisitos do cliente** (regulatório, custo dele): Inscrição Estadual + credenciamento como
emissor de CT-e na SEFAZ-SP; certificado digital ICP-Brasil **A1** (R$ 150–250/ano; A3 fora do
escopo da fase 1); RNTRC/ANTT válido; NF do gerador quando aplicável; natureza "coleta/transporte de
resíduos".

**Pré-requisitos do produto** (nada disso existe): integração de emissão via **API fiscal parceira**
(decisão make-vs-buy: emissor próprio sobre o gateway SEFAZ do ContaViva-360 só se o volume agregado
passar de ~30 mil docs/mês — linhas de referência de custo na aba "Linhas de custo" da planilha), DACTE/DAMDFE em PDF, tratamento de rejeições SEFAZ
reaproveitando o padrão fila/retry/DLQ do MTR, cofre de certificados A1 (criptografia at-rest, LGPD),
vínculo MTR↔CT-e↔MDF-e, ambiente de homologação e metering fiscal no mesmo modelo de DOs.
**Esforço fase 1: 6–10 semanas de 1 dev (R$ 40–70 mil)** [PREMISSA]. Pré-venda apenas com rótulo
explícito de roadmap para 5–10 transportadoras design partners (setup grátis, mensalidade −50% por
6 meses) — nunca em contrato padrão (P-10).

## 8. Simulação de receita e break-even

> Os números saem da **calculadora** (aba "Simulador de receita") com as premissas default —
> mude os nº de clientes ou preços lá e tudo recalcula. O golden check (`tools/verify_xlsx.py`)
> compara doc/planilha nos cenários, no custo de IA e nas margens por plano. O "MRR total" já
> inclui **+10% (k_extra)** de excedentes e add-ons sobre as assinaturas (MRR base puro do
> cenário-base: R$ 26.802). O custo fixo é mantido constante em R$ 10 mil (infra da fase de
> lançamento); com a infra de crescimento (R$ 1,8–3,5 mil, necessária perto de 80+ clientes), o
> resultado do cenário-base cai ~R$ 1–2,7 mil/mês — a planilha permite simular.

| Cenário (mês 12) | Clientes (Ess/Prof/Oper/Ent) | MRR total | Resultado s/ folha | Resultado c/ folha core | Margem bruta |
|---|---|---|---|---|---|
| **Conservador** | 15/8/2/0 | **R$ 7.178** | −R$ 4.978 | −R$ 24.978 | 70,0% |
| **Base** | 40/30/8/2 | **R$ 29.482** | +R$ 9.989 | −R$ 10.011 | 67,8% |
| **Otimista** | 80/70/20/6 + fiscal em 15 CNPJs | **R$ 76.447** | +R$ 43.089 | +R$ 23.089 | 69,4% |

**Break-even**: MRR ≈ **R$ 14.750** sem folha (≈ 40 clientes no mix base) · **R$ 44.249** com folha
core — entre o cenário base e o otimista. **Sensibilidades a testar na planilha**: ±20% no preço do
Profissional (é o plano-motor: ~40% da receita em todos os cenários), churn 2,5% a.m. [PREMISSA],
CAC R$ 400–900 [PREMISSA], e % de uso real das cotas de IA.

**Dimensão do mercado** (§D da pesquisa): o SINIR registrou **4,08 milhões de MTRs em 2023**
(474,8 mil geradores, 73,4 mil transportadores, 28,6 mil destinadores) e o SIGOR-SP — provavelmente
mercado **adicional** ao nacional (indício: ritmos diários comparáveis) — tinha ~56 mil empresas e ritmo de ~2,2 milhões de MTRs/ano no último
número público (2021, confiança baixa). Capturar 80 clientes (cenário base) é ~0,14% das empresas do
SIGOR: a limitação é canal/execução, não TAM.

## 9. Riscos, gaps e pendências

| ID | Risco/pendência | Resposta no modelo |
|---|---|---|
| **P-01** | Disposição a pagar não validada (mercado todo "sob consulta") | 3–5 pilotos pagantes com desconto de fundador ANTES de congelar a tabela; cotação disfarçada nos concorrentes |
| **P-02** | Custo real de IA por turno é premissa (22k/800 tokens) | medir em produção via Langfuse/metering; gatilho de revisão se IA > 20% da mensalidade por 2 meses |
| **P-03** | Dependência de API não-oficial da CETESB (contrato do portal pode mudar) | **SLA honesto em 2 camadas**: (a) disponibilidade da plataforma + garantia de reprocessamento pela fila; (b) exclusão contratual de indisponibilidade/mudança do portal, com best effort de adequação em 5 dias úteis. **Nunca vender "uptime de emissão"**. Monitorar drift via portal-contracts. **Oportunidade**: o manual oficial do SIGOR documenta web services — avaliar migração para integração oficial |
| **P-04** | DMR remota pendente (stub) | proibição interna: nenhuma proposta cita DMR completa; lançar como upgrade grátis |
| **P-05** | **Metering de DOs não existe** — sem ele, franquia e excedente são inauditáveis | pré-requisito de go-live comercial: evento faturável derivado de `jobs`/auditoria + export mensal (~1–2 semanas de dev). Billing embutido depois (reaproveitar NeuroEvolui) |
| **P-06** | Custo de IA variável (token + câmbio) | cotas + hard cap + caching + fair use + repactuação > 25% (§6) |
| **P-07** | LGPD: credenciais CETESB de terceiros, dados de parceiros, IA com provedores externos | DPA anexo ao contrato; criptografia at-rest; lista de suboperadores com opt-out de treinamento; no fiscal, cofre A1 com trilha de acesso; assessoria jurídica pontual (R$ 5–10 mil one-off) |
| **P-08** | **01/08/2026: login do MTR Nacional (SINIR) passa a ser exclusivo via Gov.br** | risco direto para expansão nacional e sinal de endurecimento de autenticação nos portais públicos; provisão de engenharia + acompanhar se o SIGOR seguirá |
| **P-09** | Segredo vazado no histórico do repo (GCP API Key, pendência conhecida) | rotacionar antes de qualquer due diligence Enterprise |
| **P-10** | Vender fiscal antes de existir | só pré-venda design partners com rótulo de roadmap (§7) |

## 10. Sequência recomendada

1. **Hoje (sem gastar)**: aprovar este plano; implementar o **metering de DOs** (P-05, 1–2 semanas —
   único dev obrigatório antes de cobrar); rotacionar o segredo do histórico (P-09).
2. **Pilotos (validação)**: 3–5 clientes pagantes com desconto de fundador — 1 gerador PME,
   2 transportadoras, 1 destinador — medindo custo real de IA (P-02) e disposição a pagar (P-01).
3. **Congelar e publicar**: ajustar a tabela com os dados dos pilotos, publicar preços no site
   (diferenciação contra o "sob consulta" do setor) e ativar o canal de consultorias.
4. **Add-on fiscal**: só depois do MRR base — pré-venda com design partners, fase 1 via API
   parceira (§7), com a decisão make-vs-buy revisitada com volume real.
5. **Contínuo**: monitorar drift do portal CETESB (P-03), avaliar web services oficiais do SIGOR e o
   impacto do Gov.br no SINIR (P-08).

## 11. Apêndice A — Fontes

Pesquisa executada em **2026-07-16** com verificação adversarial (cada preço re-lido na página-fonte
por um segundo agente). **Lista completa de URLs, datas e vereditos: [01-pesquisa-mercado.md](./01-pesquisa-mercado.md).**
Principais grupos:

- **Concorrentes**: [vertown.com/planos](https://www.vertown.com/planos/) · [go.vertown.com](https://go.vertown.com/) ·
  [app.vgresiduos.com.br](https://app.vgresiduos.com.br/) (rebranding VG→Vertown) · meuresiduo.com ·
  gsolution.com.br · projetodraft.com (2017) · gazetadopovo.com.br (2018).
- **Emissores fiscais**: [focusnfe.com.br/precos](https://focusnfe.com.br/precos/) · bsoft.com.br ·
  bling.com.br · plugnotas/tecnospeed · migrate/invoicy.
- **Infra**: price lists oficiais Magalu Cloud, Locaweb, Hostinger, DigitalOcean, AWS sa-east-1,
  Cloudflare R2, Backblaze B2.
- **IA**: tabela oficial de preços Anthropic (Haiku 4.5: US$ 1/5 MTok; cache 0,1×/1,25×) e OpenAI
  (mini: US$ 0,75/4,50).
- **Câmbio**: PTAX de 16/07/2026 via [olinda.bcb.gov.br](https://olinda.bcb.gov.br/).
- **TAM/regulatório**: sinir.gov.br (painéis até out/2024) · mtr.sinir.gov.br (aviso Gov.br
  01/08/2026) · manual oficial SIGOR/CETESB (vr. 30/03/2026) · Portaria MMA 280/2020 · Decreto
  Estadual 60.520/2014 · Resolução SIMA 27/2021 · DD CETESB 024/2022/P · Econodata (CNAE 38.1).

---
_Relacionados: [01-pesquisa-mercado.md](./01-pesquisa-mercado.md) ·
[planilha calculadora](./plano-comercial-sicat.xlsx) ·
[one-pager PDF](./one-pager-plano-comercial-sicat.pdf) ·
[tools/premissas.json](./tools/premissas.json) (fonte única) ·
[tools/README.md](./tools/README.md) (como regenerar) ·
[estado-atual](../10-estado-atual/estado-atual.md) ·
[backlog CTO](../_inputs/fonte-de-verdade-backlog-cto.md)_
