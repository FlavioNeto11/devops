---
title: "Seguranca"
status: canonical
applies_to: [platform]
updated: 2026-06-09
language: pt-BR
---

# Seguranca

Este documento descreve como a plataforma trata segredos, os escopos do PAT do GHCR, a
seguranca do runner self-hosted, a justificativa do RBAC somente leitura do Console, o
status do HTTPS local e o que o `.gitignore` protege.

> Visao geral em [`README.md`](./README.md). Correcoes operacionais em
> [`TROUBLESHOOTING.md`](./TROUBLESHOOTING.md).

---

## 1. Tratamento de segredos

**Regra de ouro: NUNCA commitar segredos reais no repositorio.**

A plataforma versiona apenas **exemplos** com valores **placeholder**:

- **`.env.example`** — modelo de variaveis de ambiente. Copie para `.env` (ignorado pelo
  Git) e preencha com seus valores reais localmente:
  ```powershell
  Copy-Item .env.example .env
  # edite .env com seus valores reais (PAT, senhas, etc.)
  ```
- **`secret.example.yaml`** — modelo de `Secret` do Kubernetes. Copie para `secret.yaml`
  (ignorado) e substitua os placeholders antes de aplicar:
  ```powershell
  Copy-Item secret.example.yaml secret.yaml
  # edite secret.yaml; depois:
  kubectl apply -f secret.yaml
  ```

Boas praticas:

- Arquivos `*.example` ficam **rastreados**; os arquivos reais (`.env`, `*.env`,
  `secret.yaml`, `*.secret.yaml`) ficam **ignorados** (ver secao 6).
- Nunca cole tokens/senhas em comandos que vao para o historico ou em logs.
- Prefira `Secret` do Kubernetes a variaveis em texto plano em `ConfigMap`.
- Se um segredo vazar, **revogue-o imediatamente** e gere um novo.
- **Dumps de sessao (HAR, `.http`, cURL com headers): NUNCA versionar** — contem
  `Authorization`/`Cookie` e PII (CPF/CNPJ). Sao ignorados (`*.har`). Evidencia CETESB fica
  **local** (ver [`apps/sicat/docs/cetesb/README.md`](apps/sicat/docs/cetesb/README.md)).

> **Histórico (2026-06):** HARs da CETESB com JWT + CPF/CNPJ foram removidos do repositorio e
> **purgados do historico** (`git filter-repo`) + force-push na `main`. Forks/clones e SHAs em cache
> do GitHub podem reter copias por ate ~90 dias (GC); **rotacione** qualquer credencial exposta.

---

## 2. Escopos do PAT do GHCR

Para publicar/baixar imagens no **GitHub Container Registry** o **Personal Access Token**
precisa apenas dos escopos minimos:

| Escopo           | Para que serve                                              |
|------------------|------------------------------------------------------------|
| `write:packages` | Publicar (push) imagens no GHCR (`ghcr.io/flavioneto11/...`). |
| `read:packages`  | Baixar (pull) imagens privadas do GHCR.                    |

Login (o token entra via `stdin`, nunca no historico):

```powershell
$env:CR_PAT = "<SEU_PAT_AQUI>"   # ou leia de um cofre/variavel segura
$env:CR_PAT | docker login ghcr.io -u flavioneto11 --password-stdin
Remove-Item Env:CR_PAT           # limpe a variavel apos o login
```

> Use o **menor** conjunto de escopos possivel. Para o laboratorio com imagens `:local`,
> o login no GHCR **nao** e necessario.

---

## 3. Seguranca do runner self-hosted

- O **token de registro** do runner (usado em `config.cmd`/`config.sh`) e
  **efemero**: vale por tempo curto e apenas para registrar o runner. Nao e um segredo
  de longa duracao e **nao** deve ser commitado.
- O runner roda como **servico** (inicia com a maquina), executando com uma conta de
  servico dedicada e privilegios minimos necessarios para Docker e `kubectl`.
- A pasta do runner (`runner/`) e **ignorada** pelo Git (contem credenciais e estado).
- Restrinja quem pode disparar workflows que rodam no runner (o runner tem acesso ao
  Docker local e ao cluster); evite executar workflows de forks/PRs nao confiaveis.
- Mantenha o binario do runner atualizado.

---

## 4. RBAC somente leitura do Console

O **DevOps Console** e estritamente **somente leitura**. Por isso seu acesso ao cluster
e limitado por RBAC:

- `ServiceAccount` dedicado no namespace **`devops-system`**.
- `ClusterRole` com **apenas** os verbos `get`, `list`, `watch`.
- **Sem** `create`, `update`, `patch`, `delete` ou `deletecollection`.

Justificativa:

- O Console **observa** o estado (Deployments, Pods, Services, rotas) e o transmite via
  SSE; ele **nunca** modifica o cluster.
- Mesmo que o backend seja comprometido, o impacto fica contido a leitura — nao ha como
  alterar workloads ou apagar recursos com essas permissoes.
- Segue o principio do **menor privilegio**.

---

## 5. Status do HTTPS local e endurecimento para dominio real

- **Hoje (local):** as rotas usam o entrypoint **`web` (HTTP/80)**. O entrypoint
  **`websecure` (HTTPS/443)** fica **pendente**, pois exigiria um certificado
  **self-signed** (o navegador exibiria aviso de seguranca). Para o laboratorio em
  `xpto.localhost`, HTTP e suficiente.
- **Como endurecer para o dominio real (`dev.nvit.com.br`):**
  1. Emitir um certificado valido (ex.: Let's Encrypt via ACME no Traefik, ou um
     certificado corporativo) e habilitar o entrypoint `websecure`.
  2. Redirecionar `web` → `websecure` (HTTP → HTTPS) com um `Middleware` de redirect.
  3. Considerar um **Cloudflare Tunnel** para expor o servico com TLS gerenciado sem
     abrir portas no roteador (ver `ROADMAP.md` → Evolucao futura).
  4. Habilitar HSTS e cabecalhos de seguranca via `Middleware` do Traefik.

---

## 6. O que o `.gitignore` protege

O [`.gitignore`](./.gitignore) impede o commit de artefatos e, principalmente, de
segredos:

- **Segredos:** `.env`, `*.env` (exceto `*.env.example`), `secret.yaml`, `*.secret.yaml`,
  `secrets/`, `kubeconfig`, `*.har` (dumps de sessao).
- **Runner e diagnosticos:** `runner/` (pasta do self-hosted runner, com credenciais) e
  `diagnostics/`.
- **Artefatos de build:** `node_modules/`, `dist/`, `build/`, `bin/`, `obj/`, `*.log`,
  `*.tgz`, `coverage/`.
- **Arquivos de IDE/OS:** `.vs/`, `.DS_Store`.

Os arquivos de **exemplo** (`*.example`, incluindo `*.env.example`) permanecem
**rastreados** para servir de modelo seguro.
