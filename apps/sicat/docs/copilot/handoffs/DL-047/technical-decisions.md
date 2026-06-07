# Technical Decisions — DL-047

## 1) Cobertura de fallback em ambos os caminhos
**Decisão:** manter fallback no `searchManifests` e adicionar o mesmo no `lookupManifestByHash`.

**Motivo:** chamadas operacionais usam ambos os caminhos; corrigir só um mantinha falhas intermitentes para contas já salvas.

## 2) Trigger de fallback restrito a HTTP 500
**Decisão:** fallback apenas para erro remoto `500`.

**Motivo:** evitar mascarar outros erros (ex.: autenticação inválida, contratos quebrados) e manter diagnóstico claro.

## 3) Ordem de tentativa preservada
**Decisão:** tentar `all` primeiro e usar `0` apenas como contingência.

**Motivo:** compatibilidade com comportamento existente e redução de impacto funcional.
