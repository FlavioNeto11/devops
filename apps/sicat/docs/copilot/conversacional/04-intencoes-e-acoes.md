# Intencoes e acoes

## Taxonomia principal

### 1. Consultas simples
Perguntas objetivas sem necessidade de execucao.

Exemplos:
- "quais manifestos eu tenho hoje?"
- "qual o status do manifesto 123?"
- "me manda o historico"

### 2. Consultas operacionais com contexto
Perguntas que exigem contexto de conta, manifesto ou estado.

Exemplos:
- "o que esta pendente para este manifesto?"
- "qual documento esta faltando?"
- "essa operacao ja foi concluida?"

### 3. Explicacoes e orientacoes
Perguntas sobre sistema, regra, campo ou fluxo.

Exemplos:
- "o que significa esse status?"
- "o que e geofence?"
- "como preencher esse campo?"
- "por que nao consigo enviar?"

### 4. Navegacao assistida
Ajudar o usuario a localizar areas e passos.

Exemplos:
- "onde eu troco a conta CETESB?"
- "abre a tela de manifestos"
- "qual a pagina para ver jobs?"

### 5. Sugestoes guiadas
A IA prepara, sugere, recomenda ou preenche parcialmente.

Exemplos:
- sugerir preenchimento
- sugerir filtros
- sugerir proximo passo
- resumir situacao antes de agir

### 6. Execucao de acoes
Acao operacional real via tools.

Exemplos plausiveis com base no estado atual do repo:
- submit de manifesto
- print de manifesto
- cancel de manifesto
- reconsulta de job
- consulta de auditoria
- troca de foco de navegacao interna

### 7. Acoes sensiveis com confirmacao
Acoes executaveis somente com gate adicional.

Exemplos:
- cancelamento
- qualquer acao de impacto regulatorio
- acao em nome de conta ativa
- operacao iniciada por WhatsApp

### 8. Acoes bloqueadas
Operacoes sem permissao, contexto insuficiente ou suporte backend ausente.

Exemplos:
- "dê baixa agora" quando nao existir endpoint/control plane implementado
- operacoes administrativas por canal restrito
- operacao em conta nao ativa
- operacao sem identidade vinculada

## Matriz de classificacao

| Classe | Pode responder | Pode orientar | Pode preparar | Pode executar |
| --- | --- | --- | --- | --- |
| Consulta simples | sim | sim | n/a | nao |
| Consulta com contexto | sim | sim | n/a | nao |
| Explicacao | sim | sim | n/a | nao |
| Navegacao | sim | sim | sim | limitado |
| Sugestao guiada | sim | sim | sim | nao automatico |
| Acao operacional | sim | sim | sim | sim, se permitido |
| Acao sensivel | sim | sim | sim | sim, com confirmacao |
| Bloqueada | sim | sim | nao | nao |

## Tools recomendadas - estado atual

### Tools apoiadas por capacidades ja existentes
- `list_manifests`
- `get_manifest_details`
- `get_manifest_document`
- `get_job_status`
- `stream_job_events`
- `get_audit_trail`
- `list_partners`
- `get_dashboard_overview`
- `get_active_jobs`
- `get_workers_health`
- `explain_current_screen`
- `navigate_to_screen`
- `suggest_form_field`
- `submit_manifest`
- `print_manifest`
- `cancel_manifest`
- `switch_active_cetesb_account`

### Tools alvo futuro, dependentes de evolucao do produto
- `execute_shared_drop`
- `validate_nfc_step`
- `confirm_proximity_completion`
- `continue_operational_flow`
- `request_document_upload_via_chat`

## Estado implementado na fase 05-domain-rules (chat-copiloto-operacional)

### Intents compostos operacionais agora suportados
- `manifest.list_recent_top`
- `manifest.detail_selected_set`
- `manifest.lookup_generator_by_number`
- `memory.list_asked_manifests`
- `manifest.create_draft`
- `manifest.create_from_payload`
- `manifest.receive_with_receipt`
- `manifest.replicate_with_patch`
- `manifest.cancel_recent_excluding_first`
- `manifest.batch_submit_selected`
- `manifest.batch_print_selected`
- `manifest.batch_cancel_selected`
- `cdf.resolve_by_manifest_reference`

### Regras operacionais aplicadas no backend conversacional
1. Operacoes em lote usam limite seguro de 10 manifestos por comando.
2. Cancelamento em lote exige `reason` com no minimo 3 caracteres.
3. `manifest.create_from_payload` valida faltantes obrigatorios antes de criar.
4. Referencia ambigua por numero de manifesto retorna orientacao objetiva com candidatos.
5. Falta de referencia contextual (`esse`, `ultimo`, lista anterior) retorna instrucao operacional clara.

## Formato conceitual de tool

```json
{
  "name": "submit_manifest",
  "intent_class": "action_sensitive",
  "channel_support": ["inapp", "native_chat"],
  "requires_active_account": true,
  "requires_confirmation": true,
  "requires_strong_auth": false,
  "backend_dependency": "existing",
  "idempotency_strategy": "explicit_confirmation_and_correlation"
}
```

## Regras de desenho

1. Toda tool tem classificacao de risco.
2. Toda tool informa canais suportados.
3. Toda tool informa dependencia de backend existente ou futura.
4. Toda tool informa se exige conta ativa.
5. Toda tool informa se exige confirmacao.
