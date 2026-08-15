---
title: "10 — Gate regulatório bloqueante"
status: proposta
updated: 2026-07-10
language: pt-BR
---

# 10 — Gate regulatório bloqueante

Decisão registrada em [ADR-007](./adr/ADR-007-gate-regulatorio-bloqueante.md). Posição no
sequenciamento: trava transversal, não fase — ver [09-roadmap §9](./09-roadmap.md).

## 1. De checklist informativo a trava de plataforma

Hoje o checklist de tokenização instanciado em cada caso contém **7 itens regulatórios marcados
`requiresLegal: true`** (`api/src/domain.js:188-194`, categoria `regulatorio`, rotulada
"Regulatório (CVM/BCB/LGPD) — requer validação" em `api/src/domain.js:211`). São **perguntas de
levantamento por caso**: nascem `nao_avaliado`, aceitam qualquer resposta e **não travam nada** —
o próprio ESCOPO-FUNCIONAL.md §6.2 as define como instrumento de levantamento, "sem concluir
enquadramento".

Esta evolução os **eleva a bloqueantes formais em nível de plataforma**: além do levantamento por
caso (que permanece), cada chave vira **um** `regulatory_gate_item` global que só é satisfeito com
**parecer externo anexado, emitido por profissional habilitado e identificado**. Enquanto o
conjunto não estiver aprovado, o flag global `go_live_enabled` permanece `false` e o sistema
**recusa em código** qualquer operação de valor real (§4).

Racional: as fases 0–4 do roadmap constroem tudo em regime de demonstração/piloto; o que separa a
demonstração da operação real é exatamente o enquadramento regulatório — e essa fronteira não pode
depender de disciplina processual, tem que ser **enforcement técnico fail-closed**.

## 2. Os 7 itens, um a um

As chaves e rótulos abaixo são **exatamente** os do `TOKENIZATION_TEMPLATE`
(`api/src/domain.js:188-194`). O "o que observar" vem do ESCOPO-FUNCIONAL.md §6.2 (que detalha as
mesmas perguntas com chaves longas de levantamento — ex.: `is_security_cvm`,
`needs_offer_registration_or_exemption`; **as chaves canônicas do gate são as do código**). Toda
evidência é um **parecer/documento de profissional habilitado, identificado** (nome, registro
profissional, data, escopo), anexado ao item do gate.

### 2.1 `is_security` — "O token pode ser valor mobiliário? (CVM Parecer 40)"

- **O que observar (§6.2 item 1):** aplicar o teste do contrato de investimento coletivo —
  investimento em dinheiro/bens, caráter coletivo, expectativa de benefício, esforço de terceiro;
  registrar a natureza do direito subjacente (a classificação depende da **essência econômica**,
  não do rótulo "token"), a existência de promessa de rendimento e quem gera o retorno. Atenção:
  no BESC o subjacente é ação/direito litigioso — o item 15 do checklist técnico
  (`future_distribution`) aproxima o token de valor mobiliário.
- **Evidência exigida:** parecer jurídico fundamentado no Parecer de Orientação CVM 40, concluindo
  pelo enquadramento (é/não é valor mobiliário) para o desenho concreto do produto.
- **Quem emite:** advogado especialista em mercado de capitais (direito societário/CVM),
  identificado com OAB.

### 2.2 `offer_registration` — "Precisa de registro/dispensa de oferta? (Res. CVM 88)"

- **O que observar (§6.2 item 2):** se for valor mobiliário, oferta pública exige registro (regime
  geral, Res. CVM 160) **ou** enquadramento em crowdfunding via plataforma registrada (Res. CVM
  88); verificar tetos de captação, limites por investidor e requisitos de porte **vigentes**;
  avaliar o risco de a circulação secundária livre em blockchain conflitar com o regime da oferta.
- **Evidência exigida:** parecer/memorando de enquadramento de oferta definindo o trilho
  (registro, dispensa, crowdfunding ou "não se aplica" se `is_security` concluir que não é valor
  mobiliário), com limites numéricos citados de fonte primária vigente.
- **Quem emite:** advogado CVM / assessor regulatório de ofertas.

### 2.3 `fidc_structure` — "Estrutura via FIDC / direito creditório? (Res. CVM 175)"

- **O que observar (§6.2 item 3):** existência de direitos creditórios elegíveis e verificáveis
  (originação, cessão válida, ausência de vícios); papéis obrigatórios (administrador, gestor,
  custodiante); segregação de cotas sênior/subordinada; elegibilidade de investidor de varejo.
- **Evidência exigida:** parecer/estudo de estruturação concluindo se o trilho FIDC se aplica ao
  produto BESC (ou registrando `nao_se_aplica` fundamentado).
- **Quem emite:** estruturador/assessor regulatório de fundos + advogado especializado
  (Res. CVM 175).

### 2.4 `vasp_bcb` — "Enquadra no Marco Legal de Ativos Virtuais / BCB (VASP)?"

- **O que observar (§6.2 item 4):** a linha divisória — se o token representa valor mobiliário, a
  competência é da CVM; se for criptoativo de pagamento/utilitário sem natureza de valor
  mobiliário, do BCB; verificar o **estágio vigente** da regulamentação de VASPs e registrar a
  decisão CVM vs BCB vs ambos. Este item **muda o desenho do produto**: trilho VASP vs trilho CVM
  implica obrigações diferentes (por isso KYC real não se antecipa — §6).
- **Evidência exigida:** parecer de enquadramento no Marco Legal de Ativos Virtuais
  (Lei 14.478/2022 e regulamentação BCB vigente), com conclusão sobre necessidade de autorização.
- **Quem emite:** advogado regulatório (bancário/meios de pagamento/criptoativos).

### 2.5 `kyc_aml_pldft` — "Necessita PLD-FT / COAF?"

- **O que observar (§6.2 item 5):** obrigações de identificação de clientes, KYC/KYT (screening de
  carteiras, sanções/PEP), monitoramento de operações, trilha de auditoria e workflow de
  comunicação de operação suspeita ao COAF; as obrigações **variam por perfil** (VASP vs
  plataforma CVM), então este item depende da conclusão de `vasp_bcb`/`is_security`.
- **Evidência exigida:** parecer + desenho mínimo do programa de PLD-FT aplicável (políticas,
  responsável, gatilhos de comunicação), ou `nao_se_aplica` fundamentado.
- **Quem emite:** advogado/consultor de compliance especializado em PLD-FT.

### 2.6 `lgpd` — "Conformidade LGPD (dados pessoais / whitelist)?"

- **O que observar (§6.2 item 6):** base legal por tratamento (cadastro, whitelist, KYC),
  minimização e retenção, direitos do titular; **não gravar PII on-chain** (manter off-chain com
  ponteiro/hash — princípio já adotado na trilha de auditoria, doc
  [07-trilha-auditoria](./07-trilha-auditoria.md)) diante da imutabilidade vs direito de
  eliminação; definição de controlador/operador e DPO. Nota: a tensão LGPD do portal atual
  (dados sucessórios públicos) já é tratada na Fase 0 (gating de `/cases*`) e na curadoria
  ([11-curadoria-conteudo](./11-curadoria-conteudo.md)) — o item do gate cobre o **marketplace**.
- **Evidência exigida:** parecer/relatório de impacto (RIPD) cobrindo os fluxos do marketplace,
  assinado, com designação de DPO.
- **Quem emite:** DPO/advogado de privacidade e proteção de dados.

### 2.7 `taxation` — "Aspectos tributários (ganho de capital) mapeados?"

- **O que observar (§6.2 item 7):** ganho de capital para PF e obrigações acessórias de declaração
  à RFB; rendimentos de valores mobiliários/cotas seguem o regime do instrumento; alíquotas,
  faixas e obrigatoriedade **vigentes**; emissão de informes aos investidores. Inclui o tratamento
  tributário das duas receitas da plataforma (fee de 1ª transferência e aluguel — doc
  [06-modelo-receita](./06-modelo-receita.md)).
- **Evidência exigida:** parecer tributário cobrindo o investidor (ganho de capital, informes) e a
  operação da plataforma (tributação das receitas).
- **Quem emite:** tributarista (advogado tributário ou contador habilitado).

> O §6.2 do ESCOPO tem um 8º item de levantamento (`needs_regulatory_advisor` — necessidade de
> assessoria/estruturador). Ele **não** vira item do gate: é o **passo 1 do processo** (§5) — a
> contratação da assessoria é pré-condição para emitir os 7 pareceres.

## 3. Entidades

DDL conceitual completa no [Apêndice B](./apendices/B-ddl-conceitual.md); shape essencial:

```sql
regulatory_gate_item (               -- exatamente 7 linhas, seed 1:1 com as chaves do código
  id UUID PK,
  key TEXT UNIQUE NOT NULL,          -- is_security | offer_registration | fidc_structure |
                                     -- vasp_bcb | kyc_aml_pldft | lgpd | taxation
  question_label TEXT NOT NULL,      -- rótulo espelhado do TOKENIZATION_TEMPLATE no boot
  status TEXT NOT NULL DEFAULT 'pending',  -- pending | satisfied | not_applicable | reopened
  answer TEXT,                       -- 'sim' | 'nao_se_aplica' (enum do checklist reusado)
  opinion_document_ref JSONB,        -- referência ao parecer anexado (obrigatório p/ sair de pending)
  professional_name TEXT,            -- profissional habilitado, identificado
  professional_registration TEXT,    -- OAB/CRC/etc.
  issued_at DATE,                    -- data do parecer
  recorded_by UUID FK->users,        -- gestor que registrou
  recorded_at TIMESTAMPTZ,
  notes TEXT
)

regulatory_gate_approval (           -- APPEND-ONLY de ATOS: cada linha é um ato de decisão;
                                     -- revogação = NOVA linha kind='revoked', nunca UPDATE
  id PK,
  kind TEXT NOT NULL,                -- granted | revoked
  approved_by UUID FK->users NOT NULL,
  occurred_at TIMESTAMPTZ NOT NULL,
  item_snapshot JSONB NOT NULL,      -- snapshot dos 7 itens + refs dos pareceres no momento do ato
  notes TEXT
)
-- go_live_enabled é DERIVADO do último ato (granted ⇒ true; revoked/nenhum ⇒ false) — nunca
-- coluna editável (§4)
```

- `regulatory_gate_item` é **de plataforma** (não por caso): os itens por caso do checklist
  continuam existindo como levantamento, mas o gate é único e global.
- `not_applicable` **também exige parecer** — "não se aplica" é uma conclusão jurídica, não uma
  omissão (mesmo espírito do enum `nao_se_aplica` do checklist atual).
- Toda mutação emite `audit_event` na mesma transação (taxonomia `gate.item.updated`,
  `gate.approved`, `gate.revoked`, `gate.item.reopened` — doc
  [07-trilha-auditoria](./07-trilha-auditoria.md)).

## 4. `go_live_enabled` — recusa EM CÓDIGO

`go_live_enabled` é um valor **derivado**, nunca editável diretamente:

```
go_live_enabled = (último ato de regulatory_gate_approval tem kind='granted')
                  AND todos os 7 regulatory_gate_item ∈ {satisfied, not_applicable}
                  (cada um com opinion_document_ref preenchido)
```

Enquanto `false`, o besc-api recusa (guard `requireGoLive()` fail-closed, HTTP `403` com corpo
padronizado apontando para o gate) as seguintes operações — a lista é **fechada e testada**:

| # | Operação travada | Onde morde |
|---|---|---|
| 1 | Marcar investidor como **apto a operar valor real** (elevação de capacidade além do demo) | `/gestao/usuarios` — aprovação continua existindo, mas só para o regime de demonstração |
| 2 | **Remover o watermark** "ambiente de demonstração" da área do investidor | config de tema/flag do frontend servida pela API — sem `go_live_enabled`, a API não emite o estado "sem watermark" |
| 3 | **Emitir fatura fora do piloto** (invoice para contraparte não marcada como interna/piloto) | serviço de `invoice` (Fase 4) — doc [06-modelo-receita](./06-modelo-receita.md) |
| 4 | **Emissão on-chain real** (adapter apontando para rede com valor real; Besu **de teste** da Fase 3 é permitido) | configuração do `LedgerPort` — doc [05-camada-ledger-blockchain](./05-camada-ledger-blockchain.md) |

A revogação da aprovação (ex.: parecer superado por mudança regulatória) derruba
`go_live_enabled` imediatamente e re-trava as 4 operações — reabrir um item
(`status='reopened'`) tem o mesmo efeito, pois a derivação exige todos satisfeitos.

A composição exata da lista de operações travadas (se algo mais deve entrar — ex.: convite de
auditores externos reais) é **DECISÃO — revisar** junto com a assessoria contratada
([ADR-007](./adr/ADR-007-gate-regulatorio-bloqueante.md)).

## 5. Processo de aprovação e auditoria do gate

1. **Contratar a assessoria** jurídica/regulatória (absorve o item `needs_regulatory_advisor` do
   §6.2). Pode começar **imediatamente**, em paralelo às fases do roadmap.
2. **Responder item a item**: para cada chave, o profissional emite o parecer; o Gestor registra
   no item (`answer` + `opinion_document_ref` + identificação do emissor + data). Registro sem
   parecer anexado é rejeitado pela API (validação, não convenção).
3. **Revisão do conjunto**: com os 7 itens fora de `pending`, o Gestor executa a aprovação
   (`regulatory_gate_approval`), que congela o `item_snapshot` (quais pareceres, de quem, de
   quando) — a decisão fica reconstituível para sempre.
4. **Flag liga**: `go_live_enabled` passa a derivar `true`; as 4 operações destravam. Cada
   destrave subsequente (ex.: primeira remoção do watermark) gera seu próprio `audit_event`.
5. **Vigilância contínua**: mudança regulatória ou parecer com prazo → Gestor reabre o item
   afetado → flag cai → operações re-travam. Política de validade/reavaliação periódica dos
   pareceres (ex.: revisão anual): **DECISÃO — revisar** com a assessoria
   ([ADR-007](./adr/ADR-007-gate-regulatorio-bloqueante.md)).

**Auditoria:** todos os passos acima são eventos na trilha hash-chain (doc 07) e entram no export
pericial; o relatório do gate (estado dos 7 itens + pareceres + histórico de aprovações/
revogações) é uma projeção direta dessas tabelas, exposta em `/gestao` e no export de auditoria.

## 6. O que o gate NÃO cobre

- **KYC/PLD-FT real e retenção LGPD operacional** entram **depois** do gate, conforme os pareceres
  ditarem — o desenho muda se o trilho for VASP/BCB vs CVM (por isso não se antecipa
  implementação; hoje só existem os ganchos `kyc_status` e o programa descrito no parecer).
- O gate **não substitui** o checklist regulatório por caso (levantamento continua obrigatório
  caso a caso) nem o gate de elegibilidade documental caso→título (doc
  [04-maquina-estado-juridico](./04-maquina-estado-juridico.md)) — são três camadas diferentes:
  plataforma (este doc), dossiê (checklist) e ativo (elegibilidade).
