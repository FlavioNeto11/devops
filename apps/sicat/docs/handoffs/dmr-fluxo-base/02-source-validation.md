# 02 — Source Validation — DMR (cadeia `dmr-fluxo-base`)

> Fase de validação de fonte externa CETESB para DMR. Não captura HAR
> (ação humana); diagnostica o gap, valida fallback local e produz
> plano explícito para destravar a cadeia.
>
> Anterior: [01-baseline-docs.md](01-baseline-docs.md).
> Geral: [00-orchestration.md](00-orchestration.md).
> Arquitetura alvo: [docs/04-arquitetura/dmr-sicat.md](../../04-arquitetura/dmr-sicat.md).

## 1. Objetivo da fase

1. Inventariar e classificar a evidência CETESB existente em
   [docs/cetesb/](../../cetesb/) quanto à cobertura DMR.
2. Validar suposições R2/R3/R4 do baseline (§7) contra evidência
   indireta (esquema atual de `manifests` e payloads representativos).
3. Produzir plano de captura mínimo para HAR DMR (sem capturar).
4. Avaliar viabilidade do fallback de consolidação local
   (sem endpoint dedicado CETESB).
5. Recomendar caminho A (aguardar HAR) vs B (avançar com stub
   contratual) para a próxima fase.

## 2. Arquivos analisados

- [docs/cetesb/](../../cetesb/) — 8 HARs + [README.md](../../cetesb/README.md).
- [docs/cetesb/mtr.cetesb.sp.gov.br_login.har](../../cetesb/mtr.cetesb.sp.gov.br_login.har)
  — única menção textual a "DMR" (em HTML estático da página de
  termos/aviso, não em payload de API).
- [src/sql/001_init.sql](../../../src/sql/001_init.sql) §`manifests` —
  esquema canônico transacional já existente.
- [examples/post_v1_manifestos_response.json](../../../examples/post_v1_manifestos_response.json)
  — payload representativo do MTR (campos disponíveis para agregação
  DMR).
- [package.json](../../../package.json) §scripts `validate:har-gateway`
  e `validate:openapi` — escopo atual das validações automatizadas.
- [docs/04-arquitetura/dmr-sicat.md §3, §5, §7](../../04-arquitetura/dmr-sicat.md)
  — esquema de dados, evidência e riscos a confirmar.

## 3. Inventário classificado de [docs/cetesb/](../../cetesb/)

Classificação:

- **(a)** cobre DMR (estrutura de request/response DMR);
- **(b)** tangencia DMR (referência indireta — login compartilhado, menu,
  dados consolidáveis);
- **(c)** não relacionado a DMR.

| arquivo | classe | observação |
| --- | --- | --- |
| [README.md](../../cetesb/README.md) | (c) | Inventário sem entrada DMR (será atualizado quando HAR DMR chegar). |
| [mtr.cetesb.sp.gov.br_login.har](../../cetesb/mtr.cetesb.sp.gov.br_login.har) | (b) | Bootstrap de sessão CETESB reutilizável pelo bloco DMR. Contém menção textual "MTR, DMR, CDF" apenas em HTML institucional (linha 801). Não há rota DMR neste HAR. |
| [mtr.cetesb.sp.gov.br_criar_cadastro.har](../../cetesb/mtr.cetesb.sp.gov.br_criar_cadastro.har) | (b) | Mesma menção textual "MTR, DMR, CDF" em HTML (linha 14201). Sem rota DMR. |
| [mtr.cetesb.sp.gov.br_gerar_mtr.har](../../cetesb/mtr.cetesb.sp.gov.br_gerar_mtr.har) | (b) | Tangencia DMR via dados que serão consolidados (resíduo, quantidade, parceiros, datas). Sem rota DMR. |
| [mtr.cetesb.sp.gov.br_imprimir_mtr.har](../../cetesb/mtr.cetesb.sp.gov.br_imprimir_mtr.har) | (b) | Idem (snapshot do MTR já com `listaManifestoResiduo`). |
| [mtr.cetesb.sp.gov.br_cancelar_mtr.har](../../cetesb/mtr.cetesb.sp.gov.br_cancelar_mtr.har) | (b) | Idem; útil para excluir MTRs cancelados da consolidação DMR. |
| [mtr.cetesb.sp.gov.br_recebimento_mtr.har](../../cetesb/mtr.cetesb.sp.gov.br_recebimento_mtr.har) | (b) | Idem; quantidade efetivamente recebida (`receivedQuantity`) precisa entrar na consolidação. |
| [mtr.cetesb.sp.gov.br_gerar_cdf_mtr.har](../../cetesb/mtr.cetesb.sp.gov.br_gerar_cdf_mtr.har) | (c) | CDF é documento separado; não compõe DMR. |
| [mtr.cetesb.sp.gov.br_baixar_cdf_mtr.har](../../cetesb/mtr.cetesb.sp.gov.br_baixar_cdf_mtr.har) | (c) | Idem. |

**Conclusão**: nenhum HAR cobre DMR (classe a). Todo o repositório
operacional/transacional está em classe (b) ou (c). A busca por termos
`dmr|declaracao|movimentacao|consolidacao|consolidação|declaração` em
`docs/cetesb/**` retornou apenas matches em HTML estático e em strings
binárias/codificadas dos HARs — **nenhum endpoint, payload ou schema
DMR**.

## 4. Validação das suposições R2/R3/R4 contra evidência indireta

### R2 — Periodicidade arbitrária [`period_start`, `period_end`]

Evidência cruzada: o payload do MTR
([examples/post_v1_manifestos_response.json](../../../examples/post_v1_manifestos_response.json))
expõe `expeditionDate` (data de emissão) e `createdAt`/`updatedAt`. O HAR
de recebimento permite obter a data de recebimento. Isso confirma que o
SICAT pode filtrar MTRs por janela arbitrária no lado do servidor sem
depender da CETESB.

Status: **suposição confirmada**. Manter `period_end >= period_start` e
deixar a janela escolhida pelo operador. Ajustar somente se a fase 03
(quando houver HAR DMR) revelar restrição CETESB.

### R3 — Consolidação local sem endpoint CETESB dedicado

Evidência cruzada: o payload do MTR já carrega todos os campos que a
DMR precisa por linha consolidada (ver §5 abaixo). Isto significa que
o `dmr-service` consegue produzir `summary_totals` e
`dmr_declaration_items` 100% no servidor, lendo da tabela `manifests`,
**sem chamar a CETESB durante a consolidação**.

Status: **suposição confirmada — fallback viável** (ver §6).

### R4 — Tabela própria vs reuso de `manifests`

Evidência cruzada: `manifests` (em [src/sql/001_init.sql](../../../src/sql/001_init.sql))
é estritamente transacional (1 linha = 1 MTR), com `payload jsonb`
guardando o snapshot do MTR. Não há colunas para janela declaratória,
papel agregado, protocolo CETESB DMR, status declaratório nem
`payload_snapshot` da DMR. Reuso forçaria adicionar colunas opcionais
e novas constraints ao `manifests` e degradaria os índices DL-022
existentes (`idx_manifests_filters`).

Status: **decisão R4 mantida — tabelas próprias `dmr_declarations`
e `dmr_declaration_items` conforme §3 do baseline arquitetural**.

## 5. Avaliação do fallback de consolidação local

### Mapeamento payload `manifests.payload` → `dmr_declaration_items`

Usando o snapshot real em
[examples/post_v1_manifestos_response.json](../../../examples/post_v1_manifestos_response.json):

| coluna alvo (`dmr_declaration_items`) | origem em `manifests.payload` | nota |
| --- | --- | --- |
| `manifest_id` | `manifests.id` | FK direta. |
| `mtr_number` | `payload.externalReference.mtrNumber` (quando presente) ou `manifests.id` enquanto MTR não foi emitido remotamente | Ajustar quando HAR DMR confirmar formato esperado. |
| `cdf_number` | `manifest_documents.type='cdf'.file_name` (heurística inicial) | Pode precisar refinar com HAR baixar/gerar CDF. |
| `residue_class` | `payload.residues[].class.description` (ex.: "CLASSE A (RCC)") | Mapear para enum SIGOR (`I`, `IIA`, `IIB`) na fase 06. |
| `residue_code` | `payload.residues[].residue.code` ou `ibamaCode` | Confirmar qual a CETESB exige na DMR. |
| `quantity_value` | `payload.residues[].weightTon` ou `quantity` (priorizar `receivedQuantity` quando recebido) | Conversão de unidade no `dmr-service`. |
| `quantity_unit` | `payload.residues[].unit.symbol` (ex.: `TON`) | Normalizar para `kg`/`t`/`m3`/`L`. |
| `partner_role` | derivado: `gerador`, `transportador`, `destinador` (presença de `generator`/`carrier`/`receiver`) | Sempre presente. |
| `partner_cnpj` | `payload.{generator|carrier|receiver}.document` | CNPJ "limpo" disponível. |
| `metadata` | bloco `residues[]` completo | Snapshot opcional para auditoria. |

### `summary_totals` sugerido

```jsonc
{
  "totalManifestos": <int>,
  "manifestosPorStatus": { "<status>": <int> },
  "totalMassaPorClasse": { "I": "<num>kg", "IIA": "<num>kg", "IIB": "<num>kg" },
  "totalMassaPorResiduo": [{ "code": <int>, "value": <num>, "unit": "kg" }],
  "parceirosDistintos": { "transportadores": <int>, "destinadores": <int> }
}
```

### Índices/colunas que já amparam a consolidação

Em `manifests`:

- `idx_manifests_filters` em
  `(integration_account_id, status, external_status, created_at desc)` —
  cobre as buscas mais comuns por janela e estado.

### Gaps identificados (não bloqueantes para o fallback)

1. Não há índice em `created_at` ou `expeditionDate` extraído do payload.
   A consulta de janela declaratória passará por filtro full-table até
   atingir o índice composto. **Mitigação**: a fase 05-persistence-queue
   pode adicionar índice opcional
   `create index if not exists idx_manifests_emitted_period on manifests((payload->>'expeditionDate'))`
   somente se medirmos lentidão.
2. `manifest_documents` não tem coluna explícita para `cdf_number`. A
   relação MTR↔CDF hoje é feita via `payload`. **Mitigação**: a fase 06
   pode derivar via service; só vira problema se a DMR exigir CDF
   obrigatoriamente.
3. `payload.residues[].receivedQuantity` é `null` enquanto não houver
   recebimento confirmado. **Mitigação**: a consolidação considera o
   maior entre `receivedQuantity` e `weightTon` e marca o item como
   "estimado" no `metadata`.

**Veredicto**: fallback **viável**. A consolidação 100% local cobre o
MVP da DMR sem violar a fronteira arquitetural.

## 6. Plano de captura HAR DMR (não executado nesta fase)

Captura é responsabilidade humana (depende de conta CETESB válida,
papel, período com MTRs e acesso ao portal). Esta fase apenas
formaliza o plano. Padrão de hostname inferido a partir dos HARs
existentes: `mtr.cetesb.sp.gov.br`. Caminhos abaixo são hipóteses
fundamentadas no padrão CRUD do portal — devem ser confirmadas no
momento da captura.

| # | nome sugerido em [docs/cetesb/](../../cetesb/) | URL provável (a confirmar) | condição de captura | campos críticos a expor |
| --- | --- | --- | --- | --- |
| 1 | `mtr.cetesb.sp.gov.br_listar_dmr.har` | `GET https://mtr.cetesb.sp.gov.br/api/dmr` ou `/api/declaracao` | Login válido + conta com pelo menos 1 DMR existente em qualquer status | paginação, filtros suportados, schema do item da listagem (id remoto, periodo, status, protocolo). |
| 2 | `mtr.cetesb.sp.gov.br_consolidar_dmr.har` | `POST .../api/dmr/consolidar` ou `GET .../api/dmr/preview?periodoIni=...&periodoFim=...` | Conta com MTRs no período | confirma se o portal expõe consolidação dedicada (R3) ou se é 100% derivada — define se o gateway DMR precisa de método `consolidate`. |
| 3 | `mtr.cetesb.sp.gov.br_enviar_dmr.har` | `POST .../api/dmr` ou `POST .../api/dmr/enviar` | Conta com DMR em rascunho consolidado | request canônico (papel, período, lista de itens), response com protocolo/aceite. |
| 4 | `mtr.cetesb.sp.gov.br_consultar_dmr.har` | `GET .../api/dmr/{id}` | DMR submetida com protocolo emitido | schema completo de status remoto, transições, mensagens de erro. |
| 5 | `mtr.cetesb.sp.gov.br_baixar_dmr.har` (opcional) | `GET .../api/dmr/{id}/comprovante` | DMR submetida | confirma se há PDF/recibo a baixar; opcional para o MVP. |

### Pistas extraídas dos HARs existentes

- Headers de sessão e cookies CETESB são compartilhados entre todos os
  HARs (login, criar/cancelar/imprimir/receber MTR). Heurística:
  o bloco DMR no gateway pode reutilizar 100% do mecanismo já existente
  em [src/services/session-context-service.ts](../../../src/services/session-context-service.ts).
- O padrão de resposta CETESB usado nos HARs é JSON com objetos
  encapsulados (ex.: `situacaoManifesto`, `parceiroAcesso`,
  `listaManifestoResiduo`). É razoável assumir que a DMR seguirá
  convenção análoga (`situacaoDmr`, `listaDmrItem`), mas isso só
  se confirma com HAR.

## 7. Validações automatizadas executadas

| comando | resultado | observação |
| --- | --- | --- |
| `npm run validate:har-gateway` | **OK** — 5 operações HAR validadas, 6 seções gateway, 11 checks. | Cobre apenas HARs presentes; **não regrediu** com a ausência de HAR DMR (script não exige DMR). |
| `npm run validate:openapi` | **OK** — OpenAPI válido, fonte de verdade CETESB validada, links MD íntegros. | Sanidade — nenhuma mudança ainda, esperado verde. |

Não foram executados testes de código, smokes operacionais ou
typecheck (não pertencem à fase de validação de fonte).

## 8. Decisão de roteamento — recomendação **Caminho B**

**Recomendação**: avançar para `04-backend-contracts`
(`programador-backend-mtr`) e tratar o bloco DMR no gateway como
**stub contratual** até HAR DMR chegar.

### Justificativa

1. A captura de HAR é ação humana com prazo indeterminado
   (depende de credenciais, conta com volume e janela CETESB).
2. O fallback de consolidação local é **viável** (§5) e cobre o
   MVP sem violar a fronteira.
3. O contrato HTTP da SICAT (`/v1/dmr/*`) é interno e pode ser
   construído a partir do esquema documentado em
   [docs/04-arquitetura/dmr-sicat.md §3, §4](../../04-arquitetura/dmr-sicat.md)
   sem depender do payload remoto.
4. O bloco DMR no gateway (fase 03) ficará como **stub validado por
   contrato**: implementa a interface esperada pelo worker, retorna
   um erro tipado `application/problem+json` com `type: not_implemented`
   e `code: dmr_gateway_pending_har`, sem hardcodar nenhum endpoint
   CETESB. Isso preserva DL-093 e mantém a fronteira: o worker continua
   sendo o único caminho possível, e o stub apenas devolve um erro
   controlado até o HAR habilitar a chamada real.
5. Ao plugar o HAR depois, a fase 03 só precisa substituir o corpo do
   stub por chamadas HTTP reais — sem reabrir contrato, persistência
   ou frontend.

### Sequência ajustada após esta fase

1. **Fase ATIVA**: 04-backend-contracts (`programador-backend-mtr`).
2. Fase 03-external-integration permanece **prevista mas adiada**;
   será reaberta assim que houver HAR DMR. A fase 04 deve criar a
   interface consumida pelo gateway (assinatura de método e tipos)
   para que a fase 03 só preencha implementação.
3. Fase 05-persistence-queue segue 04 normalmente (depende só do
   contrato e do esquema §3, ambos prontos).
4. Fase 06–09 inalteradas.

> Caminho A continua válido caso o HAR DMR seja capturado antes do
> início da fase 04. Nesse caso o orquestrador deve apenas reordenar:
> 03 antes de 04. Nada do que foi decidido aqui muda.

### Bloqueio explicitamente NÃO escalado

A ausência de HAR DMR **não** vai bloquear a cadeia. Vira pendência
nominal a ser resolvida quando a captura ocorrer. A fase 03 precisa
apenas:

- adicionar a captura em [docs/cetesb/](../../cetesb/);
- atualizar [docs/cetesb/README.md](../../cetesb/README.md);
- substituir o stub pelos endpoints reais;
- rerrodar `npm run validate:har-gateway` (que então deve passar a
  cobrir o bloco DMR também).

## 9. Status

Fase 02-source-validation: **concluída com plano** (decisão B
documentada). HAR DMR continua pendente, mas **não bloqueia** a
cadeia.

## 10. Itens pendentes ou explicitamente não cobertos

- Captura efetiva dos 4–5 HARs DMR — ação humana fora do escopo desta
  cadeia/agente.
- Implementação real do bloco DMR no gateway — fase 03 (adiada).
- Espelho de payload DMR em
  [tests/unit/cetesb-source-of-truth.test.js](../../../tests/unit/cetesb-source-of-truth.test.js)
  — só faz sentido depois da captura.

## 11. Arquivos criados/alterados nesta fase

- **Criado**: [docs/handoffs/dmr-fluxo-base/02-source-validation.md](02-source-validation.md)
  (este arquivo).
- **Alterado**: [docs/handoffs/dmr-fluxo-base/00-orchestration.md](00-orchestration.md)
  §6 — fase 02 marcada como concluída-com-plano, fase 04 ativa,
  fase 03 adiada com nota.

## 12. Handoff para a próxima fase

**Próximo agente**: `programador-backend-mtr`.
**Próxima fase**: `04-backend-contracts`.
**Próximo checkpoint**: `docs/handoffs/dmr-fluxo-base/04-backend-contracts.md`.

### Entregas obrigatórias da fase 04

1. Atualizar [openapi/mtr_automacao_openapi_interna.yaml](../../../openapi/mtr_automacao_openapi_interna.yaml)
   com os 8 paths `/v1/dmr/*` listados em
   [docs/04-arquitetura/dmr-sicat.md §4.2](../../04-arquitetura/dmr-sicat.md#42-endpoints-http-propostos-a-contratualizar-na-fase-04)
   e schemas `Dmr`, `DmrItem`, `DmrSubmitCommand`, `DmrCommandAccepted`,
   `DmrSummaryTotals`.
2. Criar pares request/response em [examples/](../../../examples/)
   conforme lista em
   [docs/04-arquitetura/dmr-sicat.md §6 Fase 04](../../04-arquitetura/dmr-sicat.md#fase-04-—-programador-backend-mtr).
3. Regenerar [src/generated/operations.ts](../../../src/generated/operations.ts)
   via `npm run gen:operations`.
4. Criar `src/routes/dmr-routes.ts` (montado pelo agregador em
   [src/routes/api-routes.ts](../../../src/routes/api-routes.ts)) e
   `src/services/dmr-service.ts` com:
   - rotas HTTP encaminhando para o service;
   - `enqueueDmrSubmit` retornando `202 + command-accepted`
     (espelhando `enqueueManifest*`);
   - idempotência via [src/services/idempotency-service.ts](../../../src/services/idempotency-service.ts);
   - **assinatura do método `submitDmr` esperada pelo gateway**
     (interface tipada exposta para a fase 03 implementar) — usar
     `not_implemented` problem JSON enquanto o gateway permanecer stub.
5. Rodar `npm run validate:openapi`, `npm run typecheck` e
   `npm run test:contract` — todos verdes.
6. Criar checkpoint
   `docs/handoffs/dmr-fluxo-base/04-backend-contracts.md` e atualizar
   §6 do [00-orchestration.md](00-orchestration.md).

### Restrições

- NÃO chamar a CETESB neste ponto. Quando o stub do gateway for
  invocado, deve devolver `problem+json` com
  `type=https://sicat/problems/dmr-gateway-pending-har` e
  `status=503`.
- NÃO criar migration ou tabela DMR (pertence à fase 05).
- NÃO tocar no frontend (pertence à fase 07).

### Prompt sugerido para o próximo agente

```text
work_id: dmr-fluxo-base
fase: 04-backend-contracts
agente: programador-backend-mtr

Construa o contrato HTTP DMR (OpenAPI + examples + operations + rotas
+ service) conforme docs/04-arquitetura/dmr-sicat.md §3, §4, §6 e
docs/handoffs/dmr-fluxo-base/02-source-validation.md §8 (decisão B).

Mínimo: OpenAPI publicada com 8 paths /v1/dmr/*, examples por
operação, operations.ts regenerada, src/routes/dmr-routes.ts e
src/services/dmr-service.ts criados, gateway DMR exposto como stub
tipado retornando 503 problem+json (`dmr-gateway-pending-har`),
validate:openapi + typecheck + test:contract verdes.

Atualize o checkpoint
docs/handoffs/dmr-fluxo-base/04-backend-contracts.md e marque a
fase 05 como ATIVA em
docs/handoffs/dmr-fluxo-base/00-orchestration.md §6.
```
