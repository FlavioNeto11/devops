---
title: "Schema do manifesto de contrato de portal"
status: reference
applies_to: [platform]
updated: 2026-06-11
language: pt-BR
---

# Schema do `manifest.json`

Um por pasta de versão. Metadados + integridade.

| Campo | Tipo | Obrigatório | Descrição |
|---|---|---|---|
| `portal` | string | sim | Slug (ex.: `cetesb`). |
| `base_url` | string | sim | Origem da API real (ex.: `https://mtrr.cetesb.sp.gov.br`). |
| `version` | string | sim | Igual ao nome da pasta (ex.: `2026-06-11`). |
| `label` | string | não | Rótulo da captura. |
| `endpoint_count` | int | sim | Deve bater com o nº de linhas de `endpoints.jsonl`. |
| `capture_window` | object | não | `{ from, to }` (datas da janela de captura). |
| `content_hash` | string | sim | `sha256:<hex>` do `endpoints.jsonl` **canônico** (ver abaixo). |
| `generated_by` | string | sim | Origem (`portal-recorder@<sha>` ou `seed-from-gateway`). |
| `redaction_policy` | string | não | Política de redação aplicada. |

## `content_hash` canônico

Para ser estável independente de ordem de chaves/espaços, o hash é calculado sobre a forma
**canônica** do arquivo: cada linha não-vazia é `JSON.parse`-ada e re-serializada com chaves
ordenadas recursivamente; as linhas são unidas por `\n`; `sha256` em hex, prefixado por `sha256:`.

O validador recomputa e compara (`CONTENT_HASH_MISMATCH`); `--write-hash` regrava o manifesto.
Isso garante que ninguém editou o `endpoints.jsonl` à mão sem regenerar o manifesto.
