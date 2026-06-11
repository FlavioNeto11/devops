---
title: "Schema do endpoint de contrato de portal"
status: reference
applies_to: [platform]
updated: 2026-06-11
language: pt-BR
---

# Schema de um endpoint (`endpoints.jsonl`)

Uma linha JSON por endpoint observado. Campos:

| Campo | Tipo | Obrigatório | Descrição |
|---|---|---|---|
| `id` | string | sim | Id estável `^[a-z0-9]+(-[a-z0-9]+)+$` (ex.: `cetesb-mtr-login`). Único no arquivo. |
| `portal` | string | sim | Slug do portal (ex.: `cetesb`). |
| `group` | string | sim | Grupo funcional (`auth`, `manifesto`, `cdf`, `catalogo`, `search`, `cadastro`). |
| `title` | string | sim | Rótulo humano. |
| `method` | string | sim | `GET`/`POST`/`PUT`/`DELETE`/`PATCH`. |
| `path_template` | string | sim | Path com `{params}` normalizados; começa com `/`. |
| `path_params` | array | sim | `[{ name, type, detected_from }]`; todo `{param}` do template tem entrada e vice-versa. |
| `auth.required` | bool | sim | Se o endpoint exige sessão. |
| `auth.token_header_mode` | string | sim | `none` / `authorization` / `x-access-token` / `both`. |
| `auth.scopes` | array | não | Escopos observados (livre). |
| `request.content_type` | string | não | Ex.: `application/json`. |
| `request.schema` | object | sim | Schema inferido (ver abaixo). `{}` para GET sem corpo. |
| `response.content_type` | string | não | Ex.: `application/json`, `application/pdf`. |
| `response.status_observed` | array | não | Status HTTP vistos (ex.: `[200]`). |
| `response.schema` | object | sim | Schema inferido do corpo da resposta. |
| `headers_relevant` | object | não | `{ request: [], response: [] }` — nomes de headers que importam. |
| `cookies` | object | não | `{ sets: bool, names_observed: [] }`. |
| `requires_captcha` | bool | sim | Se o endpoint exige captcha (as APIs internas da CETESB **não**). |
| `observability` | object | sim | `{ sample_count, source, first_seen, last_seen }`. |
| `redaction` | object | não | `{ applied: bool, policy: string }`. |

## Schema inferido (`request.schema` / `response.schema`)

Estrutura simplificada inspirada em JSON Schema, **observacional** (não fecha contrato):

```json
{
  "type": "object",
  "required": ["campoA"],                 // presente em 100% das amostras
  "properties": {
    "campoA": { "type": "string" },
    "campoB": { "type": "integer", "optional": true },
    "senha":  { "type": "string", "sensitive": true },
    "estado": { "type": "string", "enum_observed": ["ATIVO", "INATIVO"] },
    "obs":    { "type": "string", "nullable_observed": true }
  }
}
```

- `optional: true` → campo visto em <100% das amostras.
- `sensitive: true` → redigido nos exemplos (token/senha/cookie/cpf/cnpj/...).
- `enum_observed` → valores vistos (observação, nunca enum fechado).
- `nullable_observed: true` → apareceu `null` em alguma amostra.
- `type` de array: `{ "type": "array", "items": { ... } }`.
- Campos inferidos de **1 amostra** carregam `low_confidence: true`.
