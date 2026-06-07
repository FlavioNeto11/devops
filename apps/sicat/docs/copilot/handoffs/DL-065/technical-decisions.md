# Technical Decisions — DL-065

## Decisão 1: Filtragem textual para transportador/destinador
- **Implementação:** `carrierQuery` e `receiverQuery` no backend com `ILIKE` sobre nome e código.
- **Racional:** operadores normalmente buscam por fragmento de nome; filtro textual melhora eficiência sem exigir código exato.

## Decisão 2: Filtro de número MTR com correspondência parcial
- **Implementação:** `manifestNumber` com `ILIKE` em `external_reference.manNumero`.
- **Racional:** permite localizar manifesto mesmo com número incompleto em cenários operacionais.

## Decisão 3: Store com persistência dos novos filtros
- **Implementação:** `sicat_manifest_list_filters` passou a guardar `status`, `manifestNumber`, `carrierQuery`, `receiverQuery`.
- **Racional:** preservar contexto de busca ao navegar lista/detalhe.

## Decisão 4: Layout de filtros com grid dedicado
- **Implementação:** classe `manifests-filters-grid` em `ManifestsView` para organizar campos em desktop e empilhar no mobile.
- **Racional:** melhor legibilidade e redução de esforço cognitivo na operação.
