---
title: "Golden Path — a \"estrada pavimentada\" para um app novo"
status: canonical
applies_to: [platform]
updated: 2026-06-09
language: pt-BR
---

# Golden Path — a "estrada pavimentada" para um app novo

> O caminho **padrão e mais curto** do zero ao app rodando na plataforma. Seguir o golden path
> = ganhar roteamento, observabilidade, GitOps, CI e segurança "de graça". Desviar é permitido,
> mas vira sua responsabilidade manter os padrões ([infra](./infra-standards.md), [NFR](./non-functional-requirements.md)).

## Visão em uma linha

```
devops.yaml  →  new-app.ps1  →  app-template (Helm) / k8s  →  build :local / CI (GHCR)  →  Argo Application
```

## Passo a passo

### 1. Declarar o contrato `devops.yaml` (raiz do app)
Fonte da verdade do app. Schema completo em [`new-project-contract.md`](../new-project-contract.md). Mínimo:

```yaml
app: { name: meuapp, namespace: apps, host: xpto.localhost, basePath: /meuapp }
services:
  frontend: { type: frontend, path: /,     port: 80,   expose: true, stripPrefix: false, priority: 10 }
  api:      { type: api,      path: /api,   port: 8080, expose: true, stripPrefix: true,  priority: 30, health: { path: /health } }
```

### 2. Scaffolding
`C:\devops\scripts\new-app.ps1 -Name meuapp -Services frontend,api[,api2,worker]` gera
Dockerfiles, `k8s/`, workflow e a **Application do Argo**. (App já existente: escreva o `devops.yaml`
à mão e siga.)

### 3. Manifests k8s
- **Recomendado**: Helm `templates/app-template` parametrizado por `values` derivados do `devops.yaml`.
- **Alternativa**: manifests diretos em `k8s/` (padrão atual do SICAT; em migração para o chart — F2.F).
- Respeite o [contrato de labels](./infra-standards.md#2-contrato-de-labels-e-anotações--hard) e a
  [regra de ouro de roteamento](./infra-standards.md#3-roteamento-regra-de-ouro--hard).

### 4. Imagens
- **Lab (rápido)**: `docker build -t meuapp-<svc>:local ...` + `kubectl apply -f k8s\` (ou `scripts/publish-app.ps1 -App meuapp`).
- **CI/CD (GHCR)**: copie o pipeline reutilizável (ver §6); o runner self-hosted faz build→push→deploy.

### 5. SSO (se o app tem login)
Integração **aditiva** via `@flavioneto11/oidc-kit` (padrão SICAT: valida no `/userinfo` + emite
a sessão do app; botão PKCE no frontend). Crie o client OIDC no realm `nvit` e guarde o secret via
Sealed Secrets. Ver [`sso-keycloak.md`](../sso-keycloak.md).

### 6. CI reutilizável
Use os workflows de `templates/github-actions/` (`app-pipeline-template.yaml` → `discover` lê o
`devops.yaml`, `build` faz matriz por serviço → GHCR, `deploy` no runner). Detalhes:
[`github-runner-setup.md`](../github-runner-setup.md) e [`deployment-flow.md`](../deployment-flow.md).

### 7. GitOps
Crie `platform/argocd/apps/meuapp.yaml` (Application apontando para os manifests do app) e commite.
O app-of-apps `devops-platform` descobre e sincroniza (`prune`+`selfHeal`).

### 8. Validar
- `http://xpto.localhost/meuapp` e `http://xpto.localhost/meuapp/api/health`.
- Console `/devops`: abas **Apps / Publicações / Health / Logs** (a aba **Apps** lê o cluster ao vivo
  pelo label `app.kubernetes.io/part-of` — o app aparece sozinho quando os pods sobem).

### 9. Registrar o app na plataforma — **OBRIGATÓRIO** (Console + Portal + Argo)

Criar **ou importar** um projeto **não termina** quando o portal sobe. Além do build, o app precisa ser
registrado em **todas** estas superfícies. Só a aba **Apps** do Console é automática (lê o cluster ao
vivo); as demais são **curadas** e exigem edição:

| # | Superfície | Onde editar | O que fazer |
|---|---|---|---|
| 1 | **Projetos & Tarefas** (`/devops`) | `console/pm-api/scripts/seed.js` (`PROJECTS` + `ITEMS`) | Cadastrar o projeto (`key`, `name`, `app_type` — `cms_portal`\|`product_software`\|`platform_tool` —, `stack`, `repo_url`, `route`, `k8s_label_selector`, `status`, `description`) e os itens do board. Rebuild `console-pm:local` + `kubectl rollout restart deploy/pm-api -n devops-system` (re-seed idempotente por `key`). Portal **só de conteúdo** (CMS) pode nascer direto pelo Console (Conteúdo → Novo portal) — ver [`../cms.md`](../cms.md). |
| 2 | **Argo CD** | `platform/argocd/apps/<app>.yaml` | A Application precisa estar na **`main`** — o app-of-apps `devops-platform` (recurse, `targetRevision: main`) só enxerga o que está lá. |
| 3 | **Domínio raiz** `dev.nvit.com.br/` | `portal/frontend/index.html` | Adicionar o card do app em `#produtos` (lista **curada**, não dinâmica), atualizar o stat de "plataformas" e o link do rodapé. Rebuild `portal-frontend:local` + `kubectl rollout restart deploy/portal -n devops-system`. |
| 4 | **Compartilhados** (`/devops`) | `console/pm-api/src/data/shared-resources.json` | Adicionar o app como `consumer` dos recursos que ele usa (mínimo: `templates/app-template (Helm)` e `Contrato devops.yaml`). Rebuild `console-pm:local` (JSON embutido na imagem). |
| 5 | **Recursos do Console** (`/devops`) | (automático) | Garantir o label `app.kubernetes.io/part-of: <app>` em **todo** recurso — a aba **Apps** agrupa por ele ao vivo. |

> No lab, `dev.nvit.com.br` aponta para `127.0.0.1`: rebuildar as imagens `:local` (`console-pm`,
> `portal`) + `kubectl rollout restart`, **e** commitar/mergear na `main` (Argo adota o app), cobre tudo.

## Bibliotecas compartilhadas
Reúso entre apps (IA gpt-5, OIDC/sessão) vem de pacotes versionados `@flavioneto11/*` — ver
[`shared-libraries-and-versioning.md`](./shared-libraries-and-versioning.md).

---
_Referências: [`new-project-contract.md`](../new-project-contract.md) · [`project-onboarding-checklist.md`](../project-onboarding-checklist.md) · [infra-standards](./infra-standards.md) · [NFR](./non-functional-requirements.md)._
