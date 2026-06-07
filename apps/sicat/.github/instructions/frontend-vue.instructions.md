---
applyTo: "frontend/**/*.{vue,js,ts,css,scss},apps/frontend/**/*.{vue,js,ts,css,scss},src/frontend/**/*.{vue,js,ts,css,scss}"
---
## Instruções para frontend Vue + UX

- Use Vue com componentes coesos, nomes semânticos e baixa duplicação.
- Separe claramente apresentação, estado e acesso HTTP.
- Priorize layout responsivo mobile-first e consistência de spacing/tipografia.
- Trate estados de loading, erro, vazio e sucesso em fluxos de dados.
- Aplique acessibilidade mínima: contraste adequado, foco visível, labels e suporte a teclado.
- Centralize chamadas API em serviços reutilizáveis, evitando `fetch` espalhado em componentes.
- Preserve rastreabilidade com `X-Correlation-Id` quando o fluxo frontend consumir endpoints observáveis.
- Se a UI exigir mudança de contrato, atualize OpenAPI, examples e validações em conjunto com backend.
- Quando alteração impactar arquitetura operacional, atualize `docs/copilot/` com decisão técnica.
