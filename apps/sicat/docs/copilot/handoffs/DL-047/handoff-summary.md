# Handoff Summary — DL-047

## Handoff 1 — Backend
- Mapeado que o fallback estava aplicado apenas em `searchManifests`
- Aplicado fallback equivalente em `lookupManifestByHash`
- Regra: em `HTTP 500` com `kind=all`, repetir com `kind=0`

## Handoff 2 — Testes
- Adicionado teste unitário para `lookupManifestByHash` com fallback
- Suite unitária do gateway executada com sucesso (8/8)

## Handoff 3 — Docs
- Decision log atualizado com DL-047
- Estrutura de docs atualizada
- Artefatos consolidados nesta pasta
