---
name: onboard-app
description: Onboarda/scaffolda um app novo na plataforma DevOps local pelo golden path (devops.yaml + scripts/new-app.ps1 + manifests k8s + Application do Argo). Use quando o pedido for criar, scaffoldar, registrar ou publicar um app/serviço novo (frontend/api/api2/worker) neste monorepo.
argument-hint: "<nome-do-app> [frontend,api,api2,worker]"
---

# Onboard de app novo (golden path)

Fluxo padrão do zero ao app no ar. Fonte canônica: `docs/standards/golden-path.md` e
`scripts/new-app.ps1`. Contrato: `docs/new-project-contract.md` + `schema/devops-schema.json`.
Fronteiras de operação: `AGENTS.md` §5 (gerar scaffold é seguro; aplicar no cluster pede aprovação).

## Regras de ouro (não quebrar)

- **frontend**: `expose: true`, `stripPrefix: false`, priority MENOR (build com base path `/<app>/`).
- **api/api2/worker-health**: `expose: true`, `stripPrefix: true`, priority MAIOR.
- **`api2 > api > frontend`** em priority (`/<app>/api2` é prefixado por `/<app>/api`).
- Todo recurso leva o label `app.kubernetes.io/part-of: <app>`.
- Lab: imagens `:local` + `imagePullPolicy: IfNotPresent`. CI: GHCR `ghcr.io/flavioneto11/<app>/<svc>`.
- Segredos NUNCA em plaintext: use `.env.example` / Sealed Secrets.

## Passos

1. **Confirmar o contrato** com o operador: nome do app, `basePath` (default `/<app>`), namespace
   (default `apps`), host (`xpto.localhost`) e a lista de serviços.
2. **Gerar o scaffold** (operação segura — não toca no cluster). Sugira ao operador rodar:
   ```powershell
   C:\devops\scripts\new-app.ps1 -Name <app> -Services frontend,api,api2,worker
   ```
   O script gera `devops.yaml`, `Dockerfile` por serviço, `k8s/<app>.yaml`
   (Deployments + Services + Middlewares StripPrefix + IngressRoute com priorities corretas),
   `.github/workflows/ci-cd.yaml` e `platform/argocd/apps/<app>.yaml` (Application do Argo).
3. **Revisar o `devops.yaml`** gerado contra `schema/devops-schema.json` (tipos, paths, strip, priority).
4. **Build local + apply** — operação COM APROVAÇÃO do operador (muda estado do cluster). Mostre os
   comandos que o `new-app.ps1` imprime (`docker build -t <app>-<svc>:local ...` e `kubectl apply -f k8s\`),
   ou `scripts/publish-app.ps1 -App <app>`. NÃO execute sem confirmação.
5. **GitOps** — comitar `platform/argocd/apps/<app>.yaml` (e os manifests) para o app-of-apps
   `devops-platform` sincronizar. Commit/push só quando o operador pedir.
6. **Validar**: `http://xpto.localhost/<app>` e `http://xpto.localhost/<app>/api/health`; conferir
   no Console `/devops` (abas Apps / Publicações / Health / Logs).
7. **Registrar na plataforma — OBRIGATÓRIO** (ver `docs/standards/golden-path.md` §9). Criar/importar
   um app **não termina** no build — só a aba **Apps** é automática (label `part-of`). As demais são
   curadas:
   - **Projetos & Tarefas**: adicionar projeto + itens em `console/pm-api/scripts/seed.js`.
   - **Compartilhados**: adicionar o app como consumer em `console/pm-api/src/data/shared-resources.json`.
   - **Domínio raiz** `dev.nvit.com.br/`: card em `portal/frontend/index.html` (lista curada) + stat + rodapé.
   - **Argo**: a Application `platform/argocd/apps/<app>.yaml` precisa estar na **`main`**.
   - Aplicar (com aprovação): rebuild `console-pm:local` e `portal-frontend:local` + `kubectl rollout restart`.
8. **Atualizar docs** (AGENTS.md §7): `apps/README.md` + meta-doc do app.

## Atalhos

- App JÁ existente: escreva o `devops.yaml` à mão (schema acima) e siga do passo 3.
- SSO (login próprio): integração aditiva via `@flavioneto11/oidc-kit` (padrão SICAT) — ver
  `docs/sso-keycloak.md`. Não tocar outras auths.
