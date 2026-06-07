# Contratos conceituais de tools

## Objetivo

Definir como a camada conversacional conversa com o backend do SICAT.

## Regra

Tool nao e endpoint publico.
Tool e contrato interno da camada conversacional.
Uma tool pode usar um ou mais servicos/endpoints internos.

## Formato conceitual

Cada tool deve declarar:
- nome
- objetivo
- intencoes suportadas
- canais suportados
- risco
- pre-condicoes
- confirmacao
- dependencias de backend
- formato de entrada
- formato de saida
- erros esperados

## Ferramentas fase 1 - baseadas no que o repo ja oferece

### `list_manifests`
Objetivo:
consultar manifestos por filtro.

Base atual:
`GET /v1/manifestos`

### `get_manifest_details`
Objetivo:
consultar detalhe operacional de manifesto.

Base atual:
`GET /v1/manifestos/:id`

### `download_manifest_document`
Objetivo:
obter documento PDF do manifesto.

Base atual:
`GET /v1/manifestos/:id/documents/:documentId`

### `get_job_status`
Objetivo:
consultar status de processamento.

Base atual:
`GET /v1/jobs/:id`

### `get_audit_trail`
Objetivo:
consultar trilha por correlationId.

Base atual:
`GET /v1/audit/:correlationId`

### `search_partners`
Objetivo:
buscar parceiros no contexto atual.

Base atual:
`GET /v1/partners/search`

### `submit_manifest`
Objetivo:
submeter manifesto.

Base atual:
`POST /v1/manifestos/:id/submit`

### `print_manifest`
Objetivo:
gerar/imprimir manifesto.

Base atual:
`POST /v1/manifestos/:id/print`

### `cancel_manifest`
Objetivo:
cancelar manifesto.

Base atual:
`POST /v1/manifestos/:id/cancel`

### `get_dashboard_overview`
Objetivo:
resumir operacao atual.

Base atual:
`GET /v1/dashboard/overview`

### `switch_active_cetesb_account`
Objetivo:
ativar outra conta operacional.

Base atual:
`POST /v1/sicat/cetesb-accounts/:accountId/activate`

## Ferramentas fase 2 - copiloto interno de interface

### `explain_current_screen`
Explica tela, campos, passos e regras.

### `navigate_to_screen`
Leva usuario para rota relevante.

### `suggest_manifest_field_value`
Sugere preenchimento de campos.

### `summarize_page_context`
Resume contexto da pagina atual.

## Ferramentas fase 3 - dependentes de expansao do produto

### `execute_shared_drop`
Dependencia:
backend especifico de baixa compartilhada.

### `confirm_nfc_step`
Dependencia:
backend / control plane para NFC.

### `continue_operational_flow`
Dependencia:
modelagem conversacional de fluxos operacionais guiados.

## Politica de implementacao

Antes de criar uma tool nova:
1. verificar se backend ja oferece a capacidade;
2. verificar se o canal suporta a UX necessaria;
3. classificar risco;
4. documentar contrato;
5. criar testes de policy e trilha de auditoria.
