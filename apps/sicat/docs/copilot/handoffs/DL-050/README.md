# DL-050 - Status de manifesto e ressincronização resiliente

## Contexto
Foi reportada inconsistência operacional no fluxo de manifestos:
- manifesto aparecia como **Sucesso** na listagem mesmo sem confirmação completa da CETESB;
- botão de ressincronizar falhava com erro `500` da CETESB (`pesquisaManifesto`);
- manifestos antigos (ex.: cancelados em dias anteriores) não apareciam por causa de filtro padrão restrito ao dia atual.

## Objetivo
Eliminar falso positivo de sucesso, aumentar resiliência da ressincronização e evitar ocultação de itens por filtro padrão excessivo.

## Entregas
- Backend worker: ajuste de status no submit quando CETESB ainda não retorna `manCodigo/manNumero`.
- Backend service: fallback local para falha 5xx CETESB também em `forceSync=true`.
- Frontend store: remoção de data padrão fixa (`hoje`) na listagem de manifestos.

## Arquivos alterados
- `src/workers/operation-handlers.js`
- `src/services/manifest-service.js`
- `frontend/src/stores/manifests.js`
- `docs/copilot/13-decision-log.md`
- `docs/copilot/14-estrutura-copilot.md`

## Resultado esperado
- Manifesto recém-submetido sem referência externa resolvida não é exibido como sucesso prematuramente.
- Ressincronização não quebra UX ao receber 500 da CETESB.
- Listagem inicial não oculta manifestos antigos por filtro rígido de data.
