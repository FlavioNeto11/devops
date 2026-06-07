# Technical Decisions - DL-070

## Decisão 1: colapso persistente apenas em desktop
- **Escolha:** manter colapso da sidebar para largura >= 1200px e manter drawer para mobile.
- **Motivo:** preservar UX mobile já estável e reduzir risco de regressão.

## Decisão 2: tema via tokens
- **Escolha:** aplicar dark mode por `data-theme='dark'` com override em `tokens.css`.
- **Motivo:** centraliza paleta e evita duplicação de estilos por componente.

## Decisão 3: contexto de usuário no topo direito
- **Escolha:** mover ações de sessão para o topo direito com dropdown.
- **Motivo:** melhora discoverability e mantém ações críticas sempre visíveis.

## Decisão 4: exibir conta CETESB ativa junto ao usuário
- **Escolha:** mostrar `partnerName/partnerCode` da conta ativa no trigger e no dropdown.
- **Motivo:** reduz ambiguidade operacional em cenários de múltiplas contas.
