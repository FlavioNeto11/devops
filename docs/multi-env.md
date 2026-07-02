---
title: "Multi-env opt-in e efêmero por produto (contrato v2 + devops-compile --env)"
status: canonical
applies_to: [platform]
updated: 2026-07-02
language: pt-BR
---

# Multi-env — ambiente `dev` OPT-IN e EFÊMERO por produto

> **Forja 4.0, fase B2.** Um produto no contrato v2 pode declarar um ambiente `dev` isolado
> (namespace `apps-dev`, host próprio) e materializá-lo **sob demanda**, por git, com o mesmo
> compilador do contrato ([`../specs/tools/devops-compile.mjs`](../specs/tools/devops-compile.mjs)).
> Multi-env **não é padrão**: é decisão por produto, com ciclo de vida curto
> (criar → usar → destruir). Contrato v2: [`new-project-contract.md`](./new-project-contract.md) §11.

---

## 1. Princípios (decisões de revisão adversarial — inegociáveis)

| # | Regra | Por quê |
|---|---|---|
| 1 | **`dev.nvit.com.br` NUNCA é reatribuído.** É o host de **produção vivo**: as IngressRoutes de todos os apps, o issuer do Keycloak, a URL do Argo CD e o túnel Cloudflare apontam para ele. O env dev usa host **NOVO**: `dev-lab.nvit.localhost` (local). O compilador **falha** se um env declarar `dev.nvit.com.br` ou o `app.host` de produção. | Reatribuir sequestraria rotas vivas e quebraria SSO/GitOps/túnel. |
| 2 | **Opt-in por produto.** NÃO criar env dev para os produtos existentes; um env só nasce quando um produto específico precisa dele. `apps-prod-local` **não** entra neste fluxo. | Capacidade (ver §2) e ruído operacional. |
| 3 | **Efêmero.** O env é descartável: PVCs/dados do dev somem no destroy. Nada de longa duração em `apps-dev`. | Nó único; dev não é ambiente de estado. |
| 4 | **Tudo por git.** Criar/destruir env = commitar/remover a Application do Argo. **Nunca** `kubectl apply` manual em recurso vivo (o `selfHeal` do Argo reverte). | GitOps é a verdade ([`standards/hard-constraints.md`](./standards/hard-constraints.md) §4). |

## 2. Teto de capacidade (nó único) — por que efêmero

O cluster é o Kubernetes do Docker Desktop em **um único nó**: **~110 pods allocatable**, dos
quais **~80 já estão em uso** pela plataforma + apps de produção. Um env dev da fixture
(frontend + api + worker + postgres + redis) custa **5 pods**; a folga real comporta só um
punhado de envs **simultâneos**. Por isso multi-env é opt-in e efêmero: crie, valide, destrua.
Antes de criar um env, confira a folga: `kubectl get pods -A --no-headers | measure`.

## 3. Como declarar (contrato v2)

No `devops.yaml` (`version: 2`), o mapa `environments` declara o destino físico de cada
ambiente lógico. O `local` documenta o destino **default** (produção — compilado SEM `--env`);
o `dev` é o env efêmero:

```yaml
environments:
  local:
    namespace: apps
    hosts: [nvit.localhost, dev.nvit.com.br]   # default/produção — compile SEM --env
  dev:
    namespace: apps-dev                        # namespace já existente (platform/namespaces)
    hosts: [dev-lab.nvit.localhost]            # host NOVO do env — nunca os de produção
```

Invariantes que o compilador **impõe** (fail-closed):

- o namespace do env é **diferente** do namespace default do app (os nomes dos recursos são
  **idênticos** entre envs — o namespace é o isolamento; sem sufixo `-dev` nos nomes);
- os hosts do env **nunca** incluem `dev.nvit.com.br` nem o `app.host` de produção;
- `basePath` é o **mesmo** em todos os envs (mesmo layout de paths).

## 4. Como compilar (`--env dev`)

```powershell
node specs/tools/devops-compile.mjs apps/<produto>/devops.yaml            # produção -> k8s/
node specs/tools/devops-compile.mjs apps/<produto>/devops.yaml --env dev  # env dev  -> k8s-dev/
node specs/tools/devops-compile.mjs apps/<produto>/devops.yaml --env dev --check  # drift
```

O artefato do env vai para `apps/<produto>/k8s-dev/` (separado do `k8s/` de produção) e é
**commitado** (artefato primário do GitOps, igual ao de produção). Diferenças em relação ao
render default: namespace `apps-dev`, cláusula `Host(...)` com **exatamente** os hosts do env,
e o label extra **`devops.flavioneto/environment: dev`** em todo recurso (além dos labels
canônicos `part-of` etc., que ficam iguais). Fixture de referência:
[`../apps/forge-pilot-v2/`](../apps/forge-pilot-v2/) (`devops.yaml` + `k8s/` + `k8s-dev/`).

## 5. Ciclo de vida: criar → usar → destruir

### 5.1 Criar (commit da Application)

1. Compile e commite `apps/<produto>/k8s-dev/` (ver §4).
2. Copie [`../platform/argocd/apps/forge-pilot-v2-dev.yaml.example`](../platform/argocd/apps/forge-pilot-v2-dev.yaml.example)
   para `platform/argocd/apps/<produto>-dev.yaml` (nome da Application com sufixo **`-dev`** —
   todas as Applications vivem no namespace `argocd`; sem o sufixo colidiria com a de produção),
   ajuste `metadata.name` e `spec.source.path`, e commite na `main` → o app-of-apps aplica.
3. Crie os **Secrets do env** imperativamente **em `apps-dev`** (fora do git, como em produção):
   `kubectl -n apps-dev create secret generic <produto>-db ...` — os manifests só referenciam.
4. Builde as imagens `:local` (mesmas tags de produção — `IfNotPresent` resolve no daemon local).
5. Acesso local: adicione `127.0.0.1 dev-lab.nvit.localhost` ao arquivo `hosts` (ao dar append,
   garanta newline antes — senão gruda na última linha; ver [`local-domain-setup.md`](./local-domain-setup.md)).

### 5.2 Usar

- `http://dev-lab.nvit.localhost/<produto>` e `http://dev-lab.nvit.localhost/<produto>/api/health`
  (mesmo `basePath`/layout de paths de produção — só o host e o namespace mudam).

### 5.3 Destruir (por git)

1. Remova `platform/argocd/apps/<produto>-dev.yaml` (commit na `main`) → o `prune` do
   app-of-apps + finalizer apagam a Application e **todos** os recursos do env, incluindo PVCs
   (dados do dev são descartáveis por definição).
2. Limpe os Secrets imperativos que sobram: `kubectl -n apps-dev delete secret <produto>-db ...`.
3. (Opcional) remova `apps/<produto>/k8s-dev/` do git se o env não for recriado em breve — o
   `devops.yaml` continua declarando `environments.dev` (regenerável a qualquer momento).

> O namespace `apps-dev` **permanece** (é da plataforma, [`../platform/namespaces/namespaces.yaml`](../platform/namespaces/namespaces.yaml));
> só os recursos do produto saem. Conferir sobras: `kubectl -n apps-dev get all,pvc,secret -l app.kubernetes.io/part-of=<produto>`.

## 6. Promoção dev → prod

O env dev valida mudanças **antes** de produção. Dois caminhos, ambos por PR:

1. **Regen do compile (preferido):** a mudança vive no `devops.yaml` (env novo, dependência,
   rota, recurso). Rode o compile **sem** `--env` e commite o `k8s/` regenerado no mesmo PR que
   já validou o `k8s-dev/` — os dois artefatos saem do **mesmo contrato**, então não há drift
   semântico entre envs.
2. **Cópia cirúrgica:** quando a mudança foi um ajuste manual testado no dev (caso raro — os
   manifests são gerados), reproduza-a no **contrato** (`devops.yaml`) e recompile ambos os
   envs; nunca edite `k8s/`/`k8s-dev/` à mão (headers "NÃO EDITE À MÃO").

Em ambos, o merge na `main` faz o Argo sincronizar produção; o env dev pode ser destruído em
seguida (§5.3).

## 7. Host público futuro (`dev-lab.<domínio>`) — via platform/iac

`dev-lab.nvit.localhost` só resolve na máquina local. Um `dev-lab.<domínio público>` (ex.:
`dev-lab.nvit.com.br`) exigiria **entrada DNS + rota no túnel Cloudflare**, e a superfície
externa é gerenciada por IaC ([`../platform/iac/`](../platform/iac/), OpenTofu — ADR
[`decisions/0003-iac-opentofu-external-surface.md`](./decisions/0003-iac-opentofu-external-surface.md),
PR #177): registro em `dns.tf` + ingress do túnel em `tunnel.tf`, via `iac-plan`/`iac-apply`.
**Não** editar DNS/túnel à mão. Exposição externa é operação **com aprovação**
([`../AGENTS.md`](../AGENTS.md) §5) — hoje o env dev é local-only por decisão.

## 8. Console e env-awareness (nota — follow-up)

O DevOps Console (Apps/Publicações/Health) agrupa por `app.kubernetes.io/part-of` em **todos os
namespaces**: com um env dev vivo, produção e dev do mesmo produto aparecem **juntos** (misturados)
nas abas. A separação visual por ambiente (usando o label `devops.flavioneto/environment` que os
manifests do env já carregam) é **follow-up** — não implementada nesta fase.

---
_Referências: [`new-project-contract.md`](./new-project-contract.md) §11 ·
[`standards/hard-constraints.md`](./standards/hard-constraints.md) ·
[`../schema/devops-schema.json`](../schema/devops-schema.json) ·
fixture [`../apps/forge-pilot-v2/`](../apps/forge-pilot-v2/) ·
testes `specs/tools/devops-compile.test.mjs`._
