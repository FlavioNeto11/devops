<!--
  SNAPSHOT IMUTÁVEL — NÃO EDITAR.
  Origem: pesquisa profunda (deep research) entregue em 13/08/2026.
  Data de referência regulatória: 13/08/2026.
  Status: baseline regulatória aceita pelo produto (ver transporte-guia.md, seção "Status da baseline").
  Regra do programa: correções e evoluções normativas entram em transporte-guia.md e, quando viram
  regra de produto, no catálogo regulatório versionado do backend (regulatory_rule_versions) — nunca
  como edição deste arquivo. Nenhuma regra derivada deste relatório se torna BLOQUEANTE em produção
  sem item [LEGAL REVIEW REQUIRED] resolvido por revisão humana.
  Os marcadores `citeturn...`/`fileciteturn...` são artefatos de citação da ferramenta de
  pesquisa e foram preservados deliberadamente.
-->

# Estudo regulatório e arquitetura de evolução do SICAT para transporte rodoviário de cargas

## Conclusão executiva e atualização jurídica crítica

A análise do repositório `FlavioNeto11/devops`, combinada com a legislação e a regulamentação vigentes em **13 de agosto de 2026**, indica que a evolução não deve ser tratada como a simples adição de “CIOT, frete e pedágio” ao SICAT atual. O caminho tecnicamente mais seguro é criar dentro do produto um novo **bounded context de Transporte**, que pode ser apresentado comercialmente como **SICAT Transporte**, preservando o domínio ambiental existente de MTR/CDF/DMR e reutilizando a arquitetura, o Centro Operacional, a auditoria, a fila transacional e o design system já construídos. O SICAT atual é explicitamente uma plataforma de automação ambiental CETESB-SP, baseada em Vue 3/Vite no frontend, Node.js/Express/TypeScript no backend, PostgreSQL e worker assíncrono. fileciteturn8file0L2-L2 fileciteturn11file0L2-L2

Há uma atualização jurídica muito importante em relação ao conjunto de normas enviado na solicitação: a **Medida Provisória nº 1.343/2026 foi convertida na Lei nº 15.485, de 5 de agosto de 2026**, publicada em 6 de agosto de 2026, com veto parcial. Portanto, um projeto iniciado agora não deveria tratar apenas a Resolução ANTT nº 6.078/2026 como a grande mudança de 2026; deve incorporar a Lei nº 15.485/2026 como uma das principais fontes normativas do novo módulo. O Congresso registra a matéria como “transformada em norma jurídica com veto parcial”, e o veto correspondente é o Veto nº 43/2026. citeturn13view0turn14view0

Essa nova lei muda significativamente o requisito de produto porque alcança não apenas quem contrata frete. Ela sujeita às sanções relacionadas ao piso mínimo também quem **anuncia, oferta, publica ou intermedeia** transporte com valor inferior ao piso, incluindo expressamente plataformas digitais, sistemas eletrônicos e aplicativos. A consequência arquitetural é decisiva: o SICAT Transporte não deve simplesmente descobrir a irregularidade no momento de “liberar o caminhão”; ele deve impedir que uma oferta de frete juridicamente sujeita ao piso seja publicada ou formalizada abaixo do mínimo. citeturn22view0

Por isso, minha recomendação central é transformar o futuro SICAT Transporte em um **motor preventivo de conformidade da operação**, no qual uma operação somente avança entre estados quando passa por gates regulatórios versionados:

**proposta → contratação → CIOT → vale-pedágio → documentos fiscais → seguros/PGR → liberação → trânsito → encerramento.**

O CIOT tornou-se obrigatório desde **24 de maio de 2026 para toda operação de transporte rodoviário remunerado de cargas**, independentemente de o transportador ser TAC, ETC ou CTC, nos termos da Resolução ANTT nº 6.078/2026 e de sua implantação operacional. A Portaria SUROC nº 6/2026 acrescentou validações preventivas, entre elas a impossibilidade de gerar CIOT abaixo do piso nas operações de carga lotação sujeitas à Política Nacional de Pisos Mínimos e a vinculação ao MDF-e. citeturn24search0turn24search1turn24search6

A Lei nº 15.485/2026 levou essa lógica para um nível legal ainda mais forte: determina o registro prévio das operações remuneradas por meio do CIOT, define dados que devem integrar esse registro, estabelece regras de responsabilidade por sua geração, prevê sua vinculação ao MDF-e e determina que a ANTT suspenda o CIOT quando houver, entre outras hipóteses previstas em lei e regulamentação, incompatibilidade com o piso mínimo ou insuficiência de informações. A lei também estabeleceu prazo máximo de pagamento do frete de **30 dias úteis** e prevê multa de R$ 10.500 pela falta de CIOT. citeturn22view0

Ao mesmo tempo, não se deve transformar todas essas regras em `if/else` espalhados pelo código. A própria Lei nº 15.485/2026 contém transição regulatória: determina a edição de atos complementares pela ANTT, preserva as regras e sistemas anteriores no que não forem incompatíveis e prevê períodos de adaptação para determinadas obrigações que dependam de regulamentação ou integração tecnológica. Isso exige no produto um **catálogo regulatório temporal**, capaz de responder “qual regra valia nesta data?” em vez de simplesmente conhecer a regra “atual”. citeturn22view0

Também existe um ponto que merece atenção imediata de produto: houve vetos presidenciais no texto convertido em lei. Entre os dispositivos vetados está a obrigação que levaria a uma lógica específica de antecipação mínima de 70% do frete. Portanto, o SICAT **não deve implementar uma regra fixa de adiantamento de 70% como obrigação legal vigente**. O Veto nº 43/2026 ainda deve ser acompanhado, porque eventual deliberação posterior do Congresso pode modificar novamente a situação jurídica. citeturn14view0turn14view1

A recomendação, portanto, é que o SICAT Transporte seja pensado como quatro produtos em um:

| Camada | Responsabilidade do SICAT |
|---|---|
| **Cadastro e elegibilidade** | RNTRC, transportador, contratante, subcontratado, veículos, seguros e PGR |
| **Compliance preventivo** | Piso mínimo, CIOT, VPO, condições de contratação e documentação obrigatória |
| **Execução fiscal-operacional** | NF-e, CT-e, MDF-e, CIOT↔MDF-e, VPO↔MDF-e e eventos fiscais |
| **Prova e auditoria** | Evidências, snapshots de cálculo, versão normativa, respostas externas, timeline e justificativa de cada decisão |

Esta análise é uma especificação de produto e engenharia baseada nas fontes oficiais pesquisadas, não substituindo parecer jurídico ou tributário especializado antes de colocar regras bloqueantes em produção.

## Diagnóstico do SICAT no GitHub

O repositório mostra uma base muito mais madura para receber essa expansão do que um produto iniciado do zero. O SICAT já possui uma separação arquitetural rígida de **`route → service → repository → job → worker → gateway`**, com Postgres como fonte transacional, fila persistida na tabela `jobs`, `FOR UPDATE SKIP LOCKED`, locking otimista, idempotência e tratamento padronizado de erros. Comandos externos assíncronos preservam `correlationId`, `jobId`, `commandId`, `sessionContextId` e `integrationAccountId`, e erros HTTP seguem `application/problem+json`. fileciteturn11file0L2-L2 fileciteturn12file0L2-L2

A API também segue uma disciplina **contract-first**: alterações de superfície HTTP devem evoluir OpenAPI, exemplos, operações geradas, rotas e testes de contrato no mesmo PR. Isso é exatamente o padrão que eu manteria para CIOT, RNTRC, VPO, MDF-e e demais integrações externas, em vez de criar controladores especiais fora da arquitetura existente. fileciteturn11file0L2-L2 fileciteturn12file0L2-L2

O SICAT já implementa integração real com a CETESB, criação/submissão/impressão/cancelamento de manifestos, sincronização de catálogos, filas com retry/DLQ, auditoria, autenticação, frontend operacional e um Centro Operacional com consultas de jobs, retry, auditoria, saúde de integrações e relatórios. Portanto, grande parte das capacidades transversais exigidas pelo novo domínio já existe e deve ser reutilizada. fileciteturn9file0L2-L2 fileciteturn10file0L2-L2

O Centro Operacional é particularmente valioso para essa evolução. O repositório documenta endpoints para visão operacional, busca/retry de jobs, busca de auditoria, saúde de contas e sessões CETESB e relatórios de MTR. O frontend também já possui rotas dedicadas de operação e auditoria. Em vez de construir um segundo framework de observabilidade para ANTT/SEFAZ, eu estenderia esse mesmo Centro Operacional para novos buckets como `antt`, `ciot`, `rntrc`, `dfe`, `vpo`, `insurance` e `compliance`. fileciteturn10file0L2-L2

### O principal cuidado de domínio

Hoje a palavra **MTR** dentro do SICAT significa **Manifesto de Transporte de Resíduos**, associado à CETESB e ao contexto ambiental. O novo domínio possui **MDF-e**, CT-e, NF-e, CIOT e transporte rodoviário remunerado de cargas. Misturar essas duas semânticas dentro das atuais entidades `manifest`, `manifestos` ou do gateway CETESB produziria uma dívida arquitetural grave. O próprio contrato do repositório define o SICAT atual como plataforma MTR/CDF/DMR da CETESB-SP e protege o gateway CETESB como fronteira específica. fileciteturn11file0L2-L2 fileciteturn12file0L2-L2

Minha recomendação seria:

```text
SICAT
├── Ambiental
│   ├── MTR de resíduos
│   ├── DMR
│   ├── CDF
│   └── CETESB
│
└── Transporte
    ├── Operação de Transporte
    ├── RNTRC
    ├── Piso Mínimo
    ├── CIOT
    ├── Vale-Pedágio
    ├── NF-e / CT-e / MDF-e
    ├── Seguros / PGR
    ├── Compliance Gate
    └── Auditoria Regulatória
```

A busca realizada no repositório encontrou referências a MDF-e, CT-e e RNTRC principalmente na documentação comercial/pesquisa de mercado, enquanto o escopo técnico canônico documentado continua concentrado na automação ambiental CETESB. Isso reforça que o Transporte deve nascer como uma nova vertical do produto e não como uma alteração cosmética no atual fluxo de MTR. fileciteturn6file1L6-L10 fileciteturn13file0L1-L5 fileciteturn8file0L2-L2

### O que deve ser reaproveitado

Eu preservaria sem alteração conceitual o mecanismo de jobs, DLQ/retry, correlação, auditoria, idempotência, Postgres, OpenAPI, autenticação/RBAC, design system `Sicat*` e estrutura do Centro Operacional. A documentação do projeto já estabelece essas peças como padrões não negociáveis. fileciteturn11file0L2-L2

Para integrações externas novas, adicionaria gateways próprios:

```text
gateways/
  cetesb-gateway.js        # existente; não mexer na fronteira
  antt-ciot-gateway.ts
  antt-rntrc-gateway.ts
  dfe-gateway.ts
  vpo-gateway.ts
  insurance-gateway.ts
```

Esses nomes são uma recomendação arquitetural, não uma descrição do estado atual do código.

## Mapa regulatório vigente e impactos no produto

### Transporte rodoviário e RNTRC

A Lei nº 11.442/2007 continua sendo a base legal do transporte rodoviário de cargas por conta de terceiros e mediante remuneração. A Resolução ANTT nº 5.982/2022 estrutura o RNTRC e as categorias TAC, ETC e CTC. citeturn18search13

Entretanto, a Lei nº 15.485/2026 alterou novamente a Lei nº 11.442/2007 e inseriu uma lógica de **revalidação anual do RNTRC**, sujeita à regulamentação da ANTT. A própria lei contém regras transitórias para obrigações dependentes de novos atos regulatórios, razão pela qual não recomendo codificar imediatamente “365 dias = inválido” sem uma regra normativa com data de exigibilidade controlada. citeturn22view0

O RNTRC Digital atualmente permite procedimentos cadastrais por meio da plataforma oficial, e a ANTT também mantém dados abertos de transportadores/veículos que podem ajudar em caches e enriquecimento. Porém, dados abertos periodicamente publicados não deveriam ser a única evidência usada para liberar uma viagem sensível; a arquitetura deveria diferenciar **cache informativo** de **consulta operacional de regularidade**. citeturn18search0turn18search14

O SICAT deve, portanto, manter algo como:

```text
Transportador
  CNPJ/CPF
  categoriaRNTRC: TAC | ETC | CTC
  numeroRNTRC
  statusRNTRC
  statusVerificadoEm
  fonteVerificacao
  revalidacaoExigivelEm
  regraRegulatoriaAplicada
```

Não basta cadastrar “transportadora”. A elegibilidade deve ser novamente verificada em momentos de risco, especialmente antes da contratação e da liberação.

### CIOT e pagamento do frete

A mudança de 2026 é estrutural. A Resolução ANTT nº 6.078/2026 universalizou o CIOT para **toda operação de transporte rodoviário remunerado de cargas** a partir de 24 de maio de 2026, independentemente de TAC, ETC ou CTC. citeturn24search1turn24search3

Segundo a ANTT, o CIOT deve ser gerado **antes do início da operação**, e sua geração deve ser gratuita. A integração prevista é feita por Web Services e depende das responsabilidades e modalidades definidas na regulamentação. A própria ANTT alerta que a simples obtenção do CIOT não significa que toda a operação esteja definitivamente regular: fiscalização posterior pode confrontar CIOT, MDF-e, CT-e, nota fiscal, contrato e outros documentos. citeturn24search7

A Lei nº 15.485/2026 reforça e expande essa estrutura. Entre os dados a serem registrados no CIOT estão partes contratantes, inclusive eventual subcontratado, informações da carga, origem e destino, frete contratado/registrado, valor devido e elementos relacionados à forma e ao prazo de pagamento. A lei também disciplina quem é responsável pelo registro em diferentes cenários de contratação e determina vínculo do CIOT ao MDF-e, preferencialmente de forma integrada ou concomitante. citeturn22view0

Para TAC e hipóteses equiparadas, a regulamentação de pagamento possui relação com instituições autorizadas pelo Banco Central e habilitadas no ambiente ANTT. A arquitetura do SICAT deve, portanto, abstrair “provedor de CIOT/pagamento” e não codificar um único fornecedor. citeturn24search4turn24search8

O agregado CIOT deveria suportar o ciclo:

```text
PRE_VALIDATION
→ REQUESTED
→ REGISTERED
→ RECTIFIED
→ CLOSED

ou

→ CANCELLED
→ REJECTED
→ BLOCKED
```

com todos os requests, responses, códigos externos e justificativas auditáveis.

### Piso mínimo de frete

A Lei nº 13.703/2018 e a Resolução ANTT nº 5.867/2020 continuam sendo essenciais para a Política Nacional de Pisos Mínimos do Transporte Rodoviário de Cargas. As tabelas e coeficientes, porém, mudam ao longo do tempo, e a ANTT realiza atualizações periódicas e extraordinárias associadas à metodologia e à variação do diesel. A pesquisa oficial mais recente localizada para o período analisado mostra atualização em 2026, e a legislação agora consolida também o gatilho relacionado a variações de combustível. citeturn20view0turn15view0

A Lei nº 15.485/2026 disciplina elementos da metodologia como distância, configuração do veículo/eixos, natureza da carga e componentes de custo, além de determinar atualizações periódicas e previsão de ferramenta pública de simulação. A consequência para o software é que **coeficiente de piso jamais deve ser constante compilada no código**. citeturn15view0

É necessário um modelo semelhante a:

```text
freight_floor_versions
  normative_reference
  resolution
  published_at
  effective_from
  effective_until
  table_code
  coefficients
  source_hash
  reviewed_by
  review_status
```

e:

```text
freight_floor_calculations
  transport_operation_id
  rule_version_id
  calculation_inputs_snapshot
  minimum_amount
  offered_amount
  compliant
  calculation_trace
  calculated_at
```

Isso é importante não apenas para cálculo futuro, mas para auditoria. Uma operação de agosto não deve mudar de resultado retroativamente porque uma tabela de novembro substituiu os coeficientes.

A Portaria SUROC nº 6/2026 introduziu validação sistêmica para impedir a geração do CIOT em operações de **carga lotação sujeitas ao piso** quando o frete informado estiver abaixo do mínimo. A ANTT esclarece que nem toda operação cadastrada no CIOT necessariamente passa hoje por essa validação automática específica; a aplicação depende do enquadramento regulatório da operação. citeturn24search6turn24search12

Isso significa que o SICAT precisa separar:

```text
CIOT obrigatório?
Piso mínimo aplicável?
Validação automática ANTT do piso aplicável?
Operação carga lotação?
Regra de cálculo aplicável?
```

Em vez de uma regra incorreta como:

```text
se tem CIOT, então sempre calcula piso da mesma forma
```

A alteração mais sensível trazida pela Lei nº 15.485/2026 é que a proibição alcança plataformas e sistemas que anunciem, ofertem, publiquem ou intermedeiem frete abaixo do piso. Isso cria um argumento forte para o SICAT colocar o `FreightFloorEngine` **antes da publicação da oferta**, e não somente antes do embarque. citeturn22view0

### Vale-Pedágio Obrigatório

A Lei nº 10.209/2001 e a Resolução ANTT nº 6.024/2023 estabelecem o Vale-Pedágio Obrigatório. A despesa deve ser antecipada pelo embarcador ou equiparado ao transportador nas operações abrangidas e não deve ser absorvida no valor normal do frete. A regulamentação também disciplina as fornecedoras de VPO habilitadas pela ANTT. citeturn24search9turn24search11

Um erro de produto seria tratar VPO como simplesmente:

```text
freteTotal = frete + pedagio
```

e depois perder a distinção. O sistema precisa manter explicitamente:

```text
freight_amount
freight_floor_amount
toll_amount
vpo_amount
other_components
total_contract_value
```

O VPO possui hipóteses de aplicabilidade e exceções regulatórias. Entre os cenários tratados pela regulamentação encontram-se particularidades de veículo vazio, carga fracionada/múltiplos embarcadores e outras situações específicas. Portanto, o SICAT deve possuir um `VpoApplicabilityEngine`, não uma checkbox obrigatória para toda viagem. citeturn21view0

Quando aplicável, a aquisição/antecipação deve ocorrer antes da etapa correspondente da viagem e separadamente do frete. A regulamentação também prevê informação do vale-pedágio no MDF-e, permitindo fechar o elo contratual-fiscal da operação. citeturn21view0turn21view1

Assim, a regra de liberação correta é aproximadamente:

```text
IF VPO_APPLICABLE
THEN
    require VPO_ACQUIRED
    require VPO_VALUE > 0 when route demands it
    require provider/reference
    require MDFE_VPO_LINK when technically applicable
ELSE
    require applicability_reason
```

Ou seja: até uma regra `NOT_APPLICABLE` precisa deixar uma evidência auditável explicando o motivo.

### NF-e, CT-e e MDF-e

O conjunto fiscal deve ser tratado como especificação técnica viva, e não apenas como “integração XML”. Os portais fiscais mantêm MOCs, schemas, Notas Técnicas e regras de validação que mudam ao longo do tempo. Em 2026 existem atualizações ativas tanto no ecossistema MDF-e quanto em NF-e e CT-e. citeturn11search0turn11search5turn6search5

No MDF-e, a Nota Técnica 2026.001 introduz regras de validação relacionadas ao CIOT para transporte rodoviário remunerado realizado por terceiros, em linha com o Ajuste SINIEF correspondente. O cronograma técnico publicado para a implantação dessa validação prevê etapas posteriores em 2026, razão pela qual o SICAT deve ser preparado antecipadamente para a rejeição fiscal por ausência ou inconsistência de CIOT, em vez de esperar o ambiente de produção começar a recusá-la. citeturn11search2turn23search0turn23search3

Isso sugere uma camada fiscal própria:

```text
DFeDocument
  type: NFE | CTE | MDFE
  accessKey
  xmlStorageRef
  xmlHash
  schemaVersion
  technicalNoteVersion
  authorizationStatus
  protocol
  issuedAt
  issuer
  recipient
  linkedCiot[]
  linkedVpo[]
  referencedDocuments[]
```

O SICAT deveria ser capaz de distinguir pelo menos quatro funções:

**importar**, **validar**, **relacionar** e, quando a estratégia comercial exigir, **emitir**.

Começar por importação e validação pode reduzir drasticamente o risco da primeira entrega, porque emissão fiscal completa traz certificados digitais, contingência, eventos fiscais, particularidades estaduais, schemas, assinaturas e operação de alta criticidade.

### Seguros e PGR

A Lei nº 14.599/2023 alterou a Lei nº 11.442/2007 e tornou obrigatórios para o transportador os seguros **RCTR-C, RC-DC e RC-V**. RCTR-C e RC-DC possuem vínculo com o Plano de Gerenciamento de Riscos. A regulamentação securitária também passou por disciplina específica do CNSP. citeturn17search1turn17search2turn17search11

A ANTT desenvolveu integração para verificação automática de seguros no contexto do RNTRC e publicou cronograma de homologação/produção em 2026. Isso torna altamente recomendável modelar desde já a checagem automática, mas sem presumir que qualquer endpoint oficial será publicamente acessível ao SICAT sem credenciamento ou contrato. citeturn17search0

Portanto, recomendo um padrão de gateway:

```text
InsuranceVerificationProvider
  verifyCarrier(...)
  verifyPolicy(...)
```

com diferentes estratégias:

```text
ANTT integration
insurer/integration partner
manual evidence
administrative override with authorization
```

A liberação deve verificar, conforme aplicabilidade:

```text
RCTR-C válido
RC-DC válido
RC-V válido
transportador compatível
RNTRC compatível
vigência cobre data da operação
PGR vigente/aceito quando necessário
```

Nunca recomendo armazenar desnecessariamente grandes volumes de dados pessoais provenientes de sistemas de análise de risco. A própria Lei nº 15.485/2026 passa a disciplinar bancos e empresas de gerenciamento de risco e relaciona essa atuação à LGPD, o que reforça a necessidade de minimização, justificativa de decisão e controles de acesso. citeturn22view0

### Matriz regulatória consolidada

| Tema | Base principal | Regra de negócio para SICAT | Gate recomendado |
|---|---|---|---|
| RNTRC | Lei 11.442 + Res. 5.982 + Lei 15.485 | Transportador e veículos devem possuir elegibilidade aplicável; preparar revalidação anual versionada | Contratação + liberação |
| CIOT | Res. 5.862 + Res. 6.078 + Portaria SUROC 6 + Lei 15.485 | Registro prévio de operação remunerada; ciclo completo e MDF-e | Antes do transporte |
| Piso | Lei 13.703 + Res. 5.867 + tabelas vigentes + Lei 15.485 | Não permitir oferta/contratação inferior ao piso aplicável | **Antes de publicar oferta** |
| Pagamento | Lei 15.485 + regulamentação PEF | Regras de responsável, meio e prazo conforme enquadramento | Contratação/CIOT |
| VPO | Lei 10.209 + Res. 6.024 | Antecipar separadamente quando aplicável e documentar no MDF-e | Antes do embarque |
| NF-e/CT-e/MDF-e | Ajustes SINIEF, MOCs, schemas e NTs | XML/schema/status/referências consistentes | Pré-liberação |
| CIOT↔MDF-e | ANTT + regras MDF-e | CIOT correto deve acompanhar MDF-e quando aplicável | Pré-autorização/liberação |
| Seguros | Lei 14.599 + regulamentação CNSP/ANTT | RCTR-C, RC-DC e RC-V conforme legislação | Pré-liberação |
| PGR | Lei 14.599 + regulamentação securitária | Evidência de PGR quando exigido por RCTR-C/RC-DC | Pré-liberação |
| Auditoria | Conjunto regulatório | Toda aprovação e bloqueio precisa ser explicável | Toda transição |

As bases e relações acima decorrem das fontes oficiais da ANTT, legislação federal e especificações fiscais analisadas. citeturn22view0turn24search1turn24search6turn21view0turn17search2turn11search2

## Arquitetura alvo para o SICAT Transporte

### O agregado central deve ser a Operação de Transporte

Hoje o SICAT possui `manifest` como conceito central do domínio ambiental. Para Transporte eu introduziria um agregado novo chamado, por exemplo:

```text
TransportOperation
```

ou:

```text
FreightOperation
```

Não reutilizaria `Manifest`, porque CT-e e MDF-e são documentos vinculados a uma operação; eles não devem ser a operação em si.

Modelo conceitual:

```text
TransportOperation
├── contractor
├── shipper
├── carrier
├── subcontractor?
├── vehicles[]
├── drivers[]
├── cargo
├── origin
├── destination
├── route
├── distance
├── operationClassification
├── freight
│   ├── offeredAmount
│   ├── contractedAmount
│   ├── floorAmount
│   └── calculationSnapshot
├── payment
├── ciot
├── vpo
├── fiscalDocuments
│   ├── NFe[]
│   ├── CTe[]
│   └── MDFe[]
├── insurance
├── riskManagementPlan
└── compliance
```

### Um Compliance Gate separado das integrações

O componente mais importante do produto não deveria ser `CiotService`, mas:

```text
TransportComplianceService
```

Ele deveria responder:

```json
{
  "operationId": "trp_...",
  "gate": "PRE_RELEASE",
  "status": "BLOCKED",
  "checkedAt": "2026-08-13T...",
  "checks": [
    {
      "ruleCode": "TR-PMF-002",
      "status": "PASS",
      "legalBasis": "Lei 13.703/2018 + versão normativa vigente",
      "ruleVersion": "pmf-2026-07",
      "evidenceRefs": ["calc_..."]
    },
    {
      "ruleCode": "TR-CIOT-002",
      "status": "PASS",
      "evidenceRefs": ["ciot_..."]
    },
    {
      "ruleCode": "TR-VPO-002",
      "status": "BLOCK",
      "reasonCode": "VPO_NOT_ACQUIRED",
      "humanMessage": "Vale-Pedágio obrigatório ainda não foi antecipado."
    }
  ]
}
```

O ponto fundamental é: **o gateway externo nunca decide se a operação está juridicamente liberada**. Ele traz fatos. Quem decide é o motor de compliance, baseado em fatos + versões regulatórias.

### Gates recomendados

```text
GATE_PROPOSAL
    ↓
Pode anunciar/ofertar o frete?

GATE_CONTRACT
    ↓
Pode contratar?

GATE_CIOT
    ↓
Pode solicitar/registrar CIOT?

GATE_FISCAL
    ↓
Documentos fiscais estão consistentes?

GATE_PRE_BOARDING
    ↓
VPO/seguros/RNTRC estão regulares?

GATE_RELEASE
    ↓
Pode liberar a operação?

GATE_IN_TRANSIT
    ↓
Documentos e estados necessários estão válidos?

GATE_COMPLETION
    ↓
CIOT/MDF-e/pagamento/eventos foram encerrados?
```

Essa arquitetura decorre especialmente da característica preventiva que as regras atuais deram ao piso e ao CIOT. citeturn24search0turn24search7turn22view0

### Estados da operação

Sugestão:

```text
DRAFT
VALIDATING
BLOCKED
READY_FOR_CONTRACT
CONTRACTED
CIOT_PENDING
CIOT_REGISTERED
FISCAL_PENDING
READY_FOR_RELEASE
IN_TRANSIT
COMPLETION_PENDING
COMPLETED
CANCELLED
```

Não permitiria uma alteração arbitrária de estado. Cada transição passaria por um policy/gate.

Exemplo:

```text
READY_FOR_RELEASE
  requires:
    RNTRC_PASS
    FLOOR_PASS
    CIOT_PASS
    VPO_PASS_OR_NA
    NFE_PASS_OR_NA
    CTE_PASS_OR_NA
    MDFE_PASS
    INSURANCE_PASS
    PGR_PASS_OR_NA
```

### Catálogo de regras regulatórias

Esta é provavelmente a peça de arquitetura mais importante para longevidade.

```text
regulatory_sources
regulatory_rules
regulatory_rule_versions
regulatory_decisions
compliance_checks
```

Exemplo:

```json
{
  "code": "TR-CIOT-001",
  "domain": "CIOT",
  "title": "Obrigatoriedade de CIOT",
  "issuer": "ANTT",
  "legalBasis": [
    "Resolução ANTT 5.862/2019",
    "Resolução ANTT 6.078/2026",
    "Lei 15.485/2026"
  ],
  "effectiveFrom": "2026-05-24",
  "effectiveUntil": null,
  "implementationState": "ACTIVE",
  "blocking": true,
  "requiresHumanReview": false
}
```

E para uma regra ainda sujeita a regulamentação:

```json
{
  "code": "TR-RNTRC-ANNUAL-REVALIDATION",
  "legalBasis": ["Lei 15.485/2026"],
  "implementationState": "AWAITING_REGULATION",
  "blocking": false
}
```

Isso evita transformar previsão legal ainda dependente de regulamentação técnica em bloqueio prematuro. A necessidade é especialmente relevante agora porque a Lei nº 15.485/2026 expressamente contém regras de transição entre o regime anterior e os novos atos da ANTT. citeturn22view0

### Fontes regulatórias com aprovação humana

Eu adicionaria ao produto uma área:

**Administração → Compliance → Fontes regulatórias**

Ela exibiria:

```text
Fonte             Publicação   Vigência    Estado
Lei 15.485/2026   06/08/2026   06/08/...   revisada
Veto 43/2026      07/08/...    pendente     monitorar
Res. ANTT ...     ...
NT MDF-e ...      ...
```

Nunca permitiria que um robô de web scraping modificasse uma regra bloqueante de produção automaticamente.

Fluxo:

```text
detectar nova norma
        ↓
baixar / registrar fonte
        ↓
calcular hash
        ↓
IA faz análise preliminar
        ↓
humano revisa
        ↓
criar nova rule_version
        ↓
QA regulatório
        ↓
ativar effectiveFrom
```

Isso é particularmente importante porque tanto ANTT quanto documentos fiscais receberam mudanças relevantes em 2026. citeturn24search3turn11search0

## Regras de negócio, modelo de dados e controles

### Catálogo inicial de regras

Eu criaria códigos estáveis desde a primeira migration.

| Código | Regra |
|---|---|
| `TR-RNTRC-001` | RNTRC deve estar regular para a operação |
| `TR-RNTRC-002` | Veículo deve estar compatível com transportador/operação |
| `TR-RNTRC-003` | Aplicar revalidação anual quando regulatoriamente exigível |
| `TR-PMF-001` | Determinar aplicabilidade do piso |
| `TR-PMF-002` | Não permitir publicação/oferta abaixo do piso |
| `TR-PMF-003` | Não permitir contratação abaixo do piso |
| `TR-PMF-004` | Usar versão do piso vigente na data |
| `TR-CIOT-001` | Determinar obrigatoriedade do CIOT |
| `TR-CIOT-002` | CIOT deve anteceder início da operação |
| `TR-CIOT-003` | Responsável pelo CIOT deve corresponder ao enquadramento |
| `TR-CIOT-004` | Dados obrigatórios do CIOT completos |
| `TR-CIOT-005` | CIOT vinculado ao MDF-e quando aplicável |
| `TR-PAY-001` | Prazo de pagamento compatível com a regra vigente |
| `TR-VPO-001` | Determinar aplicabilidade do VPO |
| `TR-VPO-002` | VPO antecipado antes do embarque quando aplicável |
| `TR-VPO-003` | VPO separado do valor de frete |
| `TR-VPO-004` | Referência VPO no MDF-e quando tecnicamente exigida |
| `TR-NFE-001` | NF-e autorizada e compatível |
| `TR-CTE-001` | CT-e autorizado e compatível |
| `TR-MDFE-001` | MDF-e autorizado e compatível |
| `TR-MDFE-002` | CIOT presente no MDF-e quando obrigatório |
| `TR-SEG-001` | RCTR-C vigente |
| `TR-SEG-002` | RC-DC vigente |
| `TR-SEG-003` | RC-V vigente |
| `TR-PGR-001` | PGR vigente quando requerido |
| `TR-COMP-001` | Conjunto mínimo necessário para liberação aprovado |

A aplicabilidade dessas regras deve permanecer vinculada à versão normativa correspondente, sobretudo em CIOT/piso/VPO e nas regras fiscais. citeturn24search12turn21view0turn11search2turn17search2

### Schema sugerido

Uma primeira arquitetura de persistência poderia conter:

```text
transport_parties
transport_party_roles
transport_vehicles
transport_vehicle_links

transport_operations
transport_operation_parties
transport_operation_vehicles
transport_operation_cargo
transport_operation_routes

freight_floor_versions
freight_floor_coefficients
freight_floor_calculations

ciot_operations
ciot_events

vpo_allocations
vpo_events

fiscal_documents
fiscal_document_links
fiscal_document_events

insurance_policies
risk_management_plans

regulatory_sources
regulatory_rules
regulatory_rule_versions

compliance_evaluations
compliance_checks
compliance_evidence

external_exchanges
```

Eu evitaria guardar JSON como substituto universal de modelagem relacional. JSONB seria excelente para snapshots regulatórios e payloads versionados, mas entidades usadas em consultas de compliance deveriam possuir colunas próprias e índices adequados.

### Snapshot de compliance

Toda decisão importante deve congelar:

```json
{
  "ruleCode": "TR-PMF-002",
  "ruleVersion": "pmf-2026-07",
  "legalBasis": "...",
  "inputs": {
    "distanceKm": 843,
    "cargoType": "...",
    "vehicleConfiguration": "...",
    "axles": 6
  },
  "result": {
    "minimumFreight": 0,
    "offeredFreight": 0,
    "status": "PASS"
  },
  "evaluatedAt": "...",
  "engineVersion": "...",
  "evidenceRefs": []
}
```

Os valores acima são apenas a estrutura do contrato; nenhum valor fictício de piso deveria aparecer como dado real.

Esse snapshot é essencial porque as tabelas do piso mudam periodicamente e documentos fiscais também possuem versões de schema/NT. citeturn15view0turn11search0

### APIs propostas

Mantendo o contrato atual do repositório, eu usaria `/v1/transporte/...`.

```text
POST /v1/transporte/operacoes
GET  /v1/transporte/operacoes
GET  /v1/transporte/operacoes/{id}
PATCH /v1/transporte/operacoes/{id}

POST /v1/transporte/operacoes/{id}/calcular-piso
GET  /v1/transporte/operacoes/{id}/calculos-piso

POST /v1/transporte/operacoes/{id}/validar-conformidade
GET  /v1/transporte/operacoes/{id}/conformidade

POST /v1/transporte/operacoes/{id}/ciot/emitir
POST /v1/transporte/operacoes/{id}/ciot/retificar
POST /v1/transporte/operacoes/{id}/ciot/cancelar
POST /v1/transporte/operacoes/{id}/ciot/encerrar
GET  /v1/transporte/operacoes/{id}/ciot

POST /v1/transporte/operacoes/{id}/vpo/preparar
GET  /v1/transporte/operacoes/{id}/vpo

POST /v1/transporte/operacoes/{id}/documentos-fiscais/importar
GET  /v1/transporte/operacoes/{id}/documentos-fiscais
POST /v1/transporte/operacoes/{id}/mdfe/validar

POST /v1/transporte/operacoes/{id}/liberar
POST /v1/transporte/operacoes/{id}/concluir

GET /v1/transporte/transportadores/{rntrc}/regularidade
POST /v1/transporte/transportadores/{rntrc}/verificar

GET /v1/transporte/regras
GET /v1/transporte/regras/{code}
GET /v1/transporte/regras/{code}/historico
```

Todas as chamadas externas mutáveis devem manter o comportamento arquitetural existente do SICAT: `202 Accepted`, job persistido, idempotência, correlation ID, worker e gateway. fileciteturn11file0L2-L2

### UX proposta

A navegação poderia ficar:

```text
Operação
  ├── Ambiental
  │   ├── MTR
  │   ├── DMR
  │   └── CDF
  │
  └── Transporte
      ├── Operações
      ├── Nova operação
      ├── CIOT
      ├── Documentos fiscais
      ├── Transportadores
      └── Pendências de compliance

Centro Operacional
  ├── Visão geral
  ├── Jobs
  ├── Auditoria
  ├── Integrações
  │   ├── CETESB
  │   ├── ANTT
  │   ├── SEFAZ
  │   └── VPO
  └── Compliance regulatório

Administração
  ├── Regras regulatórias
  ├── Fontes normativas
  ├── Tabelas de piso
  ├── Provedores
  └── Feature flags
```

A ficha da operação deve mostrar um painel muito simples para o operador:

```text
CONFORMIDADE DA OPERAÇÃO

✓ RNTRC regular
✓ Piso mínimo atendido
✓ CIOT registrado
✓ CIOT vinculado ao MDF-e
! Vale-Pedágio aguardando confirmação
✓ RCTR-C
✓ RC-DC
✓ RC-V
✓ PGR
✓ CT-e
! MDF-e ainda não autorizado

STATUS: BLOQUEADA PARA LIBERAÇÃO
Motivo: VPO + MDF-e
```

Isso aproveita diretamente o padrão de status, alertas, tabelas e componentes `Sicat*` que o repositório já exige para o frontend. fileciteturn12file0L2-L2

### Segurança, LGPD e auditoria

Eu aplicaria a seguinte regra:

```text
armazenar a evidência necessária
≠
copiar integralmente tudo que o órgão/provedor retornou
```

Tokens, certificados, credenciais e documentos sensíveis devem continuar fora do código e sujeitos ao padrão de secrets já definido pelo SICAT. O repositório proíbe versionamento de JWTs, chaves e credenciais reais e determina gateways como fronteira de integrações externas; o mesmo princípio deve ser aplicado à ANTT, provedores de pagamento, VPO e certificados fiscais. fileciteturn11file0L2-L2

Para qualquer decisão de bloqueio baseada em risco, é recomendável guardar um **reason code regulatório e evidência**, não uma coleção indiscriminada de informações sobre motorista. A legislação de 2026 reforça a necessidade de cuidados com bases de gerenciamento de risco e dados pessoais. citeturn22view0

## Roadmap de implementação e estratégia de testes

Eu não iniciaria a implementação pelo endpoint de emissão do CIOT. Antes disso, criaria a fundação regulatória. Essa ordem reduz retrabalho quando normas mudarem.

### Fundação regulatória e domínio

Primeiro, criar o bounded context Transporte, entidades centrais, catálogo normativo, versões de regra e mecanismo de compliance. Nessa etapa não é necessário chamar ANTT ou SEFAZ.

Entrega mínima:

```text
TransportOperation
RegulatoryRule
RegulatoryRuleVersion
ComplianceEvaluation
ComplianceCheck
ComplianceEvidence
```

Também incluir:

```text
TR-PMF-*
TR-CIOT-*
TR-VPO-*
TR-RNTRC-*
TR-SEG-*
TR-DFE-*
```

Como a Lei nº 15.485/2026 tornou especialmente importante bloquear oferta de frete abaixo do piso, o primeiro módulo regulatório funcional deve ser o `FreightFloorEngine`. citeturn22view0

### Piso mínimo e contratação segura

Construir:

```text
Piso Minimum Catalog
FreightFloorEngine
FreightProposalValidator
```

A primeira experiência comercial já poderia oferecer:

> “Antes de contratar o frete, o SICAT calcula, documenta e bloqueia situações incompatíveis com o piso mínimo aplicável.”

Isso já possui valor independente de emissão fiscal ou CIOT.

Critérios:

```text
não hardcodar coeficientes
versionar tabela
effectiveFrom/effectiveUntil
snapshot de cálculo
teste de data histórica
teste de carga lotação
teste de enquadramento/não enquadramento
teste de oferta exatamente no piso
teste de oferta abaixo do piso
teste de alteração normativa
```

A ANTT deixa claro que o piso e sua validação sistêmica dependem da classificação da operação, reforçando a necessidade desses testes de aplicabilidade. citeturn24search6turn24search12

### RNTRC e CIOT

Depois, implementar:

```text
RNTRC verification adapter
CIOT pre-validation
CIOT generation
CIOT rectification
CIOT cancellation
CIOT closure
```

Um erro importante a evitar é considerar `REGISTERED` como sinônimo de `COMPLIANT`. A própria FAQ da ANTT diz que o CIOT representa apenas as validações sistêmicas aplicáveis naquele momento e não impede fiscalizações posteriores envolvendo os demais documentos. citeturn24search7

### VPO e rota

A terceira frente deve integrar:

```text
route
toll requirements
VPO applicability
VPO provider
VPO evidence
MDF-e reference
```

O cadastro de fornecedores habilitados deve ser configurável/sincronizável e não fixado no código, porque a habilitação depende da ANTT e pode mudar. citeturn24search9

### Documentos fiscais

Depois:

```text
NF-e import/validation
CT-e import/validation
MDF-e import/validation
CIOT-MDF-e linkage
VPO-MDF-e linkage
```

Eu começaria por **importação e validação de XML existente**.

Emissão pode ser uma fase posterior:

```text
DFe Issuer
certificate management
signature
SEFAZ submission
contingency
events
closure
```

Essa separação reduz o risco de tentar resolver ANTT + SEFAZ + certificados + fiscalidade em uma única release.

Como as NTs fiscais de 2026 incluem regras relacionadas ao CIOT no MDF-e e possuem cronograma técnico próprio, seria importante criar testes antecipando as rejeições fiscais antes da efetiva ativação no ambiente de produção. citeturn11search2turn23search0

### Seguros e PGR

Por último na primeira grande versão:

```text
policy registry
insurance verification adapter
PGR evidence
expiry alerts
PRE_RELEASE gate
```

A verificação precisa considerar vigência na data da operação, e não apenas “seguro cadastrado”. Os três seguros previstos na legislação e o vínculo do PGR às coberturas relevantes devem ser refletidos separadamente. citeturn17search2turn17search11

### Hardening e Centro Operacional

Uma vez integradas as entidades externas:

```text
ANTT health
CIOT failure rate
SEFAZ health
VPO provider health
jobs retry/DLQ
compliance blocks
rules about to change
insurance expirations
operations waiting release
```

Essa frente encaixa naturalmente no Centro Operacional já existente no SICAT. fileciteturn10file0L2-L2

### Estratégia obrigatória de testes

Além dos testes já exigidos pelo repositório, eu criaria uma categoria específica de **testes regulatórios**.

Exemplo:

```text
tests/regulatory/
  rntrc/
  freight-floor/
  ciot/
  vpo/
  dfe/
  insurance/
  compliance-gates/
  effective-dates/
```

Os testes de tempo são particularmente importantes:

```text
operação antes de 24/05/2026
operação em 24/05/2026
operação depois de 24/05/2026

operação antes de 06/08/2026
operação em 06/08/2026
operação depois de 06/08/2026

regra técnica fiscal ainda em homologação
regra técnica fiscal em produção

regra futura da ANTT ainda não exigível
regra futura depois de effectiveFrom
```

Isso decorre das mudanças de vigência ocorridas em 2026 e das disposições transitórias da Lei nº 15.485/2026. citeturn24search1turn22view0

Eu criaria ainda uma regra de engenharia:

> **Nenhuma alteração de `RegulatoryRuleVersion` pode entrar em produção sem fixture de teste demonstrando o comportamento anterior e o comportamento posterior à vigência.**

### Backlog macro recomendado

| Prioridade | Épico | Resultado |
|---|---|---|
| P0 | Regulatory Foundation | Base temporal e auditável |
| P0 | Freight Floor | Impedir oferta/contrato irregular |
| P0 | Transport Operation | Agregado central |
| P0 | Compliance Gate | Motor de bloqueio/liberação |
| P1 | RNTRC | Elegibilidade do transportador |
| P1 | CIOT | Registro/ciclo operacional |
| P1 | VPO | Antecipação e evidência |
| P1 | MDF-e validation | CIOT/VPO/fiscal |
| P1 | Insurance/PGR | Gate de segurança |
| P2 | CT-e/NF-e | Integração fiscal ampliada |
| P2 | DFe issuance | Emissão completa |
| P2 | Regulatory Watch | Acompanhamento de novas normas |
| P2 | Compliance Analytics | Dashboard e relatórios |
| P3 | AI Compliance Assistant | Explicação e orientação ao usuário |

### O que eu não faria

Não implementaria o piso em um único método estático. Não colocaria CIOT diretamente dentro do atual `manifest-service`. Não renomearia MTR ambiental para tentar acomodar MDF-e. Não criaria um segundo sistema de fila. Não chamaria ANTT diretamente de uma rota. Não assumiria que toda operação exige VPO da mesma maneira. Não trataria “CIOT gerado” como “operação legalmente liberada”. Não hardcodaria os provedores de VPO. Não faria atualização regulatória automática sem aprovação humana. E não faria emissão completa de CT-e/MDF-e antes de construir o modelo de operação e compliance.

## Prompt mestre para usar na Fable 5

O bloco abaixo foi elaborado para ser entregue praticamente sem alterações a uma IA com acesso ao repositório. Ele força primeiro uma investigação real do código e depois uma proposta arquitetural rastreável, evitando que o agente invente endpoints governamentais ou trate as normas como simples texto.

```text
Você é o Principal Product Architect, Principal Software Engineer e Regulatory
Compliance Engineer responsável por planejar e estruturar a evolução do produto
SICAT para o domínio brasileiro de Transporte Rodoviário Remunerado de Cargas.

PROJETO
=======

Repositório:
https://github.com/FlavioNeto11/devops

Aplicação principal:
apps/sicat

Nome da nova vertical:
SICAT Transporte

Data de referência regulatória deste trabalho:
13/08/2026

MISSÃO
======

Sua missão é investigar profundamente o repositório REAL e produzir uma
arquitetura executável, um plano de evolução e um backlog técnico completo
para transformar o SICAT em uma plataforma capaz de prevenir, validar,
registrar, evidenciar e auditar a conformidade de operações brasileiras
de transporte rodoviário remunerado de cargas.

A solução deverá tratar, no mínimo:

- RNTRC
- TAC / ETC / CTC
- Operação de transporte
- Transportador / contratante / subcontratante
- Veículos
- Política Nacional de Pisos Mínimos do Transporte Rodoviário de Cargas
- CIOT
- pagamento do frete
- Vale-Pedágio Obrigatório
- NF-e
- CT-e
- MDF-e
- vinculação CIOT ↔ MDF-e
- vinculação de Vale-Pedágio ↔ MDF-e
- RCTR-C
- RC-DC
- RC-V
- Plano de Gerenciamento de Riscos - PGR
- regras de liberação da operação
- auditoria e evidências
- versionamento de normas
- observabilidade operacional
- LGPD e segurança
- atualização futura da regulamentação

REGRA PRINCIPAL
===============

NÃO comece escrevendo código.

Primeiro investigue o repositório, depois produza diagnóstico, arquitetura,
gap analysis, ADRs, modelo de dados, contratos de API, fluxo de estados,
backlog e estratégia de rollout.

Somente depois de criar uma arquitetura consistente detalhe o plano
de implementação por PR/fase.

NÃO INVENTE o estado atual do SICAT.
NÃO INVENTE APIs da ANTT, SEFAZ, SVRS, Banco Central, seguradoras,
fornecedoras de Vale-Pedágio ou instituições de pagamento.

Quando não houver integração oficial comprovadamente acessível,
crie uma interface/gateway e marque a implementação concreta como
DEPENDÊNCIA EXTERNA A VALIDAR.

FASE DE LEITURA OBRIGATÓRIA
===========================

Antes de propor qualquer modificação, leia e respeite, no mínimo:

1. apps/sicat/AGENTS.md
2. apps/sicat/CLAUDE.md
3. apps/sicat/README.md
4. apps/sicat/backend/AGENTS.md
5. apps/sicat/docs/10-estado-atual/estado-atual.md
6. apps/sicat/docs/copilot/13-decision-log.md
7. apps/sicat/docs/FRONTEND-COMPONENTS-ARCHITECTURE.md
8. apps/sicat/frontend/docs/design-system.md
9. openapi/mtr_automacao_openapi_interna.yaml
10. migrations atuais em backend/src/sql/
11. routes/
12. services/
13. repositories/
14. workers/
15. gateways/
16. estrutura de jobs, retry e DLQ
17. estrutura de auditoria
18. Centro Operacional
19. frontend/src/config/navigation.js
20. frontend/src/lib/status-map.js

Leia também as regras HARD da plataforma e qualquer arquivo AGENTS.md
hierarquicamente aplicável.

Ao terminar a investigação inicial, crie uma seção:

ESTADO REAL ENCONTRADO NO REPOSITÓRIO

Classifique cada capacidade como:

IMPLEMENTADO
PARCIAL
PLANEJADO
INEXISTENTE
NÃO CONFIRMADO

Não confunda material comercial/documentação futura com código implementado.

CONTEXTO ARQUITETURAL QUE DEVE SER PRESERVADO
=============================================

O SICAT atual é primordialmente uma plataforma ambiental de automação
CETESB, com MTR de resíduos, DMR e CDF.

ATENÇÃO:
MTR do SICAT ambiental significa Manifesto de Transporte de Resíduos.

NÃO confundir nem reutilizar esse conceito para:

- MDF-e
- CT-e
- CIOT
- operação rodoviária de cargas.

Crie um bounded context separado denominado Transporte.

Preserve a fronteira arquitetural existente:

route
→ service
→ repository
→ job
→ worker
→ gateway

Preserve também:

- contract-first
- OpenAPI como contrato
- examples em lockstep
- operations geradas
- Postgres como fonte transacional
- fila persistida
- FOR UPDATE SKIP LOCKED
- locking otimista quando aplicável
- Idempotency-Key
- correlationId
- jobId
- commandId
- auditabilidade
- application/problem+json
- retry
- DLQ
- gateway como única fronteira de HTTP externo
- design system Sicat*
- Centro Operacional existente

Não quebre o gateway CETESB existente.
Não introduza chamadas ANTT/SEFAZ diretamente em routes/services/workers.

BASE REGULATÓRIA A SER REVALIDADA
=================================

IMPORTANTE:
a lista abaixo é um ponto de partida.
Antes de transformar qualquer item em regra de produção,
valide a versão vigente e a data de eficácia em fontes oficiais.

Considere e revalide, no mínimo:

TRANSPORTE / RNTRC

- Lei nº 11.442/2007
- Resolução ANTT nº 5.982/2022
- alterações posteriores
- Lei nº 15.485/2026

CIOT / PAGAMENTO

- Resolução ANTT nº 5.862/2019
- Resolução ANTT nº 6.078/2026
- Portaria SUROC nº 6/2026
- Lei nº 15.485/2026
- documentos técnicos CIOT/PEF vigentes

PISO MÍNIMO

- Lei nº 13.703/2018
- Resolução ANTT nº 5.867/2020
- resoluções/tabelas/coeficientes vigentes em 2026
- Lei nº 15.485/2026

VALE-PEDÁGIO

- Lei nº 10.209/2001
- Resolução ANTT nº 6.024/2023
- regulamentação e fornecedores habilitados vigentes

FISCAL

- Ajustes SINIEF vigentes
- NF-e
- CT-e
- MDF-e
- respectivos MOCs
- schemas
- Notas Técnicas
- regras SEFAZ/SVRS
- regras atuais relacionadas a CIOT no MDF-e
- regras atuais relacionadas ao Vale-Pedágio no MDF-e

SEGUROS

- Lei nº 14.599/2023
- Lei nº 11.442/2007 conforme alterada
- regulamentação CNSP/SUSEP vigente
- RCTR-C
- RC-DC
- RC-V
- PGR
- regulamentação ANTT sobre verificação de seguros

ATUALIZAÇÃO JURÍDICA CRÍTICA
=============================

Não trate a MP nº 1.343/2026 como o estado final.

Revalide a Lei nº 15.485, de 05/08/2026, publicada em agosto de 2026,
originada da MP nº 1.343/2026.

Verifique:

- texto sancionado
- dispositivos vetados
- Veto nº 43/2026
- eventual mudança no status do veto
- regulamentação ANTT posterior à lei
- disposições transitórias
- datas de exigibilidade

Não implemente como vigente qualquer dispositivo vetado.

Em particular, não presuma obrigação legal fixa de antecipação de 70%
do frete sem confirmar que eventual veto correspondente foi derrubado
e que a norma está efetivamente vigente.

MODELO DE REGULAÇÃO
===================

O sistema NÃO pode espalhar regras legais em if/else sem versionamento.

Projete:

RegulatorySource
RegulatoryRule
RegulatoryRuleVersion
ComplianceEvaluation
ComplianceCheck
ComplianceEvidence

Cada regra deve possuir, no mínimo:

- code
- domain
- title
- description
- issuer
- legalBasis
- publicationDate
- effectiveFrom
- effectiveUntil
- regulatoryStatus
- implementationStatus
- blocking
- severity
- applicability
- ruleVersion
- sourceReference
- sourceHash
- reviewedAt
- reviewedBy

Estados possíveis da regra:

DRAFT
UNDER_REVIEW
ACTIVE
FUTURE
SUPERSEDED
REVOKED
AWAITING_REGULATION

Uma norma recém-detectada não pode se tornar automaticamente uma
regra bloqueante de produção.

Obrigar aprovação humana.

BOUNDED CONTEXT TRANSPORTE
==========================

Projete um agregado central:

TransportOperation

Não reutilize a entidade Manifest do MTR ambiental.

TransportOperation deverá conseguir relacionar:

- tenant
- contratante
- embarcador
- transportador
- subcontratado
- TAC/ETC/CTC
- RNTRC
- motorista quando necessário
- veículos
- origem
- destino
- rota
- distância
- classificação da operação
- tipo de carga
- carga lotação versus demais enquadramentos
- dados da carga
- valor ofertado
- valor contratado
- piso calculado
- componentes do frete
- forma de pagamento
- prazo de pagamento
- CIOT
- VPO
- NF-e
- CT-e
- MDF-e
- seguros
- PGR
- compliance
- evidências
- timeline
- auditoria

MOTOR DE COMPLIANCE
===================

Projete um TransportComplianceService separado das integrações externas.

A integração externa retorna fatos.
O Compliance Engine decide se uma transição é permitida.

Criar pelo menos estes gates:

GATE_PROPOSAL
GATE_CONTRACT
GATE_CIOT
GATE_FISCAL
GATE_PRE_BOARDING
GATE_RELEASE
GATE_IN_TRANSIT
GATE_COMPLETION

Cada gate deverá devolver:

- status
- PASS / WARN / BLOCK / NOT_APPLICABLE
- ruleCode
- legalBasis
- regulatoryRuleVersion
- reasonCode
- humanMessage
- evidenceRefs
- evaluatedAt
- nextAction

Não permita simplesmente:

if (ciot) liberar();

A liberação deve resultar de todas as regras aplicáveis.

REGRA CRÍTICA DE PISO
=====================

Projete o FreightFloorEngine como mecanismo versionado.

NÃO hardcode coeficientes em código.

O cálculo deve registrar um snapshot contendo:

- versão normativa
- tabela
- coeficientes
- origem
- destino
- distância
- tipo de operação
- tipo de carga
- configuração do veículo
- quantidade/configuração de eixos quando aplicável
- parâmetros utilizados
- valor mínimo
- valor ofertado
- valor contratado
- resultado
- timestamp

O cálculo histórico deve continuar reproduzível mesmo depois que uma
nova tabela entrar em vigor.

Criar regra que impeça oferta/publicação/intermediação de valor inferior
ao piso quando a operação estiver juridicamente sujeita ao piso.

Essa validação deve acontecer em GATE_PROPOSAL, não apenas na liberação.

Nunca assuma que toda operação CIOT utiliza exatamente a mesma regra de
validação automática de piso.

Projete explicitamente um Applicability Engine.

CIOT
====

Projete o ciclo completo:

PRE_VALIDATION
REQUESTED
REGISTERED
RECTIFIED
CANCELLED
CLOSED
REJECTED
BLOCKED

Modelar:

- número CIOT
- participantes
- contratante
- transportador
- subcontratado
- operação
- carga
- origem
- destino
- frete
- forma de pagamento
- prazo de pagamento
- instituição/provedor quando aplicável
- MDF-e vinculado
- requests
- responses
- timestamps
- idempotency
- correlationId
- status externo
- eventos

Criar adapters, não dependência direta de fornecedor.

Nunca considerar CIOT registrado como prova suficiente de que toda
operação está regular.

VALE-PEDÁGIO
============

Crie VpoApplicabilityEngine.

Nunca marque VPO como obrigatório indistintamente em todas as operações.

Modelar:

- applicable
- reason
- provider
- acquisitionId
- IDVPO/reference
- amount
- acquiredAt
- route
- tolls
- status
- MDF-e linkage
- evidence

Manter o valor do VPO separado do valor de frete.

Antes da liberação:

IF VPO_APPLICABLE
    REQUIRE VPO_ACQUIRED
    REQUIRE evidence
    REQUIRE fiscal linkage when applicable
ELSE
    REQUIRE applicability reason

DOCUMENTOS FISCAIS
==================

Projete uma camada fiscal independente.

Entidade:

DFeDocument

Tipos:

NFE
CTE
MDFE

Guardar, quando aplicável:

- accessKey
- issuer
- recipient
- issuedAt
- XML storage reference
- XML hash
- schemaVersion
- technicalNoteVersion
- authorizationStatus
- protocol
- environment
- referencedDocuments
- CIOT references
- VPO references
- events

Separar explicitamente:

1. importar
2. validar
3. relacionar
4. emitir

Avalie como estratégia de primeira release:

IMPORTAÇÃO + VALIDAÇÃO primeiro.

Emissão completa NF-e/CT-e/MDF-e pode ser uma etapa posterior,
pois envolve certificados, assinatura, eventos, contingência,
schemas e operação fiscal crítica.

Crie Schema Registry versionado.

Nenhuma regra XML pode depender de um schema "eterno".

SEGUROS E PGR
=============

Modelar separadamente:

RCTR_C
RC_DC
RC_V

Criar:

InsurancePolicy
RiskManagementPlan
InsuranceVerification

Verificar:

- seguradora
- apólice
- tipo
- validade
- transportador
- RNTRC quando aplicável
- data inicial
- data final
- status
- fonte da evidência

PGR:

- versão
- vigência
- partes relacionadas
- evidenceRef
- status

Não invente uma API pública da ANTT para isso.

Crie uma interface:

InsuranceVerificationProvider

Possíveis implementações:

- ANTT, caso integração válida esteja disponível
- seguradora/parceiro
- evidência manual
- override administrativo autorizado

RNTRC
=====

Modelar:

TransportParty
TransportVehicle
RntrcVerification

Suportar:

TAC
ETC
CTC

Armazenar:

- RNTRC
- categoria
- status
- verifiedAt
- source
- evidence
- regulatoryRuleVersion

Prepare a arquitetura para revalidação anual introduzida na legislação
de 2026, MAS somente torne a expiração bloqueante quando a respectiva
regulamentação/data de exigibilidade estiver confirmada.

MODELO DE DADOS
===============

Produza proposta detalhada para, no mínimo:

transport_parties
transport_party_roles
transport_vehicles
transport_vehicle_links

transport_operations
transport_operation_parties
transport_operation_vehicles
transport_operation_cargo
transport_operation_routes

freight_floor_versions
freight_floor_coefficients
freight_floor_calculations

ciot_operations
ciot_events

vpo_allocations
vpo_events

fiscal_documents
fiscal_document_links
fiscal_document_events

insurance_policies
risk_management_plans

regulatory_sources
regulatory_rules
regulatory_rule_versions

compliance_evaluations
compliance_checks
compliance_evidence

external_exchanges

Para cada tabela fornecer:

- finalidade
- colunas
- tipos
- PK
- FKs
- unique constraints
- check constraints
- índices
- optimistic locking se necessário
- retention
- dados sensíveis
- auditoria

Não use JSONB para esconder toda a modelagem.
Use JSONB principalmente para snapshots e payloads versionados.

APIS
====

Proponha contrato OpenAPI para, no mínimo:

POST /v1/transporte/operacoes
GET /v1/transporte/operacoes
GET /v1/transporte/operacoes/{id}
PATCH /v1/transporte/operacoes/{id}

POST /v1/transporte/operacoes/{id}/calcular-piso
GET /v1/transporte/operacoes/{id}/calculos-piso

POST /v1/transporte/operacoes/{id}/validar-conformidade
GET /v1/transporte/operacoes/{id}/conformidade

POST /v1/transporte/operacoes/{id}/ciot/emitir
POST /v1/transporte/operacoes/{id}/ciot/retificar
POST /v1/transporte/operacoes/{id}/ciot/cancelar
POST /v1/transporte/operacoes/{id}/ciot/encerrar

POST /v1/transporte/operacoes/{id}/vpo/preparar

POST /v1/transporte/operacoes/{id}/documentos-fiscais/importar
GET /v1/transporte/operacoes/{id}/documentos-fiscais
POST /v1/transporte/operacoes/{id}/mdfe/validar

POST /v1/transporte/operacoes/{id}/liberar
POST /v1/transporte/operacoes/{id}/concluir

GET /v1/transporte/transportadores/{rntrc}/regularidade
POST /v1/transporte/transportadores/{rntrc}/verificar

GET /v1/transporte/regras
GET /v1/transporte/regras/{code}
GET /v1/transporte/regras/{code}/historico

Respeitar o padrão atual do SICAT:

- comandos externos assíncronos
- 202 Accepted
- job persistido
- Idempotency-Key
- X-Correlation-Id
- application/problem+json
- retry/DLQ

CATÁLOGO INICIAL DE REGRAS
==========================

Estruture pelo menos:

TR-RNTRC-001
RNTRC regular.

TR-RNTRC-002
Veículo compatível com transportador/operação.

TR-RNTRC-003
Revalidação periódica quando juridicamente exigível.

TR-PMF-001
Determinar aplicabilidade do piso.

TR-PMF-002
Não permitir oferta/publicação abaixo do piso.

TR-PMF-003
Não permitir contratação abaixo do piso.

TR-PMF-004
Usar tabela vigente na data correta.

TR-CIOT-001
Determinar obrigatoriedade do CIOT.

TR-CIOT-002
CIOT antes do início da operação.

TR-CIOT-003
Responsável pelo CIOT conforme enquadramento.

TR-CIOT-004
Dados obrigatórios completos.

TR-CIOT-005
CIOT vinculado ao MDF-e quando aplicável.

TR-PAY-001
Prazo e forma de pagamento compatíveis com a norma vigente.

TR-VPO-001
Determinar aplicabilidade do VPO.

TR-VPO-002
Antecipação antes do embarque quando aplicável.

TR-VPO-003
Valor de VPO separado do frete.

TR-VPO-004
Referência no MDF-e quando aplicável.

TR-NFE-001
NF-e válida/consistente quando exigida.

TR-CTE-001
CT-e válido/consistente quando exigido.

TR-MDFE-001
MDF-e válido/autorizado quando exigido.

TR-MDFE-002
CIOT informado no MDF-e quando obrigatório.

TR-SEG-001
RCTR-C vigente.

TR-SEG-002
RC-DC vigente.

TR-SEG-003
RC-V vigente.

TR-PGR-001
PGR vigente quando aplicável.

TR-COMP-001
Operação atende requisitos mínimos para liberação.

Para cada uma entregue:

- descrição
- base normativa
- applicability
- inputs
- outputs
- BLOCK/WARN
- reason codes
- momento do gate
- teste unitário
- teste de integração
- evidência armazenada

MÁQUINA DE ESTADOS
==================

Projete máquina de estados explícita:

DRAFT
VALIDATING
BLOCKED
READY_FOR_CONTRACT
CONTRACTED
CIOT_PENDING
CIOT_REGISTERED
FISCAL_PENDING
READY_FOR_RELEASE
IN_TRANSIT
COMPLETION_PENDING
COMPLETED
CANCELLED

Para cada transição mostrar:

FROM
TO
command
required gate
rules
side effects
job
audit event
rollback/recovery

Não permitir transições arbitrárias de status.

FRONTEND
========

Preserve Vue 3 + design system Sicat*.

Proponha:

Operação
  Ambiental
  Transporte

Dentro de Transporte:

- Dashboard
- Operações
- Nova operação
- Transportadores
- CIOT
- Documentos fiscais
- Pendências de compliance

Centro Operacional:

- ANTT
- SEFAZ
- CIOT
- VPO
- seguros
- compliance
- DLQ
- auditoria

Administração:

- regras regulatórias
- fontes normativas
- versões de piso
- provedores
- integrações
- feature flags

A tela de uma operação deve responder imediatamente:

PODE LIBERAR?

e mostrar:

PASS
WARN
BLOCK
NOT_APPLICABLE

por requisito.

Cada bloqueio deverá dizer:

- o que ocorreu
- por que bloqueou
- qual regra
- qual base normativa
- qual ação corrige
- quando foi validado

OBSERVABILIDADE
===============

Reutilize o Centro Operacional existente.

Adicionar métricas:

- operações criadas
- operações bloqueadas
- bloqueios por regra
- ofertas abaixo do piso impedidas
- falhas de CIOT
- CIOT pendentes
- divergências MDF-e
- VPO pendentes
- RNTRC irregulares
- seguros vencendo
- PGR pendente
- erros ANTT
- erros SEFAZ
- jobs em retry
- DLQ por integração
- tempo de liberação
- regras regulatórias próximas de mudança

SEGURANÇA E LGPD
================

Mapeie:

- CPF/CNPJ
- dados de motoristas
- dados de veículos
- certificados
- credenciais ANTT/SEFAZ
- tokens
- apólices
- dados de pagamento
- dados de risco

Para cada um indicar:

- finalidade
- classificação
- criptografia
- retenção
- acesso
- logging permitido
- logging proibido
- masking
- auditoria

Nunca grave segredo em Git.

Nunca exponha certificado/token em log.

Minimize dados de análise de risco.

ATUALIZAÇÃO REGULATÓRIA
=======================

Projete Regulatory Watch.

Fluxo:

DETECTED
→ INGESTED
→ AI_ANALYZED
→ HUMAN_REVIEW
→ APPROVED
→ TESTED
→ SCHEDULED
→ ACTIVE

A IA pode sugerir mudança.
A IA não pode ativar uma regra bloqueante sozinha.

Cada fonte deve receber hash e data.

Cada regra ativa deve apontar para sua fonte.

TESTES
======

Além dos testes atuais do SICAT, crie estratégia específica:

unit
integration
contract
worker
gateway
frontend
regulatory
time-travel
migration
security
performance

Criar fixtures para:

- TAC
- ETC
- CTC
- subcontratação
- carga lotação
- operação não sujeita à mesma regra automática de piso
- VPO aplicável
- VPO não aplicável
- frete abaixo do piso
- frete igual ao piso
- frete acima do piso
- CIOT ausente
- CIOT inválido
- CIOT correto
- MDF-e sem CIOT quando obrigatório
- MDF-e com CIOT
- seguro vencido
- PGR ausente
- RNTRC irregular
- norma futura
- norma revogada
- operação histórica

Obrigatório criar testes de fronteira temporal.

Exemplo:

23/05/2026
24/05/2026
25/05/2026

05/08/2026
06/08/2026
07/08/2026

e demais datas relevantes encontradas na pesquisa regulatória.

REGRA:

quando RegulatoryRuleVersion mudar,
deve existir teste demonstrando:

COMPORTAMENTO ANTES
COMPORTAMENTO DEPOIS

Nunca reprocessar historicamente uma operação usando silenciosamente
uma tabela/regra nova.

RASTREABILIDADE
===============

Crie uma matriz obrigatória:

LEGAL SOURCE
→ REGULATORY REQUIREMENT
→ RULE CODE
→ DOMAIN ENTITY
→ DATABASE
→ API
→ GATE
→ UI
→ TEST
→ AUDIT EVIDENCE

Exemplo de ID:

REQ-ANTT-CIOT-001
REQ-ANTT-PMF-001
REQ-ANTT-VPO-001
REQ-DFE-MDFE-001
REQ-SUSEP-SEG-001

Nenhum requisito regulatório importante pode ficar sem teste.

ROADMAP
=======

Estruture a implementação em fases.

Sugestão inicial a desafiar após investigar o código:

Fase A
Regulatory Foundation + TransportOperation.

Fase B
Freight Floor Engine + bloqueio de oferta/contratação.

Fase C
RNTRC + CIOT.

Fase D
VPO.

Fase E
NF-e/CT-e/MDF-e importação e validação.

Fase F
Seguros + PGR.

Fase G
Emissão fiscal, se fizer sentido.

Fase H
Regulatory Watch + analytics + hardening.

Para cada fase apresentar:

- objetivo
- dependências
- arquivos
- migrations
- APIs
- jobs
- gateways
- telas
- testes
- feature flag
- riscos
- critérios de aceite
- critérios de rollback
- estimativa relativa S/M/L/XL
- ordem dos PRs

Não estime horas sem dados suficientes.

PR PLAN
=======

Produza um plano incremental de PRs.

Cada PR deve:

- ter escopo pequeno/coeso
- respeitar contract-first
- atualizar OpenAPI quando necessário
- atualizar examples
- gerar operations
- adicionar migration quando necessário
- adicionar testes
- atualizar estado-atual
- atualizar decision log quando houver decisão arquitetural
- preservar compatibilidade do domínio ambiental

Nunca colocar toda a evolução em um mega-PR.

DECISÕES ARQUITETURAIS
======================

Identifique ADRs/DLs necessários.

Avalie pelo menos:

1. bounded context Transporte separado de Ambiental
2. Regulatory Rule Engine
3. temporal versioning
4. TransportOperation aggregate
5. Compliance Gate
6. DFe schema registry
7. adapters de ANTT/SEFAZ/VPO/seguros
8. storage de XML/documentos/evidências
9. regulatory watch com human approval
10. estratégia de emissão fiscal versus validação

Para cada decisão:

CONTEXT
DECISION
ALTERNATIVES
CONSEQUENCES
RISKS
MIGRATION

ENTREGÁVEIS DA SUA RESPOSTA
===========================

Entregue obrigatoriamente nesta ordem:

A. Executive Summary

B. Estado real encontrado no repositório

C. Inventário dos componentes existentes que podem ser reutilizados

D. Gap Analysis
Tabela:
requirement / current state / gap / recommended change / priority

E. Matriz regulatória
Tabela:
norma / artigo ou requisito / regra de negócio / software control /
effective date / regulatory status

F. Domain Model

G. Bounded Context Map

H. State Machine

I. Compliance Gate Matrix

J. Regulatory Rule Catalog

K. Data Model
Com tabelas, campos, FKs, índices e constraints.

L. API Design
Com request/response de exemplo.

M. Async Jobs
Lista de novos job types.

N. Gateway Design
ANTT / RNTRC / CIOT / VPO / DFe / seguros.

O. Frontend Information Architecture

P. Wireflow textual das principais telas

Q. Security & LGPD Model

R. Audit & Evidence Model

S. Observability

T. Regulatory Watch Architecture

U. Testing Strategy

V. Regulatory Traceability Matrix

W. Migration Strategy

X. Roadmap por fases

Y. Backlog
Epics → Features → Stories → Acceptance Criteria.

Z. PR-by-PR Implementation Plan

AA. Lista exata de arquivos existentes que devem ser alterados

AB. Lista exata de arquivos novos recomendados

AC. ADRs / Decision Logs necessários

AD. Risk Register
probability / impact / mitigation / owner

AE. Open Legal Questions
Questões que exigem validação jurídica/regulatória externa.

AF. Definition of Done do SICAT Transporte MVP

AG. Definition of Done da versão Production Ready

AH. Ordem final de execução recomendada

CRITÉRIOS DE QUALIDADE
======================

Diferencie explicitamente:

[NORMATIVE FACT]
fonte legal/regulatória confirmada.

[TECHNICAL SPEC]
MOC/schema/NT/documentação técnica oficial.

[REPOSITORY FACT]
encontrado realmente no código/documentação canônica.

[ARCHITECTURE DECISION]
decisão de engenharia proposta.

[PRODUCT DECISION]
decisão comercial/UX proposta.

[ASSUMPTION]
não confirmado.

[EXTERNAL DEPENDENCY]
depende de órgão/provedor/credenciamento.

[LEGAL REVIEW REQUIRED]
necessita validação jurídica.

Nunca apresente ASSUMPTION como FACT.

Nunca crie uma integração fictícia.

Nunca altere o módulo ambiental para "encaixar" conceitos de transporte.

Nunca faça regra legal sem:

legalBasis
effectiveFrom
ruleVersion
test
audit evidence.

CRITÉRIO DE SUCESSO
===================

Ao final, deve ser possível olhar para qualquer TransportOperation e responder:

1. Quem contratou?
2. Quem transportou?
3. Qual RNTRC foi verificado?
4. Qual regra estava vigente?
5. Qual era o piso mínimo?
6. Como ele foi calculado?
7. Qual valor foi ofertado?
8. Qual valor foi contratado?
9. O CIOT era obrigatório?
10. Qual CIOT foi emitido?
11. Quem o emitiu?
12. Qual MDF-e está relacionado?
13. O Vale-Pedágio era aplicável?
14. Foi antecipado?
15. Quais documentos fiscais existiam?
16. Quais seguros estavam vigentes?
17. Qual PGR estava vigente?
18. Quais gates foram avaliados?
19. Por que a operação foi liberada ou bloqueada?
20. Qual versão da legislação fundamentou cada decisão?
21. Qual evidência prova cada conclusão?
22. Qual usuário/sistema realizou cada ação?

Se qualquer uma dessas respostas depender apenas de log textual solto,
a arquitetura está incompleta.

Comece agora pela investigação do repositório.
Não implemente código ainda.
Primeiro produza os entregáveis A até AH.
```

O baseline regulatório embutido no prompt deve ser revalidado pela Fable 5 contra as fontes oficiais antes de converter qualquer requisito em código, sobretudo porque a Lei nº 15.485/2026 entrou em vigor apenas em agosto de 2026, possui disposições transitórias, houve veto parcial e a legislação determina regulamentação complementar da ANTT. citeturn13view0turn14view0turn22view0

A parte de CIOT do prompt está alinhada à universalização em vigor desde 24 de maio de 2026 e à orientação atual da ANTT de registro prévio, vinculação ao MDF-e e validações de piso quando aplicáveis. citeturn24search0turn24search1turn24search7turn24search12 A parte de VPO está fundamentada na Lei nº 10.209/2001 e na Resolução ANTT nº 6.024/2023, com a antecipação e a separação desse valor em relação ao frete. citeturn24search9turn24search11turn21view0 A parte de seguros considera as obrigações de RCTR-C, RC-DC e RC-V e a relação de RCTR-C/RC-DC com o PGR. citeturn17search2turn17search11

A arquitetura proposta também está deliberadamente ajustada às regras internas encontradas no próprio SICAT: bounded context separado, contrato OpenAPI, Postgres/fila transacional, workers, gateways, idempotência, correlation IDs, testes, documentação e design system existente. fileciteturn11file0L2-L2 fileciteturn12file0L2-L2

O ponto estratégico mais importante de toda a pesquisa é este: **o diferencial do SICAT Transporte não deveria ser “emitir CIOT”. Deve ser impedir que uma operação chegue ao transporte sem saber, demonstrar e registrar por que ela está conforme.** A direção da regulação de 2026 é justamente preventiva: CIOT universalizado, bloqueio sistêmico de determinadas operações abaixo do piso, ligação CIOT–MDF-e, maior rastreabilidade e responsabilização inclusive de plataformas digitais que intermedeiam ofertas incompatíveis com o piso. citeturn24search0turn24search1turn22view0