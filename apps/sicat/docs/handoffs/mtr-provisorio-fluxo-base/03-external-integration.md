# 03 — External Integration — MTR provisório (cadeia `mtr-provisorio-fluxo-base`)

## Objetivo da fase

Implementar dentro de
[src/gateways/cetesb-gateway.js](../../../src/gateways/cetesb-gateway.js)
o **bloco isolado de MTR provisório** previsto em
[02-source-validation.md §10](02-source-validation.md), com três
operações expostas (`submitMtrProvisorio`, `listMtrProvisorio`,
`printMtrProvisorio`), preservando bootstrap de sessão,
audit-exchange-logging, validador canônico de payloads e a fronteira
DL-093 (única exceção JS no `src/`). Sem tocar OpenAPI, rotas, services,
repositórios, migrations, frontend, testes finais ou fazer commit/push.

## Arquivos analisados

- [docs/handoffs/mtr-provisorio-fluxo-base/00-orchestration.md](00-orchestration.md)
- [docs/handoffs/mtr-provisorio-fluxo-base/01-baseline-docs.md](01-baseline-docs.md)
- [docs/handoffs/mtr-provisorio-fluxo-base/02-source-validation.md](02-source-validation.md)
  (§§2.1–2.5, 5.1–5.2, 9, 10)
- [docs/04-arquitetura/mtr-provisorio-sicat.md](../../04-arquitetura/mtr-provisorio-sicat.md)
- [docs/cetesb/mtr.cetesb.sp.gov.br_gerar_mtr.har](../../cetesb/mtr.cetesb.sp.gov.br_gerar_mtr.har)
  (linhas 2554 e 16668)
- [docs/cetesb/mtr.cetesb.sp.gov.br_imprimir_mtr.har](../../cetesb/mtr.cetesb.sp.gov.br_imprimir_mtr.har)
  (linha 10705)
- [src/gateways/cetesb-gateway.js](../../../src/gateways/cetesb-gateway.js)
  (`submitManifest`, `printManifest`,
  `executeAuthenticatedJsonOperation`,
  `executeAuthenticatedBufferOperation`,
  `resolveAuthenticatedOperationContext`, `extractApiItems`,
  bloco DMR stub)
- [scripts/har-gateway-structural-validator.js](../../../scripts/har-gateway-structural-validator.js)
  (entendimento dos padrões obrigatórios; nenhuma alteração necessária)
- [tests/unit/cetesb-source-of-truth.test.js](../../../tests/unit/cetesb-source-of-truth.test.js)

## Decisões

### D1 — Bloco isolado dentro do gateway

O bloco MTR provisório foi adicionado em
[src/gateways/cetesb-gateway.js](../../../src/gateways/cetesb-gateway.js)
imediatamente **antes** do bloco DMR stub, com três métodos públicos
(`submitMtrProvisorio`, `listMtrProvisorio`, `printMtrProvisorio`) e
um cabeçalho explicando evidência HAR, restrições preservadas e a
referência cruzada para R3.

### D2 — Reuso máximo dos helpers existentes

- `submitMtrProvisorio` delega ao `submitManifest` existente, evitando
  duplicar enriquecimento de parceiros, residuos e partner access. A
  única extensão foi um **hook não-enumerável** em `submitManifest` que
  consome `manifest.tipoManifestoOverride` quando presente e sobrescreve
  `cetesbPayload.tipoManifesto` antes do `PUT /api/mtr/manifesto`. Sem
  override, o fluxo continua **idêntico** ao MTR comum (R1 contido).
- `listMtrProvisorio` usa `executeAuthenticatedJsonOperation` (mesmo
  padrão de `listReceiptResponsibles`, `searchReceivableManifests`,
  `searchCdfCertificates`, etc.), com `auditPath` estabilizado
  `'/api/mtr/manifesto/provisorio/{parCodigo}/{flag}'`.
- `printMtrProvisorio` usa `executeAuthenticatedBufferOperation` com
  `auditPath` `'/api/mtr/imprimir/imprimeManifesto/{manHashCode}'`
  (mesmo caminho do MTR comum — confirma reuso decidido em
  [02-source-validation.md](02-source-validation.md) §2.4).

### D3 — Não decidir R3 (sobrecarga `tipoManifesto`)

Conforme restrição da fase, **não** há valor numérico hardcoded para
provisório. O parâmetro `tipoManifestoOverride` é aceito como número ou
string e propagado tal qual ao body. A decisão final fica para a fase 04
(`programador-backend-mtr`). Recomendação técnica registrada em §5
abaixo.

### D4 — Audit-exchange-logging preservado

- `submitMtrProvisorio` herda integralmente o audit do `submitManifest`
  (incluindo `extraAudits` do `lookupManifestByHash` e o
  `buildSubmitManifestResponse`).
- `listMtrProvisorio` produz audit via
  `buildJsonOperationExchange` (helper compartilhado), com
  `sanitizedBody` derivado pelo `extractApiItems` e search context
  inline (`{ parCodigo, flag }`).
- `printMtrProvisorio` produz audit via
  `buildBufferOperationExchange` (mesmo helper de
  `printManifestReceipt` e `printCdfCertificate`).

### D5 — Sem hardcode fora do gateway

Nenhum endpoint, header, JWT ou recaptcha foi vazado para fora do
gateway. O hook em `submitManifest` lê `manifest.tipoManifestoOverride`
(propriedade não-enumerável definida apenas pelo próprio gateway via
`Object.defineProperty`) — services e workers da fase 04+ chamam
exclusivamente os métodos públicos do bloco.

## Arquivos alterados

- [src/gateways/cetesb-gateway.js](../../../src/gateways/cetesb-gateway.js):
  - hook controlado em `submitManifest` para consumir
    `manifest.tipoManifestoOverride` (±10 linhas, antes do
    `console.log` de debug existente);
  - novo bloco `MTR provisório — bloco isolado` (±100 linhas) antes do
    bloco DMR stub, contendo `submitMtrProvisorio`,
    `listMtrProvisorio`, `printMtrProvisorio`.

Nenhum outro arquivo de produção foi alterado.

## R3 — Recomendação técnica (sem decidir)

Conflito original em
[02-source-validation.md §2.5](02-source-validation.md#25-discriminador-tipomanifesto-conflito-a-resolver-na-fase-04):
o campo `tipoManifesto` está sobrecarregado entre o eixo SICAT legado
(jurisdição I/E/M → 1/2/3, mapeado em
[src/gateways/cetesb-gateway.js#L1262](../../../src/gateways/cetesb-gateway.js))
e o eixo SIGOR/CETESB real (variante de manifesto: definitivo,
provisório, armazenamento temporário, etc.).

### Opções avaliadas pela perspectiva da integração

- **Opção R3-A — `tipoManifesto` puramente como variante**
  - prós: alinhado à evidência HAR (`tipoManifesto: 1` aparece em MTR
    comum em [gerar_mtr.har#L16745](../../cetesb/mtr.cetesb.sp.gov.br_gerar_mtr.har));
    elimina dead code do mapeamento I/E/M; simplifica o gateway.
  - contras: requer remover ou redefinir o atual mapeamento I/E/M; pode
    afetar fixtures/testes que dependem de `manifestType ∈ {I,E,M}`.
  - impacto na fase 04: criar enum `mtrVariant` no contrato e
    converter no service antes de chamar `submitMtrProvisorio`.

- **Opção R3-B — segundo campo (`subtipoManifesto` ou similar)**
  - prós: mantém compat com qualquer cliente legado que use I/E/M; não
    quebra mapeamento atual.
  - contras: introduz **dois discriminadores** no payload CETESB sem
    evidência HAR explícita de aceitação; viola a política CETESB
    source-of-truth
    ([.github/instructions/cetesb-source-of-truth.instructions.md](../../../.github/instructions/cetesb-source-of-truth.instructions.md))
    (campos sem evidência HAR são proibidos).
  - **não recomendada** pela perspectiva do gateway.

- **Opção R3-C — `kind` (SICAT) como discriminador de domínio**
  - prós: separa o eixo de domínio (`kind: "definitivo" | "provisorio"
    | "armazenamento_temporario"`) do eixo de transporte
    (`tipoManifesto` numérico); mantém o gateway como única borda que
    converte; permite remover I/E/M da superfície pública sem mexer em
    contratos legados na primeira iteração.
  - contras: precisa de tabela de conversão `kind → tipoManifesto`
    documentada no service (não no gateway), e da decisão sobre o
    valor numérico real para provisório (mitigável por captura HAR
    humana §3.2 do checkpoint 02 — recomendada antes do merge final).
  - impacto na fase 04: introduzir `kind` no schema do
    `/v1/mtr-provisorio/*` e mapear na borda do service que invoca o
    gateway; o `tipoManifestoOverride` deste bloco recebe o valor
    convertido.

### Recomendação do integrador

**Opção R3-C** é a mais aderente à arquitetura atual (já existe
`kind ∈ { all, ... }` no gateway para `pesquisaManifesto`,
[src/gateways/cetesb-gateway.js#L1623-L1638](../../../src/gateways/cetesb-gateway.js))
e à fronteira `services → gateway`. R3-A é viável mas exige cleanup
maior e está fora do escopo desta cadeia. R3-B é desencorajada por
violar a política de fonte da verdade.

A decisão final permanece com `programador-backend-mtr` na fase 04.

## Validações executadas

| Validação | Comando | Resultado |
| --- | --- | --- |
| HAR ↔ Gateway estrutural | `npm run validate:har-gateway` | **ok** — 5 ops HAR + 6 seções gateway, 11 checks |
| OpenAPI + política CETESB + md-links | `npm run validate:openapi` | **ok** — 669 arquivos, 0 problemas |
| Source-of-truth | `npm run test:source-of-truth` | **9/9 passando** |
| TypeScript | `npm run typecheck` | **0 erros** |
| Markdown links | `npm run validate:md-links` | **ok** — 669 arquivos, 0 problemas |

## Diff resumido

```diff
src/gateways/cetesb-gateway.js
  +10 linhas em submitManifest    (hook tipoManifestoOverride)
 +100 linhas (bloco isolado)      (submitMtrProvisorio, listMtrProvisorio, printMtrProvisorio)
```

Sem outros arquivos alterados.

## Riscos residuais

- **R1 (médio)**: valor numérico de `tipoManifesto` para variante
  provisória ainda é suposição; mitigado por
  `tipoManifestoOverride` parametrizável + audit-exchange-logging
  (gateway loga payload sanitizado para diagnóstico). Mitigação total
  exige a captura HAR humana §3.2 do checkpoint 02.
- **R2 (baixo)**: estrutura interna dos itens da listagem dedicada
  pode divergir levemente da listagem unificada; mitigado por
  `extractApiItems` (parser tolerante já validado em outras operações).
- **R3 (médio — não-bloqueante para fase 04)**: sobrecarga
  `tipoManifesto`; recomendação técnica em §5; decisão final é da
  fase 04.

## Bloqueios

Nenhum bloqueio. Capturas adicionais (`gerar_mtr_provisorio.har`,
`imprimir_mtr_provisorio.har`, `listar_mtr_provisorio.har`)
permanecem **recomendadas mas não bloqueantes** — referência:
[02-source-validation.md §3.2](02-source-validation.md#32-lista-mínima-de-capturas-recomendadas-para-mitigar-r1-e-r3).

## Handoff explícito para a fase 04 (`programador-backend-mtr`)

**Próximo agente**: `programador-backend-mtr`.
**Próxima fase**: `04-backend-contracts`.
**Próximo checkpoint**:
`docs/handoffs/mtr-provisorio-fluxo-base/04-backend-contracts.md`.

### Entradas para o próximo agente

- baseline:
  [docs/04-arquitetura/mtr-provisorio-sicat.md](../../04-arquitetura/mtr-provisorio-sicat.md);
- veredicto de evidência:
  [02-source-validation.md](02-source-validation.md) (§§2 e 3);
- bloco gateway pronto:
  [src/gateways/cetesb-gateway.js](../../../src/gateways/cetesb-gateway.js)
  (procurar comentário `MTR provisório — bloco isolado`);
- decisão a fechar nesta fase:
  - **R3** (sobrecarga `tipoManifesto`) — adotar uma das três opções
    em §5 deste checkpoint; recomendação do integrador é R3-C
    (`kind` como discriminador de domínio + mapeamento na borda do
    service).
- testes a manter verdes:
  `npm run validate:har-gateway`,
  `npm run validate:openapi`,
  `npm run test:source-of-truth`,
  `npm run typecheck`,
  `npm run validate:md-links`.

### Entregas obrigatórias da fase 04

1. Família HTTP dedicada `/v1/mtr-provisorio/*` (criação, listagem,
   detalhe, impressão) em lockstep:
   - `openapi/mtr_automacao_openapi_interna.yaml`;
   - `examples/`;
   - `src/generated/operations.ts` (regenerar via `npm run gen:operations`);
   - `src/routes/api-routes.ts`;
   - `src/services/*` (services que consumam apenas os métodos públicos
     do bloco gateway: `submitMtrProvisorio`, `listMtrProvisorio`,
     `printMtrProvisorio`).
2. Resolver R3 e converter o valor de domínio (`kind`) em
   `tipoManifestoOverride` na borda do service antes de chamar
   `submitMtrProvisorio`.
3. Comandos assíncronos retornam `202 command-accepted` (ver
   `manifest-service.ts` como template).
4. Erros em `application/problem+json` via `src/lib/problem.ts`.
5. Preservar `correlationId`, `commandId`, `sessionContextId`,
   `integrationAccountId`, `Idempotency-Key`.

### Prompt sugerido para o próximo agente

```text
work_id: mtr-provisorio-fluxo-base
fase: 04-backend-contracts
agente: programador-backend-mtr

Implemente a família HTTP /v1/mtr-provisorio/* (criação, listagem,
detalhe, impressão) em lockstep OpenAPI ↔ examples ↔ operations.ts
↔ rotas ↔ services. O bloco gateway está pronto em
src/gateways/cetesb-gateway.js (procure "MTR provisório — bloco
isolado") expondo submitMtrProvisorio, listMtrProvisorio e
printMtrProvisorio.

Decida formalmente R3 (sobrecarga tipoManifesto). Recomendação técnica
do integrador: opção R3-C (kind como discriminador de domínio,
convertido para tipoManifestoOverride na borda do service). Documente
a decisão no checkpoint 04 com justificativa.

Não alterar gateway, persistência (fase 05), worker handler (fase 05),
domínio (fase 06), frontend (fase 07) ou testes finais (fase 08).
Não fazer commit/push.

Validações que devem permanecer verdes ao final:
- npm run validate:har-gateway
- npm run validate:openapi
- npm run test:source-of-truth
- npm run typecheck
- npm run validate:md-links
- npm run test:contract

Entregas obrigatórias:
1. OpenAPI + examples + operations.ts + rotas + services em lockstep.
2. Decisão R3 formal com justificativa.
3. Checkpoint
   docs/handoffs/mtr-provisorio-fluxo-base/04-backend-contracts.md
   com objetivo, arquivos analisados, decisões, arquivos alterados,
   validações, R3 fechado, handoff explícito para postgres-queue-mtr
   (fase 05).
4. Atualizar
   docs/handoffs/mtr-provisorio-fluxo-base/00-orchestration.md §6:
   fase 04 CONCLUÍDA, fase 05 ATIVA.
```

## Próximo agente

`programador-backend-mtr` — fase `04-backend-contracts`. Se o runtime
não conseguir invocá-lo, devolver `next_agent_required` com o prompt
acima.
