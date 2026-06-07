# Technical Decisions — DL-063

## Decisão 1: Centralizar detecção de erro
- **Implementação:** criação de `isErrorManifest(manifest)` em `ManifestsView`.
- **Racional:** evitar lógica duplicada e divergente de status ao decidir visibilidade de ações.

## Decisão 2: Reenviar apenas em erro
- **Implementação:** `canRecoverManifest` passou a depender da detecção de erro.
- **Racional:** impedir exibição de `Reenviar` em estados válidos/fluxos normais.

## Decisão 3: Ocultar ações não aplicáveis em erro
- **Implementação:** `Imprimir` e `Cancelar` renderizam apenas quando o manifesto não está em erro.
- **Racional:** evitar ações sem sentido operacional durante falha.

## Decisão 4: Remoção como limpeza de visualização local
- **Implementação:** botão `Remover` com confirmação e retirada do item da lista em memória.
- **Racional:** entregar resposta rápida para o operador sem alterar contrato/API neste ciclo.
- **Observação:** remoção é da visualização atual; nova busca pode trazer novamente o item se continuar persistido no backend.
