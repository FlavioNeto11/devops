# Handoff Summary — DL-046

## Handoff 1 — Backend
- `searchManifests` passou a tentar `kind=all` e, em caso de `HTTP 500`, repetir com `kind=0`.
- Mantido comportamento de `404` da CETESB como lista vazia.
- Audit da busca agora registra `attemptedKinds`.

## Handoff 2 — Testes
- Adicionado teste unitário cobrindo:
  - primeira chamada com `/all` retornando 500;
  - fallback para `/0` com sucesso;
  - retorno de itens após fallback.

## Handoff 3 — Documentação
- Decision log atualizado (DL-046)
- Estrutura de documentação atualizada
- Artefatos consolidados nesta pasta
