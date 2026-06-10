---
title: "Padrões de Infraestrutura — Plataforma DevOps Local"
status: canonical
applies_to: [platform]
updated: 2026-06-09
language: pt-BR
---

# Padrões de Infraestrutura — Plataforma DevOps Local

> Regras **operacionais** derivadas dos [NFR](./non-functional-requirements.md). O que é HARD
> (quebra a plataforma se ignorado) está marcado. O resto é default sensato.

## 1. Namespaces

| Namespace | Uso |
|---|---|
| `apps` | apps de negócio (default) |
| `apps-dev` / `apps-prod-local` | trilhas dev / prod-local |
| `devops-system` | Console + portal + módulo PM |
| `traefik` | ingress + middlewares compartilhados (`compress`, `secure-headers`) |
| `argocd` | GitOps |
| `observability` | Prometheus/Grafana/Loki |
| `identity` | Keycloak |
| `kube-system` | Sealed Secrets controller |

## 2. Contrato de labels e anotações — **HARD**

O DevOps Console agrupa e cruza recursos por estes campos. **Todo recurso** de uma app leva:

```yaml
labels:
  app.kubernetes.io/name: <app>-<service>
  app.kubernetes.io/component: frontend|api|worker|db|cache
  app.kubernetes.io/part-of: <app>        # HARD — o Console agrupa a aba "Apps" por isto
  app.kubernetes.io/managed-by: devops-platform
```

Deployments publicados via CI levam anotações de publicação (aba **Publicações** do Console):

```yaml
annotations:
  devops.flavioneto/commitSha: <sha>
  devops.flavioneto/branch: <branch>
  devops.flavioneto/imageTag: <tag>
  devops.flavioneto/deployedAt: <iso8601>
  devops.flavioneto/runId: <ci-run>
  devops.flavioneto/image: <image-ref>
```

## 3. Roteamento (regra de ouro) — **HARD**

- **Frontend**: `stripPrefix: false`, build com base path `/<app>/`, IngressRoute **priority menor**.
- **API/api2/worker-health**: `stripPrefix: true` (Middleware StripPrefix remove `<basePath>+<path>`
  completo), **priority maior**.
- Conflito de prefixo: `/<app>/api2` é prefixado por `/<app>/api` → **api2 priority > api**
  (ex.: api2=40, api=30, frontend=10). Detalhe em [`path-routing-pattern.md`](../path-routing-pattern.md).

## 4. Recursos, quotas e limites

- **HARD**: todo container declara `requests` **e** `limits` (tabela em [NFR §1](./non-functional-requirements.md)).
- `ResourceQuota` e `LimitRange` por namespace: **opt-in** (lab não precisa; documentado para prod).
- `PodDisruptionBudget`: noop em `replicas: 1` (lab). Obrigatório só ao subir para HA.

## 5. NetworkPolicy

- Default-deny por namespace + allow explícito app→seu-db: **opt-in** no lab (documentado para prod).
- Quando ativar: a app só fala com seu Postgres/Redis e com o ingress; nada lateral.

## 6. Imagens

- **Lab**: `<app>-<service>:local` + `imagePullPolicy: IfNotPresent` (sem registry).
- **CI/CD**: `ghcr.io/flavioneto11/<app>/<service>:<tag>` (owner minúsculo; tag = SHA + branch + `latest`).
- Sempre **multi-stage**; runtime non-root; sem segredo em camada (BuildKit `--secret` quando preciso).

## 7. Segredos — **HARD**

- Nada secreto em git. `*.example` com placeholders + **SealedSecret** versionado (cifrado).
- Secret real: criado fora do git e **excluído do `kustomization.yaml`** para o Argo `prune:true`
  nunca apagá-lo. Padrão: `sealed-sicat-config`, `sealed-sicat-db`, `gymops-config`.

## 8. GitOps

- Toda unidade implantável tem uma **Argo Application** em `platform/argocd/apps/<app>.yaml`
  (descoberta pelo app-of-apps `devops-platform`).
- `prune: true` + `selfHeal: true`. Nunca mude `metadata.name`/labels de um recurso vivo sem
  planejar a recriação (o Argo apaga o antigo).

---
_Referências: [NFR](./non-functional-requirements.md), [`golden-path.md`](./golden-path.md), [`path-routing-pattern.md`](../path-routing-pattern.md)._
