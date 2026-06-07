# Technical Decisions - DL-069

## Decisão 1: remover apenas manifestos com falha
- **Escolha:** permitir exclusão somente quando `status/externalStatus` indicar falha (`fail/error/dlq/falha/erro`).
- **Motivo:** evitar exclusão acidental de manifestos válidos/submetidos.

## Decisão 2: manter endpoint síncrono de exclusão
- **Escolha:** `DELETE /v1/manifestos/{id}` retornando `200` com `{ removed, id }`.
- **Motivo:** operação local no banco, sem dependência de job assíncrono.

## Decisão 3: manter rastreabilidade
- **Escolha:** registrar auditoria interna no service quando houver `correlationId`.
- **Motivo:** preservar observabilidade operacional da ação de remoção.

## Decisão 4: botão de UI integrado ao backend
- **Escolha:** substituir remoção apenas visual por chamada de API real e `search()` após sucesso.
- **Motivo:** alinhar expectativa do operador com persistência efetiva da ação.
