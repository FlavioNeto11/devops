# forge-pilot-v2 — fixture do contrato devops.yaml v2

Produto-exemplo **descartável** que valida o pipeline `schema -> devops-compile -> manifests` (Forja 4.0, fases B1 e B2).
Não tem código de app, imagem, Application do Argo nem deploy — apenas `devops.yaml` (v2) e os manifests renderizados (commitados, gerados — não editar à mão):

- `k8s/` — destino default (produção): `node specs/tools/devops-compile.mjs apps/forge-pilot-v2/devops.yaml` (drift: `--check`).
- `k8s-dev/` — ambiente **dev opt-in/efêmero** (namespace `apps-dev`, host `dev-lab.nvit.localhost`, label `devops.flavioneto/environment: dev`): `node specs/tools/devops-compile.mjs apps/forge-pilot-v2/devops.yaml --env dev` (drift: `--env dev --check`). Ciclo criar → usar → destruir: `docs/multi-env.md`; Application de exemplo: `platform/argocd/apps/forge-pilot-v2-dev.yaml.example` (não viva).

Referência do contrato v2: `docs/new-project-contract.md` (seção "Contrato v2") + `schema/devops-schema.json`.
