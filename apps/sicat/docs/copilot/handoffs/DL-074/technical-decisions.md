# Technical Decisions - DL-074

## Fatos
- O comportamento anterior permitia rolagem global da página autenticada.
- Isso reduzia persistência visual da navegação em páginas mais longas.

## Decisão 1: travar shell na viewport
- **Escolha:** usar `height: 100dvh` e `overflow: hidden` em `.sicat-shell`.
- **Motivo:** concentrar rolagem no conteúdo útil e preservar contexto de navegação.
- **Impacto:** topbar/sidebar estáveis durante uso contínuo.

## Decisão 2: sidebar com rolagem independente
- **Escolha:** `position: sticky`, `top: 0`, `height: 100dvh` e `overflow-y: auto` na sidebar desktop.
- **Motivo:** manter menu acessível e robusto caso itens aumentem.
- **Impacto:** navegação lateral permanece usável sem deslocar a tela inteira.

## Decisão 3: conteúdo como único scroller principal
- **Escolha:** rolagem em `.sicat-page` com `overflow-y: auto` e containers com `min-height: 0`.
- **Motivo:** previsibilidade de interação e leitura.
- **Impacto:** comportamento alinhado ao requisito de “scroll apenas no conteúdo”.
