# Technical Decisions — DL-057

## 1) Componente reutilizável para seleção pesquisável
**Decisão:** criar `FilterableDropdown.vue` ao invés de duplicar lógica por campo.

**Motivo:**
- Reduz duplicação de comportamento (input, lista filtrada, seleção, estados de loading/vazio).
- Facilita manutenção e evolução de UX para novos campos.

## 2) Busca de parceiros por digitação com debounce
**Decisão:** substituir botão explícito de busca por disparo automático ao digitar (`350ms`, mínimo 2 caracteres).

**Motivo:**
- Reduz cliques e alternância de foco.
- Mantém controle de custo de chamadas à API com debounce.

## 3) Filtro local para catálogos carregados
**Decisão:** manter carregamento de catálogos como está e filtrar localmente no novo dropdown pesquisável.

**Motivo:**
- Catálogos já são carregados na entrada da tela.
- Filtro local dá resposta imediata sem chamadas adicionais.

## 4) Preservação de contrato e payload
**Decisão:** não alterar contrato backend nem shape de payload de criação/submissão.

**Motivo:**
- Mudança é estritamente de UX/composição de input.
- Reduz risco de regressão em integrações existentes.
