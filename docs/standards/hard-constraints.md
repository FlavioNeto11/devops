---
title: "Regras Inegociáveis (HARD)"
status: canonical
applies_to: [platform]
updated: 2026-06-09
language: pt-BR
---

# Regras Inegociáveis (HARD)

> Lista única do que **nunca** pode ser quebrado nesta plataforma. Ignorar qualquer item aqui
> derruba roteamento, GitOps, observabilidade ou segurança. Este doc **consolida e aponta** —
> o detalhe completo de cada regra vive na fonte indicada (não duplicamos conteúdo).
>
> Para agentes: leia este arquivo **antes** de gerar/editar manifests, `devops.yaml`, Dockerfiles
> ou qualquer coisa em `platform/` e `k8s/`.

## 1. Contrato de labels — HARD

Todo recurso de uma app leva os labels canônicos; o DevOps Console agrupa por
`app.kubernetes.io/part-of`. Mudar/omitir isso quebra as abas **Apps/Publicações/Health**.

```yaml
labels:
  app.kubernetes.io/name: <app>-<service>
  app.kubernetes.io/component: frontend|api|worker|db|cache
  app.kubernetes.io/part-of: <app>          # HARD — chave de agrupamento do Console
  app.kubernetes.io/managed-by: devops-platform
```

Fonte: [`infra-standards.md` §2](./infra-standards.md).

## 2. Regra de ouro do roteamento — HARD

| Tipo | `stripPrefix` | `priority` | Como serve |
|---|---|---|---|
| **frontend** | `false` | menor (ex.: 10) | build com base path `/<app>/` (`VITE_BASE_PATH`); nginx serve sob o subpath |
| **api** | `true` | maior (ex.: 30) | Middleware remove `<basePath>+<path>` completo; processo vê rotas na raiz |
| **api2** | `true` | **maior que api** (ex.: 40) | `/<app>/api2` é prefixado por `/<app>/api` → precisa vencer |
| **worker** | n/a | n/a | `expose: false`, sem rota HTTP |

- **Frontend NUNCA faz strip.** **API/api2/worker-health SEMPRE fazem strip.**
- **Conflito de prefixo:** `api2 > api > frontend` na `priority`, senão o prefixo do frontend
  "engole" as chamadas de API.

Fonte: [`path-routing-pattern.md`](../path-routing-pattern.md), [`infra-standards.md` §3](./infra-standards.md).

## 3. Segredos — HARD

- **Nada secreto em git.** Apenas `*.example` com placeholders + **SealedSecret** (cifrado) versionado.
- Secret real é criado **fora do git** e **excluído do `kustomization.yaml`** para o Argo
  (`prune: true`) nunca apagá-lo.
- Nunca colocar segredo em `env` do `devops.yaml` nem em ConfigMap.

Fonte: [`infra-standards.md` §7](./infra-standards.md), [`../../SECURITY.md`](../../SECURITY.md).

## 4. GitOps / Argo é a fonte da verdade — HARD

- `platform/argocd/apps/*` e todo `k8s/` são sincronizados pelo Argo (`prune: true` + `selfHeal: true`).
- **Nunca** mude `metadata.name` ou labels de um recurso **vivo** sem planejar a recriação — o Argo
  apaga o antigo e cria o novo (downtime/perda de estado).
- Toda unidade implantável tem uma Argo Application em `platform/argocd/apps/<app>.yaml`.

Fonte: [`infra-standards.md` §8](./infra-standards.md), [`../deployment-flow.md`](../deployment-flow.md).

## 5. Imagens — HARD (convenção)

- **Lab:** `<app>-<service>:local` + `imagePullPolicy: IfNotPresent` (sem registry).
- **CI/CD:** `ghcr.io/flavioneto11/<app>/<service>:<tag>` (owner **minúsculo**; tag = SHA + branch + `latest`).
- Dockerfile sempre **multi-stage**, runtime **non-root** (`USER node`), sem segredo em camada.

Fonte: [`infra-standards.md` §6](./infra-standards.md), [`../../ARCHITECTURE.md`](../../ARCHITECTURE.md).

## 6. Recursos — HARD

- Todo container declara `requests` **e** `limits` (sem isso, o scheduler e os SLOs quebram).

Fonte: [`non-functional-requirements.md` §1](./non-functional-requirements.md).

## 7. Ambiente desta máquina — HARD

- Host é **Windows Server**; toda automação é **PowerShell 7**, idempotente, caminhos `C:\...`.
- **Nunca force-kill o Docker Desktop** (deixa sockets AF_UNIX órfãos → crash no boot). Recuperação:
  `scripts/recover-docker.ps1`.
- `docker desktop restart` pode **travar em "stopping"** nesta máquina — recupere com `recover-docker.ps1`.

Fonte: [`../../TROUBLESHOOTING.md`](../../TROUBLESHOOTING.md) (seção 13), `~/.claude/CLAUDE.md`.

---
_Referências: [`infra-standards.md`](./infra-standards.md) · [`non-functional-requirements.md`](./non-functional-requirements.md) · [`golden-path.md`](./golden-path.md) · [`../path-routing-pattern.md`](../path-routing-pattern.md)._
