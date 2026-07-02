# forge-pilot-v2 — fixture do contrato devops.yaml v2

Produto-exemplo **descartável** que valida o pipeline `schema -> devops-compile -> manifests` (Forja 4.0, fase B1).
Não tem código de app, imagem, Application do Argo nem deploy — apenas `devops.yaml` (v2) e os manifests renderizados em `k8s/` (commitados, gerados — não editar à mão).
Recompilar: `node specs/tools/devops-compile.mjs apps/forge-pilot-v2/devops.yaml` (checar drift: `--check`).
Referência do contrato v2: `docs/new-project-contract.md` (seção "Contrato v2") + `schema/devops-schema.json`.
