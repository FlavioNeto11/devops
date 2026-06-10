---
title: "Expor a plataforma na internet com Cloudflare Tunnel (dev.nvit.com.br / nvit.com.br)"
status: guide
applies_to: [platform]
updated: 2026-06-09
language: pt-BR
---

# Expor a plataforma na internet com Cloudflare Tunnel (dev.nvit.com.br / nvit.com.br)

Guia para publicar a plataforma DevOps local (cluster do Docker Desktop) nos dominios
reais **`dev.nvit.com.br`** (principal) e **`nvit.com.br`** (redireciona para o principal), usando
**Cloudflare Tunnel** — **gratis**, **sem abrir portas/firewall**, funciona atras de NAT e
com **HTTPS automatico**.

> Pre-requisito ja feito: as IngressRoutes do Traefik aceitam o host `dev.nvit.com.br`
> (via [`set-domain.ps1`](../scripts/set-domain.ps1)). O `xpto.localhost` continua valendo
> para dev local.

---

## Como funciona

```
   navegador  --HTTPS-->  Cloudflare (edge, TLS)  --tunnel-->  cloudflared (servico Windows)
                                                                      |
                                                                      v
                                                            Traefik (localhost:80)
                                                                      |
                                                      IngressRoute (Host dev.nvit.com.br + PathPrefix)
                                                                      v
                                                   console / aplicacao1 / grafana / argocd ...
```

- O **TLS publico** (`https://dev.nvit.com.br`) e terminado na **Cloudflare** (Universal SSL).
- O **`cloudflared`** roda como **servico Windows** nesta maquina e cria um tunnel de saida
  ate a Cloudflare — por isso **nao precisa abrir portas** nem ter IP publico.
- A Cloudflare encaminha o trafego do hostname para `http://localhost:80` (Traefik), que faz
  o roteamento por path normalmente.

---

## ⭐ Caminho A (recomendado, SEM cartao) — tunnel pela CLI

O painel **Zero Trust** exige cartao mesmo no Free (e as vezes da erro no pagamento). O
tunnel **CLI-managed** **nao** usa o Zero Trust e **nao pede cartao**. Pre-requisito: o
dominio ja **Active** na Cloudflare (Passo 1 abaixo — voce ja fez).

```powershell
# 1) Autenticar (abre o navegador; escolha o dominio dev.nvit.com.br; SEM cartao)
cloudflared tunnel login

# 2) Criar tunnel + config + rota DNS + servico (faz tudo)
cd C:\devops
.\scripts\install-cloudflare-tunnel.ps1 -Cli -TunnelDomain dev.nvit.com.br

# 3) Validar (apos o DNS propagar)
#    https://dev.nvit.com.br/devops    https://dev.nvit.com.br/aplicacao1
```

O script cria o tunnel `nvit-local`, grava `C:\cloudflared\config.yml`
(ingress `dev.nvit.com.br -> http://localhost:80`), cria o CNAME `dev.nvit.com.br -> <id>.cfargotunnel.com`
e instala o servico Windows. Se o servico nao subir, rode em 1o plano para testar:
`cloudflared --config C:\cloudflared\config.yml tunnel run nvit-local`.

> HTTPS continua automatico (Universal SSL). Redirect `nvit.com.br -> dev.nvit.com.br`: ver Passo 5.
> Os Passos 2–4 abaixo sao o **Caminho B (painel/Zero Trust)** — so use se preferir o token
> (exige cartao).

---

## Passo 1 — Adicionar os dominios na Cloudflare (e trocar os nameservers na Hostinger)

1. Crie uma conta **gratis** em <https://dash.cloudflare.com> (se ainda nao tiver).
2. **Add a site** → digite `dev.nvit.com.br` → plano **Free**. A Cloudflare **importa** os registros
   DNS atuais (confira se o que ja existe — e-mail, etc. — foi importado).
3. A Cloudflare mostra **2 nameservers** (ex.: `xxx.ns.cloudflare.com`). Copie-os.
4. Na **Hostinger**: *Dominios → (dev.nvit.com.br) Gerenciar → DNS / Nameservers →* troque para
   **nameservers personalizados** e cole os 2 da Cloudflare. Salve.
5. Repita os passos 2–4 para **`nvit.com.br`**.

> A propagacao dos nameservers leva de minutos a algumas horas. A Cloudflare envia e-mail
> quando o dominio ficar **Active**. So siga adiante quando estiver Active.

> Atencao: trocar nameservers move TODO o DNS do dominio para a Cloudflare. Garanta que os
> registros de e-mail/sites existentes foram importados (passo 2) para nao perder servicos.

---

## Passo 2 — Criar o Tunnel e pegar o token

1. Cloudflare → **Zero Trust** → **Networks → Tunnels** → **Create a tunnel**.
2. Tipo **Cloudflared** → nome `nvit-local` → **Save**.
3. Na tela **Install connector**, selecione **Windows**. **Copie o TOKEN** (a string longa
   que comeca com `eyJ...`, logo apos `service install` no comando exibido).

---

## Passo 3 — Mapear os Public Hostnames (no painel do tunnel)

Na aba **Public Hostnames** do tunnel, clique **Add a public hostname**:

| Subdomain | Domain    | Type | URL              |
|-----------|-----------|------|------------------|
| (vazio)   | `dev.nvit.com.br` | HTTP | `localhost:80`   |
| `*`       | `dev.nvit.com.br` | HTTP | `localhost:80`   | (opcional, p/ subdominios futuros)

> Use **HTTP** e `localhost:80` (o Traefik). O HTTPS publico e da Cloudflare; o tunnel ja e
> criptografado.

---

## Passo 4 — Instalar o conector nesta maquina

Em **PowerShell 7 como Administrador**:

```powershell
cd C:/devops
.\scripts\install-cloudflare-tunnel.ps1 -TunnelToken <COLE_O_TOKEN_eyJ...>
```

O script instala o `cloudflared` (via winget, se faltar) e registra o **servico Windows** do
conector. Confira:

```powershell
Get-Service cloudflared
```

Valide (apos o dominio ficar Active e o servico rodando):

```text
https://dev.nvit.com.br/devops
https://dev.nvit.com.br/aplicacao1
https://dev.nvit.com.br/aplicacao1/api/health
https://dev.nvit.com.br/grafana
```

---

## Passo 5 — Redirecionar `nvit.com.br` → `dev.nvit.com.br`

Opcao recomendada (no edge, sem tocar no cluster): **Redirect Rule** da Cloudflare.

1. Cloudflare → dominio **`nvit.com.br`** → **Rules → Redirect Rules → Create rule**.
2. *When incoming requests match:* `Hostname equals nvit.com.br` (ou "All incoming requests").
3. *Then:* **Dynamic** redirect → Expression:
   `concat("https://dev.nvit.com.br", http.request.uri.path)` → Status **301**, *Preserve query string*.
4. Deploy.

(Alternativa: adicionar `nvit.com.br` como Public Hostname do tunnel apontando para
`localhost:80` e deixar o Traefik redirecionar — mais trabalhoso; a Redirect Rule e mais simples.)

---

## HTTPS / SSL

- **Universal SSL** (gratis) cobre `https://dev.nvit.com.br` automaticamente.
- Em **SSL/TLS → Overview**, deixe o modo em **Full** (o tunnel ja protege o trecho ate a
  origem). Opcional: **Edge Certificates → Always Use HTTPS = On**.
- O Traefik continua em HTTP interno (entrypoint `web`); nao precisa de certificado local.

---

## Trocar o dominio depois (ou usar outro)

As rotas internas sao parametrizadas: para trocar o host primario, rode

```powershell
.\scripts\set-domain.ps1 -PrimaryHost <novo.dominio> -OldHost dev.nvit.com.br
git -C C:/devops add -A; git -C C:/devops commit -m "chore: dominio <novo>"; git -C C:/devops push
.\scripts\set-domain.ps1 -PrimaryHost <novo.dominio> -ApplyOnly
```

E ajuste os Public Hostnames do tunnel (Passo 3) para o novo dominio.

---

## Troubleshooting

- **`https://dev.nvit.com.br` nao abre**: confirme o dominio **Active** na Cloudflare (nameservers
  propagados) e o `Get-Service cloudflared` = **Running**. Veja logs:
  `Get-Content "$env:ProgramData\Cloudflare\cloudflared\cloudflared.log" -Tail 50` (ou os
  logs do servico em *Event Viewer*).
- **502/523 (origem indisponivel)**: o Traefik precisa estar de pe em `localhost:80`
  (`kubectl get pods -n traefik`) e o Public Hostname apontando para `localhost:80`.
- **404 na app**: a rota interna precisa aceitar o host. Rode `set-domain.ps1` (Passo 0) e
  confira no Console: <https://dev.nvit.com.br/devops>.
- **Tunnel "Down" no painel**: reinstale o conector: `.\scripts\install-cloudflare-tunnel.ps1 -Uninstall` e depois com o token de novo.
- **Reverter**: `.\scripts\install-cloudflare-tunnel.ps1 -Uninstall` remove o servico; o
  acesso local por `xpto.localhost` continua funcionando.
