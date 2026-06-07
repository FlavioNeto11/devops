# Skill: CETESB Gateway Real

## Quando usar
Use esta skill ao trabalhar em autenticação, reutilização de token, chamadas reais para a CETESB, parsing de responses ou persistência de identificadores externos.

## Arquivos principais
- `src/gateways/cetesb-gateway.js`
- `src/services/session-context-service.js`
- `src/services/manifest-service.js`
- `src/services/catalog-service.js`
- `src/services/partner-service.js`
- `docs/copilot/07-integracao-cetesb.md`
- `docs/copilot/08-riscos-e-lacunas.md`

## Objetivos
- reduzir hipóteses frágeis de integração
- centralizar headers e comportamento HTTP
- melhorar rastreabilidade e fallback
- manter separação entre gateway e regras internas

## Checklist
1. confirme se a mudança é no gateway, serviço de sessão ou serviço de manifesto/catálogo/parceiro/cadastro
2. preserve configuração por env
3. documente diferença entre fato observado e inferência
4. persista `hash`, `manCodigo`, `manNumero` quando aplicável
5. revise `docs/copilot/07-integracao-cetesb.md` e `08-riscos-e-lacunas.md`

## Arquivos de apoio
- `notes.md`
- `payload-checklist.md`
