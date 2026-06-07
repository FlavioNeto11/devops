# DL-067 — Grid de manifestos + contas CETESB + navegação de datas

## Overview
Este handoff consolida correções operacionais em três frentes: visualização da grid de manifestos, robustez da tela de seleção de contas CETESB e consistência da navegação do intervalo de datas nos filtros.

## Escopo
- Frontend: `frontend/src/views/ManifestsView.vue`, `frontend/src/views/CetesbAccountSelectionView.vue`, `frontend/src/stores/auth.js`, `frontend/src/services/api.js`
- Backend: `src/repositories/sicat-cetesb-account-repo.js`, `src/services/sicat-account-service.js`, `src/routes/api-routes.js`
- Contrato: `openapi/mtr_automacao_openapi_interna.yaml`, `src/generated/operations.js`

## Objetivos
- Evitar quebra da grid quando código interno de manifesto for longo.
- Corrigir exibição/atualização de dados de conta CETESB (tipo e último uso).
- Adicionar remoção de conta CETESB salva.
- Tornar feedback de atualização de contas salvo visível ao operador.
- Sincronizar navegação `Data inicial` e `Data final` quando houver cruzamento de intervalo.

## Status
✅ Concluído em 2026-03-14.

## Referências
- `docs/copilot/13-decision-log.md#dl-067`
- `docs/copilot/14-estrutura-copilot.md`
