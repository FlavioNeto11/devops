# Expor a plataforma na internet com Cloudflare Tunnel (nvit.io / nvit.com.br)

Guia para publicar a plataforma DevOps local (cluster do Docker Desktop) nos dominios
reais **`nvit.io`** (principal) e **`nvit.com.br`** (redireciona para o principal), usando
**Cloudflare Tunnel** — **gratis**, **sem abrir portas/firewall**, funciona atras de NAT e
com **HTTPS automatico**.

> Pre-requisito ja feito: as IngressRoutes do Traefik aceitam o host `nvit.io`
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
                                                      IngressRoute (Host nvit.io + PathPrefix)
                                                                      v
                                                   console / aplicacao1 / grafana / argocd ...
```

- O **TLS publico** (`https://nvit.io`) e terminado na **Cloudflare** (Universal SSL).
- O **`cloudflared`** roda como **servico Windows** nesta maquina e cria um tunnel de saida
  ate a Cloudflare — por isso **nao precisa abrir portas** nem ter IP publico.
- A Cloudflare encaminha o trafego do hostname para `http://localhost:80` (Traefik), que faz
  o roteamento por path normalmente.

---

## Passo 1 — Adicionar os dominios na Cloudflare (e trocar os nameservers na Hostinger)

1. Crie uma conta **gratis** em <https://dash.cloudflare.com> (se ainda nao tiver).
2. **Add a site** → digite `nvit.io` → plano **Free**. A Cloudflare **importa** os registros
   DNS atuais (confira se o que ja existe — e-mail, etc. — foi importado).
3. A Cloudflare mostra **2 nameservers** (ex.: `xxx.ns.cloudflare.com`). Copie-os.
4. Na **Hostinger**: *Dominios → (nvit.io) Gerenciar → DNS / Nameservers →* troque para
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
| (vazio)   | `nvit.io` | HTTP | `localhost:80`   |
| `*`       | `nvit.io` | HTTP | `localhost:80`   | (opcional, p/ subdominios futuros)

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
https://nvit.io/devops
https://nvit.io/aplicacao1
https://nvit.io/aplicacao1/api/health
https://nvit.io/grafana
```

---

## Passo 5 — Redirecionar `nvit.com.br` → `nvit.io`

Opcao recomendada (no edge, sem tocar no cluster): **Redirect Rule** da Cloudflare.

1. Cloudflare → dominio **`nvit.com.br`** → **Rules → Redirect Rules → Create rule**.
2. *When incoming requests match:* `Hostname equals nvit.com.br` (ou "All incoming requests").
3. *Then:* **Dynamic** redirect → Expression:
   `concat("https://nvit.io", http.request.uri.path)` → Status **301**, *Preserve query string*.
4. Deploy.

(Alternativa: adicionar `nvit.com.br` como Public Hostname do tunnel apontando para
`localhost:80` e deixar o Traefik redirecionar — mais trabalhoso; a Redirect Rule e mais simples.)

---

## HTTPS / SSL

- **Universal SSL** (gratis) cobre `https://nvit.io` automaticamente.
- Em **SSL/TLS → Overview**, deixe o modo em **Full** (o tunnel ja protege o trecho ate a
  origem). Opcional: **Edge Certificates → Always Use HTTPS = On**.
- O Traefik continua em HTTP interno (entrypoint `web`); nao precisa de certificado local.

---

## Trocar o dominio depois (ou usar outro)

As rotas internas sao parametrizadas: para trocar o host primario, rode

```powershell
.\scripts\set-domain.ps1 -PrimaryHost <novo.dominio> -OldHost nvit.io
git -C C:/devops add -A; git -C C:/devops commit -m "chore: dominio <novo>"; git -C C:/devops push
.\scripts\set-domain.ps1 -PrimaryHost <novo.dominio> -ApplyOnly
```

E ajuste os Public Hostnames do tunnel (Passo 3) para o novo dominio.

---

## Troubleshooting

- **`https://nvit.io` nao abre**: confirme o dominio **Active** na Cloudflare (nameservers
  propagados) e o `Get-Service cloudflared` = **Running**. Veja logs:
  `Get-Content "$env:ProgramData\Cloudflare\cloudflared\cloudflared.log" -Tail 50` (ou os
  logs do servico em *Event Viewer*).
- **502/523 (origem indisponivel)**: o Traefik precisa estar de pe em `localhost:80`
  (`kubectl get pods -n traefik`) e o Public Hostname apontando para `localhost:80`.
- **404 na app**: a rota interna precisa aceitar o host. Rode `set-domain.ps1` (Passo 0) e
  confira no Console: <https://nvit.io/devops>.
- **Tunnel "Down" no painel**: reinstale o conector: `.\scripts\install-cloudflare-tunnel.ps1 -Uninstall` e depois com o token de novo.
- **Reverter**: `.\scripts\install-cloudflare-tunnel.ps1 -Uninstall` remove o servico; o
  acesso local por `xpto.localhost` continua funcionando.
