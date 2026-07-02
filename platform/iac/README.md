---
title: "IaC da Superfície Externa (OpenTofu)"
status: canonical
applies_to: [platform]
updated: 2026-07-02
language: pt-BR
---

# IaC da Superfície Externa — OpenTofu (`platform/iac/`)

> Módulo raiz OpenTofu que gerencia **somente recursos EXTERNOS** ao cluster:
> DNS público na Cloudflare (interface amigável em
> [`../dns/domains.yaml`](../dns/domains.yaml)) e configurações de baixo risco do
> repositório GitHub (labels da esteira). Decisão e fronteira: **ADR
> [0003](../../docs/decisions/0003-iac-opentofu-external-surface.md)**.

## ⚠️ Fronteira e aprovação (leia antes de qualquer apply)

- **Externo-only.** O in-cluster continua **100% Helm + Argo CD** — é **proibido**
  adicionar providers `kubernetes`/`helm` aqui para recursos de app
  ([`hard-constraints.md` §4](../../docs/standards/hard-constraints.md); o backend de
  estado usa a API do Kubernetes só para guardar um Secret, não gerencia recursos).
- **Toda exposição externa é operação COM APROVAÇÃO** ([`AGENTS.md` §5/§6](../../AGENTS.md)):
  alterar DNS público, túnel ou domínio **nunca é autônomo**. `tofu plan` é livre
  (read-only); `tofu apply` **só com aprovação do operador** — localmente pelo próprio
  operador ou pelo workflow **manual** [`iac-apply.yml`](../../.github/workflows/iac-apply.yml)
  (`workflow_dispatch` + confirmação digitada; **nunca** acionado pela Forja/esteira).
- **Nenhum segredo em git** ([`hard-constraints.md` §3](../../docs/standards/hard-constraints.md)):
  o API token entra **apenas por env** (`CLOUDFLARE_API_TOKEN`); `*.tfvars` é
  git-ignored; o `terraform.tfvars.example` só tem placeholders/valores não-secretos
  (account id e tunnel id **não** são segredos).

## O que é (e não é) gerenciado

| Recurso | Estado | Onde |
|---|---|---|
| CNAME `dev.nvit.com.br` → `<tunnel_id>.cfargotunnel.com` (proxied) | **gerenciado** (após import) | [`dns.tf`](./dns.tf) + [`../dns/domains.yaml`](../dns/domains.yaml) |
| Labels da esteira (`requirement`, `claude-generated`, `gpt-approved`, `forge`, `planning`) | **gerenciado** (após import; `planning` nasce no 1º apply) | [`github.tf`](./github.tf) |
| Config do túnel (`cloudflare_zero_trust_tunnel_cloudflared_config`) | **documentado, desativado** — exige migração (ver abaixo) | [`tunnel.tf`](./tunnel.tf) |
| Branch protection da `main` | **exemplo comentado** — só com pedido explícito do operador | [`github.tf`](./github.tf) |
| Zona `nvit.io` | **fora do escopo** (outra zona; declarar módulo próprio se adotada) | — |
| Qualquer recurso in-cluster | **NUNCA aqui** — Helm + Argo | [`../README.md`](../README.md) |

## Pré-requisitos

1. **OpenTofu** (não vem instalado; o CI é fail-soft até existir no runner):

   ```powershell
   winget install --id OpenTofu.Tofu -e     # ou: choco install opentofu
   # nova sessão? recarregue o PATH do processo:
   $env:Path = [Environment]::GetEnvironmentVariable('Path','Machine') + ';' + [Environment]::GetEnvironmentVariable('Path','User')
   tofu version
   ```

2. **Namespace do backend de estado** (uma vez; manifest versionado):

   ```powershell
   kubectl apply -f C:\devops\platform\namespaces\namespaces.yaml   # cria devops-iac (e os demais)
   ```

3. **Credenciais (só por env, nunca em git):**

   ```powershell
   # Cloudflare: token com escopos Zone.Zone:Read + Zone.DNS:Edit na zona nvit.com.br
   # (dash.cloudflare.com -> My Profile -> API Tokens -> Create Token)
   $env:CLOUDFLARE_API_TOKEN = '<token>'

   # GitHub: reusa a sessão do gh CLI
   $env:GITHUB_TOKEN = (gh auth token)
   ```

## Como rodar

```powershell
cd C:\devops\platform\iac
tofu init          # 1ª vez: gera .terraform.lock.hcl -> COMMITE o lock
tofu plan          # read-only; livre
tofu apply         # ⚠️ SÓ com aprovação do operador (AGENTS.md §5/§6)
```

> Sem credenciais dá para validar sintaxe: `tofu init -backend=false && tofu validate && tofu fmt -check`.

## Import inicial (para o plan tender a ZERO)

Os recursos **já existem** (DNS criado pelo `cloudflared tunnel route dns`; labels
criados pelos workflows). Importe-os para o estado antes do primeiro apply:

```powershell
cd C:\devops\platform\iac

# 1) IDs da zona e do registro DNS (o record_id vem da API):
$zone = (curl.exe -s -H "Authorization: Bearer $env:CLOUDFLARE_API_TOKEN" `
  "https://api.cloudflare.com/client/v4/zones?name=nvit.com.br" | ConvertFrom-Json).result[0].id
$rec = (curl.exe -s -H "Authorization: Bearer $env:CLOUDFLARE_API_TOKEN" `
  "https://api.cloudflare.com/client/v4/zones/$zone/dns_records?name=dev.nvit.com.br&type=CNAME" | ConvertFrom-Json).result[0].id

# 2) Import do CNAME existente (formato do ID: <zone_id>/<record_id>):
tofu import 'cloudflare_dns_record.managed["dev.nvit.com.br"]' "$zone/$rec"

# 3) Import dos labels existentes (formato: <repo>:<label>):
tofu import 'github_issue_label.pipeline["requirement"]' 'devops:requirement'
tofu import 'github_issue_label.pipeline["claude-generated"]' 'devops:claude-generated'
tofu import 'github_issue_label.pipeline["gpt-approved"]' 'devops:gpt-approved'
tofu import 'github_issue_label.pipeline["forge"]' 'devops:forge'

# 4) Conferir: deve tender a ZERO mudanças.
tofu plan
```

**Resultado esperado do plan pós-import:** `0 to change / 0 to destroy` nos itens
importados e **`+1 to add`** apenas para `github_issue_label.pipeline["planning"]`
(label que os workflows referenciam mas ainda não existe no repo — o 1º apply o cria).

## Backend de estado (Kubernetes)

O estado vive no Secret `tfstate-default-platform-iac` do namespace **`devops-iac`**
(cluster `docker-desktop`, kubeconfig `~/.kube/config` — ver [`backend.tf`](./backend.tf)).
Racional: sem serviço extra, sobrevive a re-clones do repo e fica fora do git.
**Cuidados:** o estado pode conter valores sensíveis — nunca exporte esse Secret;
ele **não** é gerenciado pelo Argo (namespace dedicado, sem Application apontando).

## Migração do túnel (CLI-managed → remotely-managed) — só documentado

Hoje o túnel `nvit-local` é **CLI-managed**: credencial + `config.yml` locais
(`C:\cloudflared\`), serviço Windows rodando `tunnel run`
([`scripts/install-cloudflare-tunnel.ps1 -Cli`](../../scripts/install-cloudflare-tunnel.ps1)).
Nesse modelo a Cloudflare **não** permite gerenciar o ingress via API/IaC — por isso
[`tunnel.tf`](./tunnel.tf) está **comentado**.

Runbook de migração (quando/se o operador aprovar — operação com aprovação):

1. **Pré-requisito/trade-off:** habilitar o **Zero Trust** na conta (exige **cartão de
   crédito** mesmo no Free — motivo pelo qual o CLI-managed foi escolhido; ver
   [`docs/cloudflare-tunnel-setup.md`](../../docs/cloudflare-tunnel-setup.md), "Caminho A").
2. No dash → Zero Trust → Networks → Tunnels: o túnel CLI-managed aparece listado;
   usar **Migrate** (a migração é **one-way**: a config sai do `config.yml` local e
   passa a viver no painel/API).
3. Reinstalar o conector **por token**:
   `.\scripts\install-cloudflare-tunnel.ps1 -Uninstall` e depois
   `.\scripts\install-cloudflare-tunnel.ps1 -TunnelToken <eyJ...>`.
4. Descomentar `cloudflare_zero_trust_tunnel_cloudflared_config` em
   [`tunnel.tf`](./tunnel.tf), preencher `cloudflare_account_id`, `tofu import` da
   config do túnel e `tofu plan` até tender a zero.
5. Aposentar o `config.yml` local (o ingress passa a ser 100% IaC) e atualizar
   [`docs/cloudflare-tunnel-setup.md`](../../docs/cloudflare-tunnel-setup.md).

**Riscos:** downtime curto na troca do conector; rollback = recriar o serviço
CLI-managed com o `config.yml` preservado. Enquanto a migração não acontecer, o
túnel segue fora do IaC e o **CNAME continua gerenciado** normalmente por
[`dns.tf`](./dns.tf) (o `tunnel_id` é só o alvo do CNAME).

## CI

| Workflow | Gatilho | O que faz |
|---|---|---|
| [`iac-plan.yml`](../../.github/workflows/iac-plan.yml) | PR tocando `platform/iac/**` ou `platform/dns/**` | `tofu fmt -check` + `init -backend=false` + `validate` (fail-soft com `::warning::` se o OpenTofu não estiver no runner). Se o secret `CLOUDFLARE_API_TOKEN` existir no repo, roda também `tofu plan` real (backend k8s via kubeconfig do runner) e comenta o resumo no PR; senão, pula com aviso claro. **Nunca aplica.** |
| [`iac-apply.yml`](../../.github/workflows/iac-apply.yml) | **`workflow_dispatch` manual** (environment `iac-apply` + digitar `apply`) | `tofu plan -out` + `apply` do plano. É a materialização do "com aprovação" — **nunca** acionado pela Forja/esteira. O operador pode endurecer adicionando *required reviewers* ao environment `iac-apply` nas settings do repo. |

## Segurança (resumo)

- `CLOUDFLARE_API_TOKEN`: só env local / secret do repo — **jamais** em arquivo versionado.
- `cloudflare_account_id` e `tunnel_id`: **não são segredos** (o CNAME alvo é
  observável e o UUID sozinho não dá acesso — a credencial do túnel é o JSON local).
- `.gitignore` local bloqueia `*.tfvars`, `.terraform/`, estado e planos.
- O secret-scan do repo (gitleaks) continua valendo para este diretório.

---
_Fronteiras: [`../../AGENTS.md`](../../AGENTS.md) · Decisão: [ADR 0003](../../docs/decisions/0003-iac-opentofu-external-surface.md) · Infra GitOps (in-cluster): [`../README.md`](../README.md)._
