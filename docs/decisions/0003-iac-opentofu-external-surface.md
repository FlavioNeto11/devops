---
title: "ADR 0003 — IaC: OpenTofu para a superfície externa; Helm+Argo permanece dono do in-cluster"
status: canonical
applies_to: [platform]
updated: 2026-07-02
language: pt-BR
---

# ADR 0003 — IaC: OpenTofu para a superfície externa; Helm+Argo permanece dono do in-cluster

**Estado:** Aceito · **Data:** 2026-07-02 · **Escopo:** `platform/iac/`, `platform/dns/`, workflows `iac-plan`/`iac-apply` (fase B3 do plano "Forja 4.0")

## Contexto

Tudo que roda **dentro** do cluster já é declarativo e reconciliado: Helm + Argo CD
(`platform/*`, `apps/*/k8s`), com `prune`/`selfHeal` e fronteiras claras no `AGENTS.md`.
Mas a **superfície externa** da plataforma vivia fora de qualquer controle declarativo:

- o **DNS público** (`dev.nvit.com.br` → CNAME `<tunnel>.cfargotunnel.com` na Cloudflare)
  foi criado imperativamente por `cloudflared tunnel route dns` (via
  `scripts/install-cloudflare-tunnel.ps1`) — sem versão, sem diff, sem PR;
- as **configurações do repositório GitHub** de que a esteira depende (labels
  `requirement`, `claude-generated`, `gpt-approved`, `forge`, `planning`) eram criadas
  "na mão" por `gh label create` espalhado em três workflows, com cores/descrições
  divergentes entre si;
- o **túnel** Cloudflare é CLI-managed (config em `C:\cloudflared\config.yml`), invisível
  ao repo.

Qualquer mudança nessa superfície é justamente a mais perigosa (exposição na internet)
e a menos rastreável. A revisão adversarial da Forja 4.0 fixou a fronteira: IaC **só**
para o que está **fora** do cluster; nada de um segundo dono para o in-cluster.

## Decisão

Adotar **OpenTofu** (fork open-source do Terraform, licença MPL-2.0) **já**, com módulo
raiz em `platform/iac/`, gerenciando **somente recursos externos**:

1. **Cloudflare DNS** (provider `cloudflare/cloudflare` ~> 5): registros declarados na
   interface amigável `platform/dns/domains.yaml` (yamldecode + for_each). Estado inicial
   = exatamente o registro existente (CNAME proxied de `dev.nvit.com.br`), **importado**
   (`tofu import`) para o plan tender a zero — nada é recriado.
2. **GitHub repo settings de baixo risco** (provider `integrations/github` ~> 6): os
   labels da esteira ganham dono declarativo único. Branch protection fica **comentada**
   (exemplo) — só com pedido explícito do operador.
3. **Túnel**: permanece CLI-managed e **fora** do IaC; a migração para remotely-managed
   (pré-requisito para `cloudflare_zero_trust_tunnel_cloudflared_config`) está avaliada e
   documentada (runbook no `platform/iac/README.md`), não executada — o Zero Trust exige
   cartão e a migração é one-way sobre o túnel vivo.
4. **Backend de estado**: backend `kubernetes` (Secret `tfstate-default-platform-iac` no
   namespace dedicado `devops-iac`) — sem serviço novo, estado fora do git.
5. **Operação**: `iac-plan.yml` valida/planeja em PR (fail-soft se o OpenTofu não estiver
   no runner; plan real só se o secret `CLOUDFLARE_API_TOKEN` existir); `iac-apply.yml` é
   **manual** (`workflow_dispatch` + confirmação + environment) — exposição externa segue
   sendo operação **com aprovação** (`AGENTS.md` §5/§6) e **nunca** é acionada pela Forja.

**Fronteira HARD:** proibido usar providers `kubernetes`/`helm` neste módulo para
recursos de app/plataforma. O Argo continua sendo a única verdade do in-cluster
(`hard-constraints.md` §4); o backend usa a API do k8s apenas como storage de estado.

## Alternativas consideradas

- **Terraform (HashiCorp)**: rejeitado — licença BUSL e o repo evita ferramentas com
  risco/atrito de licenciamento; OpenTofu é drop-in para este escopo.
- **Continuar imperativo (scripts + painel)**: rejeitado — sem diff/PR/rastreabilidade
  exatamente na superfície mais sensível; foi o gatilho desta fase.
- **Crossplane / controllers no cluster**: rejeitado — traria os recursos externos para
  dentro do modelo GitOps do cluster, mas com custo operacional alto (controllers,
  CRDs, credenciais vivas no cluster) desproporcional a um homelab de operador único.
- **Tofu também para o in-cluster (provider kubernetes/helm)**: rejeitado na revisão
  adversarial — dois donos reconciliando os mesmos recursos (Argo selfHeal × tofu)
  gera fight/drift permanente.

## Consequências

**Positivas:** superfície externa versionada, com diff em PR e import do estado real
(mudança de DNS agora passa por git + aprovação explícita); labels da esteira com fonte
única (acaba a divergência entre workflows); caminho pavimentado para a nuvem real
(novos providers entram no mesmo módulo/fluxo); estado seguro (Secret no cluster,
não em git).

**Negativas / trade-offs:** mais uma ferramenta na máquina (instalação manual/winget;
CI fail-soft até lá); o import inicial é passo manual documentado; o túnel continua
fora do IaC até o operador aprovar a migração (aceito conscientemente); `domains.yaml`
introduz uma convenção própria (sentinela `@tunnel`) que precisa ser conhecida —
mitigada por comentários no próprio arquivo.

**Gatilhos futuros (revisitar este ADR):**
- adoção de **cloud real** (VMs/DNS/objeto/e-mail): ampliar o módulo (novos providers)
  mantendo a mesma fronteira e o fluxo plan-em-PR/apply-manual;
- migração do túnel para remotely-managed → ativar `tunnel.tf`;
- necessidade de branch protection → descomentar o exemplo com aval do operador;
- se o repositório sair do GitHub ou o DNS sair da Cloudflare, o módulo é o inventário
  do que precisa ser recriado.
