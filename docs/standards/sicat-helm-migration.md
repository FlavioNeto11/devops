---
title: "Migração do SICAT para o `app-template` (Helm) — caminho documentado"
status: guide
applies_to: [platform]
updated: 2026-06-09
language: pt-BR
---

# Migração do SICAT para o `app-template` (Helm) — caminho documentado

> **Status: opcional / não executada.** Decisão de engenharia: o SICAT roda hoje com manifests
> **manuais** (`apps/sicat/k8s/*`) que **já seguem os padrões** ([infra-standards](./infra-standards.md))
> e estão sob Argo (`platform/argocd/apps/sicat.yaml`, `prune+selfHeal`). Migrá-los para o chart
> `templates/app-template` é **consistência cosmética** com **risco real** (o `prune` do Argo
> apagaria/recriaria recursos se o render do chart divergir minimamente dos nomes/labels atuais),
> por valor baixo. A padronização (golden-path, contrato, chart para apps novos) já está entregue.
> Por isso **mantemos os manifests manuais** e deixamos esta migração como passo deliberado futuro.

## Gap: o que o `app-template` precisa cobrir para o SICAT
Os manifests do SICAT usam recursos que o chart genérico ainda não parametriza:
1. `envFrom: secretRef` (ex.: `sicat-config`) — variáveis em massa de um Secret.
2. `env` de um **2º Secret** (ex.: `DATABASE_URL` do `sicat-db`).
3. **PVC** montado (`sicat-storage`) — volume persistente.
4. **Volume de ConfigMap** (`sicat-certs`).
5. `strategy: Recreate` (em vez de RollingUpdate).
6. **Override de command** no worker (mesma imagem da api, `npm run worker`).
7. Exclusão dos Sealed Secrets do source do Argo (para o `prune` nunca apagá-los).

> Esses viram **keys opcionais** no `values.yaml` do chart (ignoradas por apps que não as usam).

## Procedimento seguro (quando for migrar)
1. Estender `templates/app-template/templates/*` com as keys opcionais acima (aditivo).
2. Escrever `apps/sicat/values.local.yaml` reproduzindo o estado atual.
3. **Gate de diff semântico**: `helm template apps/sicat templates/app-template -f values.local.yaml`
   vs os manifests vivos — **iguais** em nomes, labels, portas, strip/prioridade, probes, resources,
   volumes. NUNCA mudar `metadata.name`/labels (senão o Argo prune apaga o antigo).
4. Manter `apps/sicat/k8s/` como source do Argo (gerado pelo chart), preservando a exclusão dos
   Sealed Secrets no `kustomization.yaml`.
5. Validar `/sicat` + `/sicat/api/health` + abas do Console; manter os manifests antigos no histórico
   do git para rollback imediato.

## Recomendação
Migrar **apenas** quando houver ganho concreto (ex.: padronizar vários apps no chart de uma vez).
Para um único app já estável, o custo/risco não compensa. **GymOps** (manifests também manuais)
segue a mesma orientação.

> **Greenfield já usa o chart.** Apps **novos** entram pelo `app-template` desde o
> [golden-path](./golden-path.md) (`scripts/new-app.ps1`) — então o "enabler" da padronização Helm
> **já existe** para o caminho novo. Esta migração trata só do **retrofit** de `sicat`/`gymops`, que
> permanece **opt-in** e fora de execução automática (mexer em recurso vivo sob Argo é operação com
> aprovação — ver [`hard-constraints.md` §4](./hard-constraints.md)).

---
_Referências: [`golden-path.md`](./golden-path.md) · [`infra-standards.md`](./infra-standards.md) · [`runbooks/rollback.md`](../runbooks/rollback.md)._
