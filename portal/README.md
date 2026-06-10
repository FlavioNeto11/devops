# Portal NovaIT (landing na raiz `/`)

> **Para agentes:** leia [`AGENTS.md`](./AGENTS.md) primeiro (escopo, fronteiras seguras/aprovação/proibidas, princípios).

Página inicial pública da plataforma, servida na **raiz** de `https://dev.nvit.com.br`
(e `http://xpto.localhost/` no dev local). Lista **dinamicamente** as aplicações
publicadas e dá atalhos para as ferramentas.

## Como funciona
- **Frontend** estático (nginx) com a marca **NovaIT**; o JS busca
  `/devops/api/ingressroutes` (API somente-leitura do DevOps Console), filtra o
  namespace `apps` e renderiza um card por aplicação (atualiza a cada 30s).
- **Roteamento**: `IngressRoute` em `devops-system` com `PathPrefix("/")` e
  **`priority: 1`** (a menor) — os paths específicos (`/devops`, `/aplicacao1`,
  `/grafana`, `/argocd`...) sempre vencem; só a raiz cai no portal.
- Fica em `devops-system` (componente da plataforma), por isso **não** aparece na
  própria lista (que mostra só o namespace `apps`).

## Deploy
```powershell
docker build -t portal-frontend:local C:\devops\portal\frontend
kubectl apply -f C:\devops\portal\k8s\portal.yaml
kubectl -n devops-system rollout status deploy/portal
```

## Personalizar
Edite `frontend/index.html` (marca, cores, textos), rebuild e reaplique:
```powershell
docker build -t portal-frontend:local C:\devops\portal\frontend
kubectl -n devops-system rollout restart deploy/portal
```

## Observações
- Não é preciso mexer no portal quando publicar um app novo — ele aparece sozinho
  (basta a app ter uma `IngressRoute` no namespace `apps`).
- Acessível em `https://dev.nvit.com.br/` (público via Cloudflare Tunnel) e
  `http://xpto.localhost/` (dev local).
