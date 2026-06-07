# Auditoria HANDOFF 3 (DL-017) — Coerência implementação x evidência HAR CETESB

Data: 2026-03-09
Escopo: `docs/cetesb/*.har` vs `src/gateways/cetesb-gateway.js`, `src/lib/validators/manifest-validator.js`, `openapi/mtr_automacao_openapi_interna.yaml`, `examples/`.

## Operações auditadas

| Operação interna | Evidência HAR | Chamada CETESB observada | Status | Observações |
|---|---|---|---|---|
| `POST /v1/auth/login` | `mtr.cetesb.sp.gov.br_login.har` | `POST /api/mtr/carregaDadosLogin` body com `sistema`, `login`, `email`, `senha`, `parCodigo`, `recaptcha`; resposta com `objetoResposta.token`, `parCodigo`, `paaCodigo`, `estCodigo` | Aderente | Gateway real usa `POST /api/mtr/carregaDadosLogin` e mapeia token/dados de parceiro. |
| `POST /v1/session-contexts` (bootstrap) | `mtr.cetesb.sp.gov.br_login.har` | Mesmo endpoint de login técnico (`/api/mtr/carregaDadosLogin`) | Aderente | Diferença de camada documentada: endpoint interno cria contexto assíncrono/técnico e encapsula autenticação CETESB. |
| `POST /v1/manifestos/{id}/submit` | `mtr.cetesb.sp.gov.br_gerar_mtr.har` | `PUT /api/mtr/manifesto` com payload completo (`manResponsavel`, `manDataExpedicao`, `parceiro*`, `listaManifestoResiduo`, `recaptcha`) e retorno `mensagem` (hash) | Aderente com ajuste | Gateway já aderente; divergência estava no validador interno (campos internos x campos CETESB). |
| `POST /v1/manifestos/{id}/print` | `mtr.cetesb.sp.gov.br_imprimir_mtr.har` | `GET /api/mtr/imprimir/imprimeManifesto/{hash}` retorno `application/pdf` | Aderente | Gateway usa `requestBuffer` e mantém `pdfBuffer` no retorno interno. |
| `POST /v1/manifestos/{id}/cancel` | `mtr.cetesb.sp.gov.br_cancelar_mtr.har` | `POST /api/mtr/manifesto/cancelaManifesto` body com `manCodigo`, `manNumero`, `manJustificativaCancelamento`; resposta de sucesso | Aderente | Gateway usa campo `manJustificativaCancelamento` e valida `reason` (3..500), alinhado ao HAR e OpenAPI interno. |
| `POST /v1/cadastros` | `mtr.cetesb.sp.gov.br_criar_cadastro.har` | `POST /api/cadastro/salvarAcesso` | Aderente | Mapping de cadastro no gateway permanece compatível com payload observado. |
| `GET /v1/partners/search` | `mtr.cetesb.sp.gov.br_gerar_mtr.har` e `mtr.cetesb.sp.gov.br_login.har` | `GET /api/mtr/pesquisaParceiro/{role}/{term}`, `GET /api/mtr/pesquisaParceiroByCodigo/{code}`, `GET /api/mtr/consultaParceiro/J/{document}` | Aderente | OpenAPI/examples internos seguem modelo normalizado e gateway encapsula variações CETESB. |
| `GET /v1/catalogs/{catalogName}` / sync | `mtr.cetesb.sp.gov.br_gerar_mtr.har`, `mtr.cetesb.sp.gov.br_criar_cadastro.har`, `mtr.cetesb.sp.gov.br_cancelar_mtr.har`, `mtr.cetesb.sp.gov.br_imprimir_mtr.har` | `GET /api/unidades`, `GET /api/classes`, `GET /api/residuo/*`, `GET /api/cidades/{uf}`, `GET /api/estados`, `GET /api/orgaoEmissor`, etc. | Aderente | Endpoints catalogados no gateway conferem com HAR. |

## Divergência real encontrada

1. **Validador de manifesto validava o shape errado (divergente)**
   - Evidência:
     - OpenAPI (`ManifestCreateRequest`) e `examples/post_v1_manifestos_request.json` usam payload interno normalizado (`generator.partnerCode`, `residues[].quantity`, `residue.code`, `unit.code`, `treatment.code`, `class.code`).
     - HAR mostra esse shape apenas na camada externa CETESB (`parceiroGerador.parCodigo`, `listaManifestoResiduo[].marQuantidade`), após mapeamento no gateway.
   - Impacto:
     - `validateManifestPayload` verificava campos CETESB (`parCodigo`, `marQuantidade`, etc.) antes do mapeamento, gerando inconsistência de contrato interno.

## Ações aplicadas

- Atualizado `src/lib/validators/manifest-validator.js` para validar o **payload interno** (pré-mapeamento) e manter mensagens com referência cruzada para o campo CETESB correspondente.
- Removida exigência rígida de `recaptchaToken` no validador interno (sem evidência HAR conclusiva de obrigatoriedade de contrato interno; recaptcha continua sendo enviado quando disponível no mapeamento/gateway).
- Atualizado `tests/unit/manifest-validator.test.js` para o shape interno real e novas regras.

## Arquivos alterados nesta auditoria

- `src/lib/validators/manifest-validator.js`
- `tests/unit/manifest-validator.test.js`
- `docs/copilot/validadores/cetesb/AUDITORIA-HANDOFF-3-DL-017.md`

## Evidência HAR utilizada (arquivo-fonte)

- `docs/cetesb/mtr.cetesb.sp.gov.br_login.har`
- `docs/cetesb/mtr.cetesb.sp.gov.br_gerar_mtr.har`
- `docs/cetesb/mtr.cetesb.sp.gov.br_imprimir_mtr.har`
- `docs/cetesb/mtr.cetesb.sp.gov.br_cancelar_mtr.har`
- `docs/cetesb/mtr.cetesb.sp.gov.br_criar_cadastro.har`

## Nota sobre diferença de camada

A API interna mantém contrato assíncrono (`202` + job/command) por decisão arquitetural. Os HARs comprovam apenas o protocolo CETESB síncrono subjacente. Esta diferença está preservada e explicitada.
