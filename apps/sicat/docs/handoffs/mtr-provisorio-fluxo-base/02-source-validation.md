# 02 — Source Validation — MTR provisório (cadeia `mtr-provisorio-fluxo-base`)

## Objetivo da fase

Validar formalmente a evidência CETESB existente em
[docs/cetesb/](../../cetesb/) para o fluxo base de MTR provisório
(cadastro, listagem, detalhe, impressão), confirmar/refutar suposições
do baseline ([docs/04-arquitetura/mtr-provisorio-sicat.md](../../04-arquitetura/mtr-provisorio-sicat.md)),
declarar veredicto operação a operação e decidir formalmente sobre
necessidade de nova captura humana antes da fase 03.

Sem implementação de produto. Sem alterar OpenAPI, código, migration
ou frontend. Sem capturar HAR (ação humana).

## Arquivos analisados

- [docs/handoffs/mtr-provisorio-fluxo-base/00-orchestration.md](00-orchestration.md)
- [docs/handoffs/mtr-provisorio-fluxo-base/01-baseline-docs.md](01-baseline-docs.md)
- [docs/04-arquitetura/mtr-provisorio-sicat.md](../../04-arquitetura/mtr-provisorio-sicat.md) §3, §4.4, §5
- [docs/cetesb/README.md](../../cetesb/README.md)
- [docs/cetesb/mtr.cetesb.sp.gov.br_gerar_mtr.har](../../cetesb/mtr.cetesb.sp.gov.br_gerar_mtr.har)
  (linhas 2540–2700 e 16660–16850 — request/response do endpoint
  provisório e body de criação de MTR)
- [docs/cetesb/mtr.cetesb.sp.gov.br_imprimir_mtr.har](../../cetesb/mtr.cetesb.sp.gov.br_imprimir_mtr.har)
  (linhas 10241 e 10705 — `pesquisaManifesto` unificada e
  `imprimir/imprimeManifesto/{manHashCode}`)
- [docs/cetesb/mtr.cetesb.sp.gov.br_cancelar_mtr.har](../../cetesb/mtr.cetesb.sp.gov.br_cancelar_mtr.har)
  e
  [docs/cetesb/mtr.cetesb.sp.gov.br_recebimento_mtr.har](../../cetesb/mtr.cetesb.sp.gov.br_recebimento_mtr.har)
  (somente confirmação de campos `mtrProvisorioNumero`/
  `mtrProvisorioDataRecebimento` em respostas de listagem unificada)
- [src/gateways/cetesb-gateway.js](../../../src/gateways/cetesb-gateway.js)
  linhas 1245–1290, 1620–1640, 2040–2070, 2510–2570, 2660–2800
  (uso atual de `tipoManifesto` na pesquisa e na criação)
- [src/lib/cetesb-source-of-truth.ts](../../../src/lib/cetesb-source-of-truth.ts)
- [tests/unit/cetesb-source-of-truth.test.js](../../../tests/unit/cetesb-source-of-truth.test.js)

## 1. Inventário e classificação dos HARs

| HAR | Aderência a MTR provisório | Evidência observada |
| --- | --- | --- |
| [login](../../cetesb/mtr.cetesb.sp.gov.br_login.har) | indireto | Bootstrap de sessão; reaproveitamento integral. |
| [gerar_mtr](../../cetesb/mtr.cetesb.sp.gov.br_gerar_mtr.har) | **parcial — confirmado** | (a) `GET https://mtrr.cetesb.sp.gov.br/api/mtr/manifesto/provisorio/176163/true` → resposta `{ "mensagem": null, "objetoResposta": [], "erro": false }` (parceiro sem provisórios — mas estrutura confirmada); (b) `PUT https://mtrr.cetesb.sp.gov.br/api/mtr/manifesto` body com `tipoManifesto: 1` (definitivo) e demais campos. **Único HAR** que cita literalmente `manifesto/provisorio` (única ocorrência em toda `docs/cetesb/`). |
| [imprimir_mtr](../../cetesb/mtr.cetesb.sp.gov.br_imprimir_mtr.har) | **parcial — confirmado** | (a) `GET /api/mtr/pesquisaManifesto/176163/26/8/{dateFrom}/{dateTo}/0/all` (listagem unificada — discrimina por `tipoManifesto`); (b) `GET /api/mtr/imprimir/imprimeManifesto/{manHashCode}` (impressão por hash — **mesmo endpoint** para definitivo e provisório, pois `manHashCode` está presente em ambos). Resposta de listagem inclui `mtrProvisorioNumero` e `mtrProvisorioDataRecebimento` em todos os itens. |
| [cancelar_mtr](../../cetesb/mtr.cetesb.sp.gov.br_cancelar_mtr.har) | indireto | Itens da listagem incluem campos provisórios (com valores `"0"`/`null`); fora do escopo desta cadeia base. |
| [recebimento_mtr](../../cetesb/mtr.cetesb.sp.gov.br_recebimento_mtr.har) | indireto | Itens da listagem unificada incluem campos provisórios; fora do escopo (recebimento da variante é cadeia futura). |
| [gerar_cdf_mtr](../../cetesb/mtr.cetesb.sp.gov.br_gerar_cdf_mtr.har) | não | Fora do escopo (CDF). |
| [baixar_cdf_mtr](../../cetesb/mtr.cetesb.sp.gov.br_baixar_cdf_mtr.har) | não | Fora do escopo (CDF). |
| [criar_cadastro](../../cetesb/mtr.cetesb.sp.gov.br_criar_cadastro.har) | não | Cadastro de parceiros. |

### Buscas executadas

- `grep -r "manifesto/provisorio" docs/cetesb/` → **1 hit** (apenas
  `gerar_mtr.har` linha 2554).
- `grep -r "tipoManifesto|mtrProvisorioNumero|mtrProvisorioDataRecebimento" docs/cetesb/`
  → 55 hits, distribuídos pelos HARs de
  `cancelar_mtr`, `imprimir_mtr`, `recebimento_mtr`, `gerar_cdf_mtr`
  (todos como campos do payload de manifesto na resposta de listagem).
- Inspeção dos blocos de request/response em
  [docs/cetesb/mtr.cetesb.sp.gov.br_gerar_mtr.har#L2540-L2700](../../cetesb/mtr.cetesb.sp.gov.br_gerar_mtr.har)
  (endpoint provisório) e
  [docs/cetesb/mtr.cetesb.sp.gov.br_gerar_mtr.har#L16660-L16850](../../cetesb/mtr.cetesb.sp.gov.br_gerar_mtr.har)
  (criação MTR).

## 2. Veredicto formal por operação

> **Convenção**: **CONFIRMADO** = evidência HAR direta;
> **SUPOSIÇÃO** = inferido pelo padrão MTR comum, sem captura
> dedicada para provisório; **GAP** = exige nova captura humana.

### 2.1 Cadastro (criação) — **SUPOSIÇÃO**

- **Method/path observado (definitivo)**: `PUT https://mtrr.cetesb.sp.gov.br/api/mtr/manifesto`
  ([gerar_mtr.har#L16668](../../cetesb/mtr.cetesb.sp.gov.br_gerar_mtr.har)).
- **Inferência para provisório**: mesmo endpoint `PUT /api/mtr/manifesto`,
  alterando `tipoManifesto` no body (valor numérico exato é suposição —
  ver §2.5 abaixo) e populando `mtrProvisorioNumero`/
  `mtrProvisorioDataRecebimento` quando aplicável.
- **Campos críticos confirmados no HAR (definitivo)**: `manCodigo`,
  `manResponsavel`, `manNumero`, `manDataExpedicao`, `tipoManifesto`,
  `estado`, `parceiroGerador`, `parceiroTransportador`,
  `parceiroDestinador`, `situacaoManifesto`, `parceiroAcesso`,
  `listaManifestoResiduo`, `recaptcha`.
- **Campos críticos suposicionados para provisório**: aceitação do
  endpoint genérico para a variante; valor de `tipoManifesto` ≠ 1;
  comportamento de `mtrProvisorioNumero` no request (provavelmente
  vazio na criação — gerado pelo backend CETESB).
- **Resposta confirmada (definitivo)**: `200 OK` com
  `{ "mensagem": "<manHashCode>", "objetoResposta": null, "erro": false }`.

### 2.2 Listagem — **CONFIRMADO**

- **Method/path observado**: `GET https://mtrr.cetesb.sp.gov.br/api/mtr/manifesto/provisorio/{parCodigo}/{flag}`
  ([gerar_mtr.har#L2554](../../cetesb/mtr.cetesb.sp.gov.br_gerar_mtr.har)).
- **Parâmetros confirmados**: `parCodigo` = código do parceiro (no HAR
  `176163`), `flag` ∈ `{true, false}` (no HAR `true`); a semântica
  exata da flag é **SUPOSIÇÃO** (provavelmente "pendentes" vs
  "encerrados/processados" — confirmar com captura adicional ou pela
  fase 03 ao testar contra ambiente real).
- **Resposta confirmada**: `200 OK` com
  `{ "mensagem": null, "objetoResposta": [], "erro": false }`.
  No HAR a lista veio vazia porque o parceiro `176163` não tinha
  provisórios pendentes; a estrutura de cada item, quando preenchida,
  é a mesma da listagem unificada
  `/api/mtr/pesquisaManifesto/...`/`pesquisaManifestoArmazenadorTemporario`
  (já mapeada nos demais HARs com `mtrProvisorioNumero` e
  `mtrProvisorioDataRecebimento`).
- **Alternativa também válida**: filtrar a listagem unificada
  `/api/mtr/pesquisaManifesto/{parCodigo}/{stateCode}/{tipoManifesto}/{dateFrom}/{dateTo}/{statusFilter}/{kind}`
  por `tipoManifesto` apropriado — confirmado em
  [imprimir_mtr.har#L10241](../../cetesb/mtr.cetesb.sp.gov.br_imprimir_mtr.har)
  e já implementado no gateway
  ([src/gateways/cetesb-gateway.js#L1623-L1638](../../../src/gateways/cetesb-gateway.js)).

### 2.3 Detalhe — **SUPOSIÇÃO**

- **Method/path observado**: nenhum endpoint dedicado de "detalhe por
  número provisório" foi capturado.
- **Inferência**: o padrão CETESB no MTR comum trata "detalhe" como o
  item devolvido pela listagem (cliente Angular do portal mantém o
  estado em memória após o `pesquisaManifesto`). Não há `GET /api/mtr/manifesto/{manCodigo}`
  evidenciado nos HARs analisados.
- **Recomendação**: SICAT serve detalhe **a partir do próprio
  `manifests`** (Postgres) sem necessariamente bater na CETESB; a
  fase 04 deve modelar `GET /v1/mtr-provisorio/:id` lendo do
  repositório, sem mudar fronteira. **Não há gap CETESB neste ponto.**

### 2.4 Impressão — **SUPOSIÇÃO**

- **Method/path observado (definitivo)**: `GET https://mtrr.cetesb.sp.gov.br/api/mtr/imprimir/imprimeManifesto/{manHashCode}`
  ([imprimir_mtr.har#L10705](../../cetesb/mtr.cetesb.sp.gov.br_imprimir_mtr.har)).
- **Inferência para provisório**: o mesmo endpoint atende ambos os
  tipos, pois a chave é `manHashCode` (presente em **todos** os
  manifestos retornados pelas listagens, inclusive os com
  `mtrProvisorioNumero != "0"`). Isso reduz drasticamente o risco da
  fase 03.
- **Risco residual**: o portal CETESB pode invocar um endpoint
  alternativo dedicado quando o usuário aciona "imprimir provisório"
  no fluxo do operador. Como o HAR `imprimir_mtr.har` foi capturado
  para um manifesto definitivo, não há prova direta dessa hipótese.

### 2.5 Discriminador `tipoManifesto` - conflito a resolver na fase 04

Achado crítico: o gateway atual
([src/gateways/cetesb-gateway.js#L1262](../../../src/gateways/cetesb-gateway.js))
mapeia `manifestType ∈ {I, E, M}` para `tipoManifesto ∈ {1, 2, 3}`
(Interestadual / Estadual / Municipal). O HAR de criação de MTR
[gerar_mtr.har#L16745](../../cetesb/mtr.cetesb.sp.gov.br_gerar_mtr.har)
mostra `tipoManifesto: 1` para um MTR comum (não-provisório). Isso
significa que **`tipoManifesto` está sobrecarregado entre dois eixos
diferentes** no SICAT atual:

- eixo SICAT atual (legado): jurisdição I/E/M;
- eixo SIGOR/CETESB (real): aparentemente identifica a variante do
  manifesto (definitivo / provisório / armazenamento temporário /
  importação / exportação — `8` aparece como "todos" em buscas e `9`
  como filtro de armazenamento temporário em
  [src/gateways/cetesb-gateway.js#L35-L36](../../../src/gateways/cetesb-gateway.js)).

A baseline de fase 01
([docs/04-arquitetura/mtr-provisorio-sicat.md §2](../../04-arquitetura/mtr-provisorio-sicat.md))
declara `tipoManifesto = 2` para provisório, mas isso colide com o
mapeamento de jurisdição existente. **A fase 04 deve resolver a
sobrecarga** de uma das três formas:

1. confirmar que o eixo I/E/M nunca foi usado de fato pela CETESB e
   migrar o gateway para usar `tipoManifesto` puramente como
   discriminador da variante;
2. introduzir um segundo campo (`subtipoManifesto` ou similar) e
   manter `tipoManifesto` para variante;
3. adotar `kind` (SICAT) como discriminador de domínio e mapear para
   o valor numérico correto na borda do gateway, deixando o I/E/M
   atual como dead code a ser removido em cadeia futura.

Esta decisão **não bloqueia** a fase 02. É registrada explicitamente
para a fase 04 (`programador-backend-mtr`) com R3 abaixo.

## 3. Decisão sobre nova captura HAR

**Decisão**: nova captura **não é bloqueante** para iniciar a fase 03,
porém é **fortemente recomendada antes do merge final** da cadeia
(idealmente antes da fase 04 fechar contratos).

### 3.1 Suficiência mínima já atendida

- discriminador presente (`tipoManifesto`);
- endpoint dedicado de listagem provisória **CONFIRMADO**
  (`GET /api/mtr/manifesto/provisorio/{parCodigo}/{flag}`);
- campos provisórios (`mtrProvisorioNumero`,
  `mtrProvisorioDataRecebimento`) **CONFIRMADOS** em respostas reais;
- endpoint de impressão por `manHashCode` reutilizável **CONFIRMADO**
  para o caminho comum.

### 3.2 Lista mínima de capturas recomendadas (para mitigar R1 e R3)

Cada captura deve ser feita logada como operador real no portal
CETESB-SP, com o devtools aberto na aba Network e exportada como HAR.

1. **`mtr.cetesb.sp.gov.br_gerar_mtr_provisorio.har`** — prioridade alta
   - URL provável: `https://mtr.cetesb.sp.gov.br/` → seleção da
     opção "MTR provisório" / "Manifesto provisório" no menu de
     emissão.
   - Condição: parceiro com permissão de emissão de provisório no
     SIGOR.
   - Evidência esperada: `PUT /api/mtr/manifesto` com
     `tipoManifesto != 1` e/ou body com indicador explícito de
     provisório.
2. **`mtr.cetesb.sp.gov.br_imprimir_mtr_provisorio.har`** — prioridade alta
   - URL provável: portal → listagem provisória → ação "imprimir".
   - Condição: parceiro com pelo menos um MTR provisório emitido.
   - Evidência esperada: confirmação se o endpoint é o mesmo
     `GET /api/mtr/imprimir/imprimeManifesto/{manHashCode}` ou se
     existe variante dedicada.
3. **`mtr.cetesb.sp.gov.br_listar_mtr_provisorio.har`** — prioridade média
   - Captura do mesmo endpoint
     `GET /api/mtr/manifesto/provisorio/{parCodigo}/{flag}` com
     `objetoResposta` populado (parceiro com provisórios pendentes),
     para confirmar a estrutura de cada item.

### 3.3 Sem nova captura, riscos residuais

- **R1 (médio)**: valor numérico de `tipoManifesto` para a variante
  provisória pode estar errado na fase 03; mitigação possível por
  tentativa empírica em ambiente CETESB (gateway aceita 4xx
  controlado e log audit-exchange para diagnóstico).
- **R2 (baixo)**: estrutura interna dos itens da listagem dedicada
  pode ter pequenas divergências em relação à listagem unificada;
  mitigação por parser tolerante (já é a prática do gateway atual).
- **R3 (médio — não-bloqueante)**: sobrecarga de `tipoManifesto`
  (§2.5) precisa ser resolvida na fase 04 mesmo se as capturas
  novas forem feitas.

## 4. Espelho de payloads canônicos

Atualizado em
[tests/unit/cetesb-source-of-truth.test.js](../../../tests/unit/cetesb-source-of-truth.test.js)
com três novas asserções ancoradas nos HARs reais:

- presença do endpoint dedicado
  `/api/mtr/manifesto/provisorio/{parCodigo}/{flag}` em
  `gerar_mtr.har` (regex);
- presença textual de `tipoManifesto`, `mtrProvisorioNumero` e
  `mtrProvisorioDataRecebimento` em `imprimir_mtr.har`;
- presença do discriminador `tipoManifesto` numérico no body de
  criação em `gerar_mtr.har` (regex tolerante a aspas escapadas).

Resultado: **9/9 testes passando** (3 novos + 6 já existentes; sem
regressão).

## 5. Confirmação à recomendação §4.4 do baseline

A recomendação **Opção A — família dedicada `/v1/mtr-provisorio/*`**
é **CONFIRMADA** com base na evidência analisada, com **uma reserva
explícita** para a fase 04:

### 5.1 Argumentos confirmatórios pela evidência

- a CETESB **trata listagem de provisório como recurso dedicado**
  (`/api/mtr/manifesto/provisorio/{parCodigo}/{flag}`), separado
  da listagem unificada `pesquisaManifesto`. Essa segregação no
  contrato CETESB favorece espelhar a fronteira no SICAT;
- os campos `mtrProvisorioNumero` e `mtrProvisorioDataRecebimento`
  são **distintos** de `manNumero` / `manData`, reforçando que a
  variante carrega identidade própria — adequada a uma família
  dedicada com schema próprio em OpenAPI;
- a persistência única em `manifests` (decisão §3.1 da arquitetura)
  permanece **válida** porque o objeto retornado pela CETESB é o
  mesmo modelo de manifesto, apenas com campos extras populados.

### 5.2 Reservas

- **R3 (sobrecarga `tipoManifesto`)** descrita em §2.5: a fase 04
  precisa fechar essa decisão antes de publicar OpenAPI; do
  contrário, qualquer cliente externo do contrato `/v1/manifestos`
  pode receber semântica ambígua.
- **Migração de listagem unificada**: hoje o gateway expõe
  `pesquisaManifesto` para o domínio de manifestos
  ([src/gateways/cetesb-gateway.js#L1620-L1640](../../../src/gateways/cetesb-gateway.js)).
  A família dedicada `/v1/mtr-provisorio/*` deve usar o endpoint
  dedicado `/api/mtr/manifesto/provisorio/...` quando possível, e
  **só** cair na listagem unificada como fallback documentado.

## 6. Atualização do README CETESB

Não foram adicionadas novas capturas nesta fase. O
[docs/cetesb/README.md](../../cetesb/README.md) **não foi alterado**
para evitar atrito desnecessário (a regra do agente é "atualização
opcional… se acrescentar capturas/observações novas").

Caso a captura humana §3.2 seja executada no futuro, o README deve
ser atualizado pelo agente humano que conduz a captura, listando os
três HARs propostos e a operação CETESB a que cada um corresponde.

## 7. Validações executadas

- `npm run validate:har-gateway` → **ok** (5 operações HAR validadas,
  6 seções do gateway, 11 checks).
- `npm run validate:openapi` → **ok** (`mtr_automacao_openapi_interna.yaml`,
  política CETESB e markdown links — 668 arquivos, 0 problemas).
- `npm run test:source-of-truth` → **9/9 passando** (3 novos asserts
  + 6 pré-existentes; sem regressão).
- `npm run validate:md-links` (incluso na cadeia `validate:openapi`) →
  **0 links quebrados**.

## 8. Arquivos criados / alterados

- **Criado**:
  - [docs/handoffs/mtr-provisorio-fluxo-base/02-source-validation.md](02-source-validation.md)
    (este arquivo).
- **Alterado**:
  - [tests/unit/cetesb-source-of-truth.test.js](../../../tests/unit/cetesb-source-of-truth.test.js)
    (3 novos asserts ancorando MTR provisório).
  - [docs/handoffs/mtr-provisorio-fluxo-base/00-orchestration.md](00-orchestration.md)
    §6 — fase 02 marcada CONCLUÍDA, fase 03 ATIVA.

## 9. Decisão de roteamento da próxima fase — **Caminho A+**

**Recomendação**: seguir direto para fase 03 (`integrador-cetesb-mtr`)
em **Caminho A+** — gateway real, com a evidência atual já
suficiente para listagem dedicada e impressão por `manHashCode`,
modelando criação de provisório como bloco isolado dentro de
[src/gateways/cetesb-gateway.js](../../../src/gateways/cetesb-gateway.js)
com suposição registrada (`tipoManifesto != 1`).

### Por que A+ e não B (stub)

- **A+ é viável** porque:
  1. listagem provisória **CONFIRMADA** (endpoint real);
  2. impressão **reutiliza** caminho confirmado por `manHashCode`;
  3. criação reutiliza `PUT /api/mtr/manifesto` apenas variando o
     discriminador no body — bloco isolado bem contido;
  4. o risco residual de R1/R3 é mitigável com auditoria de exchange
     existente (`audit-exchange-logging`) e parser tolerante.
- **B (stub) seria over-engineering** porque a evidência cobre o
  caminho operacionalmente crítico (listar + imprimir) e o restante
  é refinamento que não justifica criar mock.

### Por que A+ e não A puro (pular fase 03)

- A fase 03 ainda é necessária para:
  1. introduzir o bloco MTR provisório no gateway com endpoint
     dedicado e parser de campos `mtrProvisorioNumero`/
     `mtrProvisorioDataRecebimento`;
  2. propor caminho de resolução para o conflito §2.5
     (sobrecarga `tipoManifesto`) que será adotado na fase 04;
  3. preservar `audit-exchange-logging` específico do bloco para
     diagnóstico futuro.

## 10. Handoff explícito para a fase 03 (`integrador-cetesb-mtr`)

**Próximo agente**: `integrador-cetesb-mtr`.
**Próxima fase**: `03-external-integration`.
**Próximo checkpoint**: `docs/handoffs/mtr-provisorio-fluxo-base/03-external-integration.md`.

### Entradas para o próximo agente

- baseline de arquitetura:
  [docs/04-arquitetura/mtr-provisorio-sicat.md](../../04-arquitetura/mtr-provisorio-sicat.md);
- veredicto de evidência: **este checkpoint** (§2 e §3);
- conflito a tratar: §2.5 (sobrecarga `tipoManifesto`) — propor
  caminho técnico no checkpoint 03 sem necessariamente decidir
  (decisão é da fase 04);
- gateway alvo:
  [src/gateways/cetesb-gateway.js](../../../src/gateways/cetesb-gateway.js)
  (única exceção JS — DL-093);
- testes a manter verdes:
  `npm run test:source-of-truth` (9/9),
  `npm run validate:har-gateway`,
  `npm run validate:openapi`.

### Entregas obrigatórias da fase 03

1. Adicionar bloco isolado `mtr-provisorio` em
   [src/gateways/cetesb-gateway.js](../../../src/gateways/cetesb-gateway.js)
   contemplando: criação (PUT genérico com discriminador),
   listagem dedicada
   (`GET /api/mtr/manifesto/provisorio/{parCodigo}/{flag}`),
   impressão (reuso do caminho `imprimeManifesto/{manHashCode}`).
2. Preservar bootstrap de sessão via
   [src/services/session-context-service.ts](../../../src/services/session-context-service.ts).
3. Manter `audit-exchange-logging` específico do bloco.
4. Não hardcodar JWT, headers, recaptcha ou endpoints fora do
   gateway.
5. Recomendar (sem decidir) caminho de resolução para R3
   (sobrecarga `tipoManifesto`) no checkpoint 03.
6. Validações que devem permanecer verdes ao final:
   `npm run validate:har-gateway`,
   `npm run validate:openapi`,
   `npm run test:source-of-truth`,
   `npm run typecheck`,
   `npm run validate:md-links`.

### Prompt sugerido para o próximo agente

```text
work_id: mtr-provisorio-fluxo-base
fase: 03-external-integration
agente: integrador-cetesb-mtr

Implemente o bloco isolado de MTR provisório dentro de
src/gateways/cetesb-gateway.js (única exceção JS — DL-093),
preservando bootstrap de sessão e audit-exchange-logging,
contemplando criação, listagem dedicada
(/api/mtr/manifesto/provisorio/{parCodigo}/{flag}) e impressão
(reuso de imprimeManifesto/{manHashCode}).

Entradas:
- docs/04-arquitetura/mtr-provisorio-sicat.md (arquitetura alvo);
- docs/handoffs/mtr-provisorio-fluxo-base/02-source-validation.md
  (veredicto de evidência por operação, conflito §2.5 a documentar
  no checkpoint 03 — sem decidir);
- HARs: gerar_mtr.har, imprimir_mtr.har.

Saídas obrigatórias:
- bloco mtr-provisorio em src/gateways/cetesb-gateway.js;
- recomendação técnica para resolução de R3 (sobrecarga
  tipoManifesto);
- validações verdes: validate:har-gateway, validate:openapi,
  test:source-of-truth, typecheck, validate:md-links;
- checkpoint
  docs/handoffs/mtr-provisorio-fluxo-base/03-external-integration.md;
- 00-orchestration.md §6 atualizado (fase 03 concluída, fase 04
  ativa).

Restrições: não tocar OpenAPI, rotas, services, repositórios,
migrations ou frontend. Não capturar HAR. Não commitar/pushar.
```

## Status

Fase 02-source-validation: **concluída**.
