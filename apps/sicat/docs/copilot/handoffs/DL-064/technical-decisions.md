# Technical Decisions — DL-064

## Decisão 1: `Integration Account` como dado implícito de sessão
- **Implementação:** campo removido da UI de filtros.
- **Racional:** o valor vem da sessão ativa, portanto não deve exigir interação manual.

## Decisão 2: Reset de filtro com baseline operacional diária
- **Implementação:** `clearFilters()` passa a usar `getTodayBr()` para `dateFrom` e `dateTo`.
- **Racional:** evitar estado vazio e manter comportamento previsível para operação diária.

## Decisão 3: Persistência local do estado de filtro
- **Implementação:** chave `sicat_manifest_list_filters` em `localStorage` para salvar e restaurar filtros.
- **Racional:** preservar contexto ao alternar entre listagem e detalhe sem depender de querystring em rota.

## Decisão 4: Resolução automática de integração no store
- **Implementação:** fallback no `search()` para preencher `integrationAccountId` via sessão autenticada.
- **Racional:** manter compatibilidade com contrato backend sem expor campo técnico na tela.
