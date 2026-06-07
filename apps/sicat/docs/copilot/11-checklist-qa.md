# Checklist de QA

## Fatos já validados na trilha atual

### Backend/Gateway (DL-040)
- ✅ `cancelManifest` com fallback de autenticação por header (`x-access-token`, `Authorization`, `both`) em `src/gateways/cetesb-gateway.js`.
- ✅ Refresh forçado em `401/403` com tentativa de recuperação de sessão.
- ✅ Cobertura unitária ajustada em `tests/unit/cetesb-gateway.test.js`.

### Worker/Persistência (DL-039)
- ✅ Resultado de jobs finalizados persistido na entidade de origem (`manifests`, `cadastros`, `catalog_sync_requests`).
- ✅ Fluxo worker validado na suíte direcionada (`npm run test:worker`).

### Frontend (DL-041)
- ✅ Build frontend válido após refinamento multi-view (`cd frontend && npm run build`).
- ✅ Consistência visual aplicada em `ManifestCreateForm` + views operacionais MTR.

## Smoke mínimo operacional (atual)
- ✅ criar `session context`
- ✅ criar manifesto
- ✅ enfileirar submit
- ✅ consultar job até finalizar
- ✅ consultar auditoria
- 🔄 enfileirar print + validar download do documento
- 🔄 enfileirar cancel em cenário de sessão degradada
- 🔄 sincronizar catálogo e validar lista persistida

## Regressão obrigatória por mudança recente

### R1) Cancelamento CETESB com auth resiliente
- [ ] Simular `401/403` na primeira tentativa e confirmar retry com refresh de sessão.
- [ ] Confirmar erro explícito `SESSION_CONTEXT_REFRESH_CREDENTIALS_MISSING` quando credenciais não existirem.
- [ ] Verificar que falha definitiva retorna `application/problem+json` com correlação (`X-Correlation-Id`).

### R2) Persistência de retorno em jobs finalizados
- [ ] Validar `manifest.submit` gravando `jobResults['manifest.submit']` em `manifests.payload`.
- [ ] Validar `manifest.print` gravando metadados/URL em `jobResults['manifest.print']`.
- [ ] Validar `manifest.cancel` gravando resumo em `jobResults['manifest.cancel']`.
- [ ] Validar `catalog.sync` atualizando `catalog_sync_requests.catalogs`.

### R3) Consistência visual multi-view (frontend)
- [ ] Verificar responsividade em `ManifestCreateView`, `ManifestsView`, `ManifestDetailView`, `JobsView`, `DashboardView`, `SessionAccountView`.
- [ ] Verificar estados de `loading`, erro e sucesso sem quebra de layout.
- [ ] Verificar foco visível e legibilidade de campos/botões principais.

## Cenários negativos prioritários
- [ ] Token expirado sem material para refresh (erro definitivo e rastreável).
- [ ] Falha externa CETESB com classificação correta (retryável vs definitiva).
- [ ] Job excedendo tentativas e encaminhamento para `dlq`.
- [ ] Request inválido sem campos obrigatórios retornando `problem+json` consistente.

## Evidências e artefatos de apoio
- `tests/unit/cetesb-gateway.test.js`
- `tests/README.md`
- `tests/fixtures/`
- `docs/copilot/04-fluxos-operacionais.md`
- `docs/copilot/13-decision-log.md`
