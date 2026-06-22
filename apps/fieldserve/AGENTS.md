# FieldServe — fronteiras de operação

App **gerado pela Forge 2.0** (prova). Fronteiras gerais: [`../../AGENTS.md`](../../AGENTS.md).

## Seguras (autônomas)
- Editar `api/src/**`, `mock-central/**`, `test/**`.
- Build local (`docker build`) + `node test/integration.mjs`.

## Com aprovação
- `kubectl apply -f k8s/` (recurso vivo); rebuild + recriar pods.
- Mudar o Secret `fieldserve-db`.

## Proibidas
- HTTP externo fora de `api/src/gateways/` (quebra o bloco `gateway-externo`).
- SQL em `routes/` (quebra `camadas-rigidas`) — SQL só em `repositories/`.
- Segredo em git (`fieldserve-db` é criado fora do git).

## Blast-radius
`apps/fieldserve/**`. ServiceMonitor/PrometheusRule ficam aqui (não em `platform/**`).
