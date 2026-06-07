# DL-018 — Alinhamento de payload de resíduos com catálogos CETESB

## Status
- **Decision Log:** `docs/copilot/13-decision-log.md` (`DL-018`)
- **Situação:** ✅ Concluído
- **Data:** 2026-03-09

## Escopo
Corrigir o submit real de manifesto para aderir ao HAR da CETESB em `docs/cetesb/mtr.cetesb.sp.gov.br_gerar_mtr.har`, focando em enriquecimento de catálogos de resíduos e resiliência pós-submit.

## Entregas
- Enrichment de resíduos implementado no gateway real.
- Conversão de catálogos para formato numérico esperado pela CETESB.
- Massa de teste real alinhada ao HAR (parceiros, quantidade e códigos).
- Lookup pós-submit resiliente a `404` sem derrubar submit bem-sucedido.

## Referências
- `src/gateways/cetesb-gateway.js`
- `test-mtr-fixed.js`
- `docs/copilot/validadores/cetesb/HAR-MISMATCH-CRITICO-CATALOGOS.md`
- `docs/copilot/13-decision-log.md` (`DL-018`)
