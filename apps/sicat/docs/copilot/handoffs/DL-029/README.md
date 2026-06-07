# DL-029: Modo real como padrão em todo o sistema

**Status:** ✅ COMPLETADO  
**Data:** 2026-03-09  
**Objetivo:** Alterar configuração padrão para modo real, mantendo modo mock opcional

## Resultado
- Default alterado de `mock` para `real` em `src/lib/config.js`
- Modo mock ainda disponível via `CETESB_GATEWAY_MODE=mock`
- README.md atualizado com nova documentação
- OpenAPI validado com sucesso (182 arquivos, 0 problemas)

## Referências
- Decision Log: [DL-029](../../13-decision-log.md#dl-029)
- Config: `src/lib/config.js` (linha 42)
- Documentação: `README.md` (seção "Variáveis principais de configuração")
