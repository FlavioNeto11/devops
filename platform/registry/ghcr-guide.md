# Guia do GHCR (GitHub Container Registry)

Este guia descreve como autenticar, nomear, publicar e consumir imagens no
**GitHub Container Registry (GHCR)** para a plataforma DevOps.

- Repositorio: <https://github.com/FlavioNeto11/devops>
- Dono (login): `FlavioNeto11`
- Namespace do GHCR (sempre minusculo): `flavioneto11`
- Registry: `ghcr.io`

> IMPORTANTE: este documento usa apenas **placeholders** (ex.: `<PAT>`). Nunca
> faca commit de segredos reais (tokens, senhas) no repositorio.

---

## 1. Criar um Personal Access Token (PAT classic)

O GHCR aceita autenticacao por **PAT classic** com os escopos de packages.

1. No GitHub, acesse: **Settings** -> **Developer settings** ->
   **Personal access tokens** -> **Tokens (classic)** -> **Generate new token
   (classic)**.
2. Selecione os escopos:
   - `write:packages` — necessario para **publicar** (push) imagens.
   - `read:packages` — necessario para **baixar** (pull) imagens privadas.
   - `delete:packages` — *opcional*, apenas se voce for **apagar** versoes/imagens.
3. Defina uma expiracao adequada e gere o token. **Copie o valor agora** (ele
   nao sera exibido novamente) e guarde em um cofre de segredos.

> Dica: para uso apenas em pipelines do GitHub Actions deste repositorio, voce
> normalmente **nao precisa** de um PAT — veja a secao 7 (GITHUB_TOKEN).

---

## 2. Login no Docker apontando para o GHCR

Use `--password-stdin` para nao deixar o token no historico do shell.

PowerShell 7 (Windows):

```powershell
# $env:GHCR_PAT deve conter o PAT (nunca hardcode no script!)
$env:GHCR_PAT | docker login ghcr.io -u FlavioNeto11 --password-stdin
```

Forma equivalente com `echo` (bash/sh ou pwsh):

```bash
echo <PAT> | docker login ghcr.io -u FlavioNeto11 --password-stdin
```

Saida esperada: `Login Succeeded`.

---

## 3. Convencao de nomes das imagens

O padrao de nomes da plataforma e:

```
ghcr.io/flavioneto11/<app>/<service>:<tag>
```

Onde:

- `<app>` — nome da aplicacao (ex.: `aplicacao1`, `console`).
- `<service>` — nome do servico dentro da app (ex.: `frontend`, `api`, `worker`,
  `backend`).
- `<tag>` — tag da imagem. A esteira de CI publica:
  - `:<sha>` — SHA completo do commit (imutavel; e a referencia canonica).
  - `:<branch>` — tag com o nome da branch (ex.: `:main`).
  - `:latest` — apenas para conveniencia (ultimo build da branch principal).

Exemplos:

```
ghcr.io/flavioneto11/aplicacao1/frontend:9f3c1a2b...   # por SHA
ghcr.io/flavioneto11/aplicacao1/api:main               # por branch
ghcr.io/flavioneto11/console/backend:latest            # latest
```

> Lembrete: as imagens **locais** do laboratorio (ex.: `aplicacao1-api:local`,
> `console-backend:local`) sao buildadas localmente e **NAO** sao enviadas ao
> GHCR. Elas usam `imagePullPolicy: IfNotPresent`. O GHCR e usado pelo CI.

---

## 4. Build e push de uma imagem

Exemplo publicando a API da `aplicacao1` por SHA e por `latest`:

```powershell
# Variaveis (ajuste conforme necessario)
$app     = "aplicacao1"
$service = "api"
$sha     = (git rev-parse HEAD)              # SHA do commit atual
$image   = "ghcr.io/flavioneto11/$app/$service"

# Build (contexto e Dockerfile do servico)
docker build -t "${image}:$sha" -t "${image}:latest" `
  -f C:/devops/samples/$app/$service/Dockerfile `
  C:/devops/samples/$app/$service

# Push das duas tags
docker push "${image}:$sha"
docker push "${image}:latest"
```

Para conferir o que foi publicado, acesse a aba **Packages** do perfil/repo no
GitHub.

---

## 5. Visibilidade do package (publico x privado)

Cada package (imagem) no GHCR tem visibilidade propria:

- **Privado** (padrao para repositorios privados): o pull exige autenticacao
  (`read:packages`) e, no Kubernetes, um **imagePullSecret** (secao 6).
- **Publico**: o pull e anonimo (nao exige secret).

Como ajustar:

1. GitHub -> seu perfil/organizacao -> aba **Packages** -> selecione o package.
2. **Package settings** -> secao **Danger Zone** -> **Change visibility**.
3. (Opcional) Em **Manage Actions access**, conecte o package ao repositorio
   `FlavioNeto11/devops` para que o GitHub Actions possa publicar nele.

> Para o laboratorio, manter os packages **publicos** simplifica o consumo (sem
> imagePullSecret). Em producao, prefira **privado** + imagePullSecret.

---

## 6. Consumir imagens privadas no Kubernetes (imagePullSecret)

Crie um secret do tipo `docker-registry` no namespace onde a app roda
(ex.: `apps`):

```powershell
kubectl create secret docker-registry ghcr `
  --namespace apps `
  --docker-server=ghcr.io `
  --docker-username=FlavioNeto11 `
  --docker-password=<PAT> `
  --docker-email=flavioneto11@users.noreply.github.com
```

> Use o PAT com escopo `read:packages` como senha. Para tornar o comando
> idempotente, e possivel anexar
> `--dry-run=client -o yaml | kubectl apply -f -`.

Referencie o secret no `spec` do Pod/Deployment:

```yaml
spec:
  imagePullSecrets:
    - name: ghcr
  containers:
    - name: api
      image: ghcr.io/flavioneto11/aplicacao1/api:latest
      imagePullPolicy: IfNotPresent
```

> Se a app roda em mais de um namespace (ex.: `apps-dev`, `apps-prod-local`),
> crie o secret `ghcr` em **cada** namespace que precisa puxar imagens privadas.

---

## 7. GitHub Actions: push automatico com GITHUB_TOKEN

Nos workflows deste repositorio, **nao e necessario** criar um PAT para publicar:
o GitHub Actions injeta automaticamente o `GITHUB_TOKEN`, que tem permissao de
escrita em packages quando o job declara `permissions: packages: write`.

Exemplo de etapa de login no workflow:

```yaml
permissions:
  contents: read
  packages: write

jobs:
  build-push:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Login no GHCR
        uses: docker/login-action@v3
        with:
          registry: ghcr.io
          username: ${{ github.actor }}
          password: ${{ secrets.GITHUB_TOKEN }}
      # ... etapas de build/push usando a convencao de nomes da secao 3 ...
```

> Resumo: **PAT** para uso manual/local (sua maquina); **GITHUB_TOKEN** para a
> esteira automatizada no GitHub Actions.

---

## 8. Logout (opcional)

```powershell
docker logout ghcr.io
```
