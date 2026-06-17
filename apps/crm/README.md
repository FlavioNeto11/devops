# crm

App gerado por `scripts/new-app.ps1` no padrao da plataforma DevOps local.

- Host: http://nvit.localhost/crm  (real futuro: http://dev.nvit.com.br/crm)
- Namespace: apps · Servicos: frontend, api, worker

## Publicar LOCAL (imagens :local)
```powershell
docker build -t crm-frontend:local "C:\devops\apps\crm\frontend"
 docker build -t crm-api:local "C:\devops\apps\crm\api"
 docker build -t crm-worker:local "C:\devops\apps\crm\worker"
kubectl apply -f "C:\devops\apps\crm\k8s\crm.yaml"
kubectl -n apps rollout status deploy/crm-frontend
```

## Publicar via GitHub Actions (GHCR + runner)
Faça push deste projeto; o `.github/workflows/ci-cd.yaml` builda no GHCR e faz deploy via runner self-hosted.

## Validar
```powershell
Invoke-WebRequest -UseBasicParsing http://nvit.localhost/crm
 Invoke-WebRequest -UseBasicParsing http://nvit.localhost/crm/api/health
```
Confira tambem no DevOps Console: http://nvit.localhost/devops
