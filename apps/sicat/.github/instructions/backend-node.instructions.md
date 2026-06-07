---
applyTo: "src/**/*.ts,src/**/*.js,scripts/**/*.js"
excludeAgent:
  - documentador-mtr
---
## Instruções para backend Node.js/TypeScript

- Todo código novo em `src/` deve ser **TypeScript** (`.ts`). Exceção: `src/gateways/cetesb-gateway.js` permanece JS por razão arquitetural registrada em DL-093.
- Runtime de desenvolvimento: `tsx`. Não usar `node` diretamente para arquivos `.ts`.
- Build de produção: `npm run build:ts` gera `dist/` com declarations e source maps.
- Verificar tipagem: `npm run typecheck` deve passar com zero erros.
- Preserve o estilo ESM já adotado no projeto (`type: module`, imports com `.js` mesmo para `.ts` — convenção NodeNext).
- Prefira módulos coesos e funções pequenas.
- Evite misturar transformação de payload, I/O externo e persistência na mesma função.
- Se uma rota crescer, extraia a regra para `services/`.
- Se um `service` começar a manipular SQL ou `pool` diretamente, mova para `repositories/`.
- Sempre propague `correlationId` e contexto operacional.
- Ao criar utilitário novo, coloque em `src/lib/` apenas se ele for realmente genérico.
- Respeite o contrato dos exemplos em `examples/`.
- Quando alterar comportamento, atualize `docs/copilot/` se a decisão impactar arquitetura, fluxo ou operação.
