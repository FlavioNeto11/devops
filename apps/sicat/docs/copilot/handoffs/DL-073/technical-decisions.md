# Technical Decisions - DL-073

## Decisão 1: retry apenas para operações idempotentes
- **Escolha:** aplicar retry automático somente em `GET/HEAD/OPTIONS`.
- **Motivo:** evitar duplicação de efeitos colaterais em operações mutáveis.
- **Impacto:** maior robustez sem comprometer consistência de escrita.

## Decisão 2: acessibilidade como requisito de shell
- **Escolha:** adicionar ARIA, `skip link` e interação por teclado (`Esc`) no layout principal.
- **Motivo:** reduzir fricção de navegação e melhorar suporte a teclado/leitores.
- **Impacto:** navegação mais previsível e inclusiva em desktop/mobile.

## Decisão 3: explicitar estados de observabilidade no dashboard
- **Escolha:** padronizar mensagens e estados `loading/erro/vazio` com ação de retry.
- **Motivo:** evitar ambiguidade operacional em cenários sem dados ou com falha de rede.
- **Impacto:** melhora de confiabilidade percebida e diagnóstico rápido pelo operador.
