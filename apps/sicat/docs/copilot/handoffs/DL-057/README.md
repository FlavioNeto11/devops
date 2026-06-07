# DL-057 — UX dinâmica em Participantes + Caracterização

## Status
- ✅ Concluído em 2026-03-14
- 🔗 Decision Log: [`docs/copilot/13-decision-log.md#dl-057`](../../13-decision-log.md#dl-057)

## Objetivo
Simplificar a experiência de preenchimento no formulário de criação de manifesto, removendo o fluxo manual de `Buscar + Select` e adotando um único campo pesquisável com filtragem dinâmica.

## Escopo implementado
- Participantes do manifesto:
  - Transportador
  - Destinador
- Caracterização do resíduo:
  - Unidade
  - Resíduo
  - Tratamento
  - Classe
  - Estado físico
  - Acondicionamento

## Arquivos principais
- `frontend/src/components/FilterableDropdown.vue`
- `frontend/src/components/ManifestCreateForm.vue`
- `docs/copilot/13-decision-log.md`
- `docs/copilot/14-estrutura-copilot.md`

## Resultado
A seleção ficou mais fluida e rápida, com busca automática por digitação para parceiros e filtro local imediato para catálogos.
