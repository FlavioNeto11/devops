# DL-028: E2E com stack real

**Status:** ✅ COMPLETADO  
**Data:** 2026-03-09  
**Objetivo:** Executar o próximo item do roadmap (E2E com stack real CETESB)

## Resultado
- E2E real principal executado com sucesso: **5/5 passing**.
- Stack real validado (`API + Worker + Postgres`).
- Worker destravado de erro fatal por constraint em jobs legados.
- Teste real estabilizado para cenário CETESB com 404 em listagem.

## Referências
- Decision Log: [DL-028](../../13-decision-log.md#dl-028)
- Teste E2E real: `tests/smoke/manifest-real-integration.test.js`
- Estrutura: `docs/copilot/14-estrutura-copilot.md`
