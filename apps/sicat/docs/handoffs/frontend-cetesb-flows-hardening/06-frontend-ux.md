# 06 - Frontend UX

## Objective

Registrar a rodada final de hardening frontend para remover ruído editorial remanescente no composable dos fluxos operacionais CETESB sem alterar comportamento funcional.

## Files Analyzed

- `frontend/src/composables/useCetesbOperationalFlows.js`
- `frontend/package.json`
- `docs/handoffs/frontend-cetesb-flows-hardening/09-qa-validation.md`

## Decisions

- manter a mudanca estritamente localizada no ponto sinalizado pelo editor;
- substituir `String#replace()` por `String#replaceAll()` apenas na sanitizacao global do documento do gerador, preservando o regex global e o resultado produzido;
- nao expandir o escopo para refactors adicionais porque o fluxo ja estava funcionalmente estabilizado.

## Files Changed

- `frontend/src/composables/useCetesbOperationalFlows.js`
- `docs/handoffs/frontend-cetesb-flows-hardening/06-frontend-ux.md`

## Validations

- `get_errors` no arquivo `frontend/src/composables/useCetesbOperationalFlows.js` para confirmar o warning original;
- `npm run build` em `frontend/` para validar que a alteracao continua compilando.

## Handoff

- proximo owner recomendado para continuidade formal da trilha: `tester-qa-mtr`;
- escopo restante, se necessario: apenas revalidacao leve do fluxo apos o saneamento editorial.
