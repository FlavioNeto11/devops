---
title: "Configuracao de Dominio (Local e Real)"
status: guide
applies_to: [platform]
updated: 2026-06-09
language: pt-BR
---

# Configuracao de Dominio (Local e Real)

Este guia cobre como apontar os hosts da plataforma no **arquivo `hosts` do Windows** para
o ambiente **local** (`xpto.localhost`, `dev.nvit.com.br`, `traefik.localhost`) e como
preparar o **dominio real futuro** (`dev.nvit.com.br`): DNS (A/CNAME), firewall e port-forward
no roteador, alem das alternativas **Cloudflare Tunnel** e **ngrok**, e notas de **HTTPS**
(cert-manager/Let's Encrypt ou self-signed).

> Roteamento por path em [`path-routing-pattern.md`](./path-routing-pattern.md). Status do
> HTTPS em [`SECURITY.md`](../SECURITY.md) (secao 5).

---

## 1. Como funciona o acesso local

- O **Traefik** (namespace `traefik`) publica as portas **80** (`web`) e **443**
  (`websecure`) no host. No laboratorio usamos **HTTP/80**.
- O navegador precisa **resolver o host** (`xpto.localhost`, `dev.nvit.com.br`) para
  `127.0.0.1` (loopback), de modo que a requisicao chegue ao Traefik local.
- O Traefik usa o cabecalho **Host** + o **path** para rotear (veja a tabela de rotas em
  [`path-routing-pattern.md`](./path-routing-pattern.md)).

```
Navegador  --(resolve xpto.localhost -> 127.0.0.1)-->  Traefik (web:80)  -->  Service no cluster
```

---

## 2. Dominios `.localhost` geralmente ja resolvem

Por convencao (RFC 6761), nomes terminados em **`.localhost`** costumam resolver para
**`127.0.0.1`** automaticamente, sem editar o arquivo `hosts`. Ou seja,
**`xpto.localhost`** e **`traefik.localhost`** muitas vezes ja funcionam "de fabrica".

Verifique:

```powershell
Resolve-DnsName xpto.localhost
# ou
ping xpto.localhost
```

Saida esperada (se ja resolve):

```
Name              Type   TTL   Section    IPAddress
----              ----   ---   -------    ---------
xpto.localhost    A      ...   Answer     127.0.0.1
```

> Em **alguns** ambientes Windows Server o resolvedor **nao** atende `.localhost`
> automaticamente. Se `Resolve-DnsName`/`ping` nao retornar `127.0.0.1`, adicione as
> entradas no arquivo `hosts` (secao 3). Ja **`dev.nvit.com.br`** NAO e `.localhost` e
> **sempre** precisa de entrada no `hosts` para apontar ao loopback no teste local.

---

## 3. Editar o arquivo `hosts` do Windows

Arquivo: **`C:\Windows\System32\drivers\etc\hosts`**. Editar exige **privilegios de
Administrador**.

### 3.1 Entradas necessarias

```
127.0.0.1 xpto.localhost
127.0.0.1 dev.nvit.com.br
127.0.0.1 traefik.localhost
```

- `xpto.localhost` — host unico da plataforma (Console, Argo CD, Grafana, apps).
- `dev.nvit.com.br` — testar **localmente** o layout do dominio real (resolve para o loopback
  enquanto nao houver DNS publico).
- `traefik.localhost` — dashboard do Traefik (veja
  [`platform/traefik/dashboard-ingressroute.yaml`](../platform/traefik/dashboard-ingressroute.yaml)).

### 3.2 Abrir o editor como Administrador (PowerShell)

```powershell
# Abre o Bloco de Notas elevado ja no arquivo hosts.
Start-Process notepad.exe -ArgumentList 'C:\Windows\System32\drivers\etc\hosts' -Verb RunAs
```

Adicione as tres linhas, **salve** e feche.

### 3.3 Adicionar de forma idempotente (PowerShell elevado)

Trecho seguro de re-rodar (so adiciona o que faltar). **Execute num PowerShell 7 aberto
como Administrador**:

```powershell
$ErrorActionPreference = 'Stop'
$hostsPath = "$env:WINDIR\System32\drivers\etc\hosts"
$entries = @(
    '127.0.0.1 xpto.localhost',
    '127.0.0.1 dev.nvit.com.br',
    '127.0.0.1 traefik.localhost'
)
$current = Get-Content -LiteralPath $hostsPath -ErrorAction SilentlyContinue
foreach ($e in $entries) {
    $hostName = ($e -split '\s+')[1]
    # Ja existe alguma linha (nao comentada) com esse host?
    $exists = $current | Where-Object { $_ -notmatch '^\s*#' -and $_ -match "\b$([regex]::Escape($hostName))\b" }
    if ($exists) {
        Write-Host "[OK] Ja existe: $hostName" -ForegroundColor Green
    } else {
        Add-Content -LiteralPath $hostsPath -Value $e
        Write-Host "[ADD] Adicionado: $e" -ForegroundColor Yellow
    }
}
```

> Por que checar antes de adicionar? Para nao duplicar linhas se voce rodar de novo
> (idempotencia). Para reverter, edite o `hosts` e remova as linhas manualmente.

### 3.4 Validar a resolucao

```powershell
Resolve-DnsName dev.nvit.com.br
ping xpto.localhost
# Teste HTTP de uma rota (apos a plataforma estar no ar):
curl.exe -I http://xpto.localhost/devops
```

Saida esperada do `curl.exe -I` (cabecalhos; pode haver redirecionamento para `/devops/`):

```
HTTP/1.1 200 OK
...
```

> Dica: se o navegador insistir em cache de DNS, limpe com `ipconfig /flushdns`.

---

## 4. URLs de acesso (local)

| Recurso                  | URL                                              |
|--------------------------|--------------------------------------------------|
| DevOps Console           | <http://xpto.localhost/devops>                   |
| Aplicacao 1 (frontend)   | <http://xpto.localhost/aplicacao1>               |
| Aplicacao 1 (API health) | <http://xpto.localhost/aplicacao1/api/health>    |
| Argo CD                  | <http://xpto.localhost/argocd>                    |
| Grafana                  | <http://xpto.localhost/grafana>                   |
| Dashboard do Traefik     | <http://traefik.localhost/dashboard/>            |

---

## 5. DOMINIO REAL FUTURO (`dev.nvit.com.br`)

Para servir a plataforma na internet em `dev.nvit.com.br` (mesmo layout de paths do local),
voce precisa de **resolucao DNS publica** e de um **caminho de rede** ate o Traefik desta
maquina. Ha duas abordagens:

- **A) Exposicao direta** (DNS + firewall + port-forward no roteador) — exige IP publico e
  abrir portas. Mais trabalhoso e com mais superficie de ataque.
- **B) Tunel** (**Cloudflare Tunnel** ou **ngrok**) — **nao** abre portas no roteador; um
  agente cria um tunel de saida ate o provedor, que publica o hostname. Recomendado para
  laboratorio/homelab.

### 5.1 (A) DNS — registros A/CNAME

No painel do seu provedor de DNS (registrador do dominio `xpto.com`):

| Tipo  | Nome (host)    | Valor                              | Quando usar                                           |
|-------|----------------|------------------------------------|-------------------------------------------------------|
| `A`   | `www`          | `<IP_PUBLICO_DA_SUA_CONEXAO>`      | Exposicao direta (IP fixo). Aponta `dev.nvit.com.br` -> IP. |
| `A`   | `@` (apex)     | `<IP_PUBLICO_DA_SUA_CONEXAO>`      | Se quiser `xpto.com` (sem www) tambem.                |
| `CNAME` | `www`        | `<host-do-tunel>` (ex.: Cloudflare/ngrok) | Quando usar tunel que fornece um hostname.       |

- **IP dinamico?** Use um servico de **DDNS** (Dynamic DNS) para manter o registro `A`
  atualizado, ou prefira a abordagem de **tunel** (B), que dispensa IP fixo.
- **Propagacao**: alteracoes de DNS podem levar de minutos a horas. Valide com:
  ```powershell
  Resolve-DnsName dev.nvit.com.br -Server 1.1.1.1
  nslookup dev.nvit.com.br 8.8.8.8
  ```

### 5.2 (A) Firewall do Windows

Libere as portas 80/443 de **entrada** (apenas se for usar exposicao direta):

```powershell
# Execute como Administrador.
New-NetFirewallRule -DisplayName 'Traefik HTTP (80)'  -Direction Inbound -Protocol TCP -LocalPort 80  -Action Allow
New-NetFirewallRule -DisplayName 'Traefik HTTPS (443)' -Direction Inbound -Protocol TCP -LocalPort 443 -Action Allow
```

> Com **tunel** (Cloudflare/ngrok) voce **NAO** precisa abrir portas de entrada — o trafego
> sai da maquina (saida), o que e mais seguro.

### 5.3 (A) Port-forward no roteador

No painel do seu roteador (NAT/Port Forwarding), encaminhe:

| Porta externa (WAN) | Para o IP interno do host | Porta interna | Protocolo |
|---------------------|---------------------------|---------------|-----------|
| 80                  | `<IP_LAN_DA_MAQUINA>`     | 80            | TCP       |
| 443                 | `<IP_LAN_DA_MAQUINA>`     | 443           | TCP       |

- Descubra o IP LAN da maquina: `ipconfig` (campo IPv4 da interface ativa).
- Fixe esse IP (reserva DHCP por MAC) para o port-forward nao "quebrar" ao trocar de IP.
- **Atencao de seguranca**: expor 80/443 publicamente coloca o Traefik na internet.
  Habilite HTTPS (secao 6), `secure-headers` e considere autenticacao nas rotas sensiveis.

---

## 6. Alternativa recomendada: Cloudflare Tunnel (passo-a-passo)

O **Cloudflare Tunnel** (via `cloudflared`) cria um tunel de **saida** da sua maquina ate a
Cloudflare; ela publica `dev.nvit.com.br` com **TLS gerenciado**, **sem** abrir portas no
roteador. Pre-requisito: o dominio `xpto.com` precisa estar usando os **nameservers da
Cloudflare** (dominio adicionado a sua conta Cloudflare).

### 6.1 Instalar o `cloudflared` (Windows)

```powershell
# Via winget (recomendado)
winget install --id Cloudflare.cloudflared -e
# Verificar
cloudflared --version
```

### 6.2 Autenticar e criar o tunel

```powershell
# 1) Login (abre o navegador para autorizar o dominio na sua conta Cloudflare)
cloudflared tunnel login

# 2) Criar um tunel nomeado (gera um arquivo de credenciais .json e um Tunnel ID)
cloudflared tunnel create xpto-local
```

Saida esperada (exemplo):

```
Tunnel credentials written to C:\Users\<voce>\.cloudflared\<TUNNEL_ID>.json
Created tunnel xpto-local with id <TUNNEL_ID>
```

### 6.3 Mapear o hostname para o Traefik local (porta 80)

Crie o arquivo de configuracao do tunel
**`C:\Users\<voce>\.cloudflared\config.yml`** mapeando `dev.nvit.com.br` para o Traefik local
em **`http://localhost:80`**:

```yaml
# config.yml do Cloudflare Tunnel
tunnel: <TUNNEL_ID>
credentials-file: C:\Users\<voce>\.cloudflared\<TUNNEL_ID>.json

ingress:
  # Encaminha o hostname publico para o Traefik local (entrypoint web:80).
  - hostname: dev.nvit.com.br
    service: http://localhost:80
  # (Opcional) outro hostname/host:
  # - hostname: xpto.com
  #   service: http://localhost:80
  # Regra catch-all obrigatoria no final:
  - service: http_status:404
```

> Substitua `<TUNNEL_ID>` e o caminho do `credentials-file` pelos valores reais gerados no
> passo 6.2. O `service: http://localhost:80` entrega o trafego ao **Traefik** (que faz o
> roteamento por path); o `Host` header `dev.nvit.com.br` casa as `IngressRoute` do dominio
> real (ajuste o `host` no `devops.yaml`/IngressRoutes para `dev.nvit.com.br`).

### 6.4 Criar o registro DNS do tunel (CNAME automatico)

```powershell
# Cria/atualiza o CNAME dev.nvit.com.br -> <TUNNEL_ID>.cfargotunnel.com na Cloudflare
cloudflared tunnel route dns xpto-local dev.nvit.com.br
```

### 6.5 Rodar o tunel (teste e como servico)

```powershell
# Teste em primeiro plano (Ctrl+C para parar)
cloudflared tunnel run xpto-local

# Instalar como SERVICO do Windows (inicia com a maquina, usa o config.yml)
cloudflared service install
Get-Service cloudflared        # esperado: Running
```

Validacao:

```powershell
# De qualquer rede, apos a propagacao do DNS:
curl.exe -I https://dev.nvit.com.br/devops
```

Saida esperada: `HTTP/2 200` (TLS terminado pela Cloudflare; o trafego chega ao Traefik
local pelo tunel).

> Vantagens: sem abrir portas, TLS gerenciado pela Cloudflare, IP de origem oculto.
> Lembre-se de ajustar as `IngressRoute`/`devops.yaml` para `Host(dev.nvit.com.br)` — veja a
> secao 8 de [`path-routing-pattern.md`](./path-routing-pattern.md).

---

## 7. Alternativa rapida: ngrok

O **ngrok** e otimo para **expor temporariamente** (demos, testes). Cada execucao publica um
hostname; com plano pago/reservado e possivel usar um dominio fixo.

### 7.1 Instalar e autenticar

```powershell
winget install --id Ngrok.Ngrok -e
ngrok config add-authtoken <SEU_AUTHTOKEN>     # obtido no dashboard do ngrok
```

### 7.2 Expor o Traefik local (porta 80)

```powershell
# URL efemera (muda a cada execucao)
ngrok http 80

# Com dominio reservado (planos pagos): mapeia para o Traefik local
ngrok http --domain=dev.nvit.com.br 80
```

Saida esperada (exemplo):

```
Forwarding   https://<algo>.ngrok-free.app -> http://localhost:80
```

> Para o Traefik rotear corretamente, o `Host` precisa casar suas `IngressRoute`. Com o
> dominio efemero do ngrok, use uma `IngressRoute` que case esse host (ou um match mais
> permissivo apenas para teste). Para uso estavel, prefira o **Cloudflare Tunnel** (secao 6)
> com `dev.nvit.com.br`.

---

## 8. Notas de HTTPS

Hoje, no laboratorio, as rotas usam **HTTP (`web`/80)**; o **HTTPS (`websecure`/443)** fica
**pendente**. Opcoes para habilitar TLS:

### 8.1 Cloudflare Tunnel (TLS gerenciado) — mais simples

Com o Cloudflare Tunnel (secao 6), o **TLS e terminado na Cloudflare** automaticamente
(`https://dev.nvit.com.br`). Voce **nao** precisa gerenciar certificados no cluster nem abrir
443 no roteador. Recomendado para o dominio real em homelab.

### 8.2 Let's Encrypt via ACME no Traefik (exposicao direta)

Se expor 80/443 diretamente (secao 5.A), o Traefik pode emitir certificados validos via
**ACME (Let's Encrypt)**. Em alto nivel:

1. Configurar um `certResolver` ACME no Traefik (challenge HTTP-01 na porta 80 ou DNS-01).
2. Nas `IngressRoute`, usar `entryPoints: [websecure]` e `tls: { certResolver: letsencrypt }`
   (exemplo na secao 8.1 de [`path-routing-pattern.md`](./path-routing-pattern.md)).
3. Adicionar um `Middleware` de **redirect** HTTP -> HTTPS (ha um `redirect-https`
   comentado em [`platform/traefik/middlewares.yaml`](../platform/traefik/middlewares.yaml)).
4. Habilitar HSTS via `secure-headers` (ja existe; `stsSeconds` so vale sob HTTPS).

### 8.3 cert-manager (alternativa no cluster)

Como alternativa ao ACME nativo do Traefik, e possivel instalar o **cert-manager** no
cluster e emitir certificados (Let's Encrypt) via `Certificate`/`Issuer`, referenciando o
`Secret` TLS resultante nas `IngressRoute` (`tls: { secretName: ... }`).

### 8.4 Self-signed (apenas local/teste)

Para testar HTTPS local sem CA publica, gere um certificado **self-signed** e crie um
`Secret` TLS no namespace `traefik`, apontando-o nas `IngressRoute` (`tls: { secretName:
... }`). O navegador exibira **aviso de seguranca** (certificado nao confiavel) — aceitavel
apenas em laboratorio. Por isso, no lab, mantemos **HTTP** por padrao.

---

## 9. Troubleshooting de dominio

| Sintoma                                                  | Causa provavel                                        | Correcao                                                                 |
|---------------------------------------------------------|-------------------------------------------------------|--------------------------------------------------------------------------|
| `dev.nvit.com.br` nao abre localmente.                     | Sem entrada no `hosts` apontando p/ `127.0.0.1`.      | Adicione `127.0.0.1 dev.nvit.com.br` (secao 3) e `ipconfig /flushdns`.      |
| `xpto.localhost` nao resolve.                           | Resolvedor nao atende `.localhost` neste host.        | Adicione `127.0.0.1 xpto.localhost` no `hosts`.                          |
| Pagina abre mas vem 404 do Traefik.                     | `Host` nao casa nenhuma `IngressRoute`.               | Confirme o `host` no `devops.yaml`/IngressRoutes (local vs `dev.nvit.com.br`). |
| HTTPS com aviso de certificado.                         | Certificado self-signed.                              | Use Cloudflare Tunnel ou Let's Encrypt (secao 8).                        |
| Tunel Cloudflare nao publica.                           | Servico `cloudflared` parado / `config.yml` errado.   | `Get-Service cloudflared`; valide `config.yml` e o `Tunnel ID`.         |
| DNS publico nao propagou.                               | TTL/propagacao.                                       | Aguarde; teste com `Resolve-DnsName dev.nvit.com.br -Server 1.1.1.1`.       |

---

## 10. Referencias

- [`path-routing-pattern.md`](./path-routing-pattern.md) — rotas por path e versao
  `dev.nvit.com.br` (secao 8).
- [`SECURITY.md`](../SECURITY.md) — status do HTTPS e endurecimento para o dominio real.
- [`platform/traefik/middlewares.yaml`](../platform/traefik/middlewares.yaml) —
  `secure-headers` e `redirect-https` (comentado).
- [`platform/traefik/dashboard-ingressroute.yaml`](../platform/traefik/dashboard-ingressroute.yaml)
  — `traefik.localhost`.
- [`deployment-flow.md`](./deployment-flow.md) — instalar/validar a plataforma antes de
  expor o dominio.
