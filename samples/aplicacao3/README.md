# aplicacao3

App gerado por `scripts/new-app.ps1` no padrao da plataforma DevOps local.

- Host: http://xpto.localhost/aplicacao3  (real futuro: http://nvit.io/aplicacao3)
- Namespace: apps · Servicos: frontend, api, api2, worker

## Publicar LOCAL (imagens :local)
```powershell
docker build -t aplicacao3-frontend:local "C:\devops\samples\aplicacao3\frontend"
 docker build -t aplicacao3-api:local "C:\devops\samples\aplicacao3\api"
 docker build -t aplicacao3-api2:local "C:\devops\samples\aplicacao3\api2"
 docker build -t aplicacao3-worker:local "C:\devops\samples\aplicacao3\worker"
kubectl apply -f "C:\devops\samples\aplicacao3\k8s\aplicacao3.yaml"
kubectl -n apps rollout status deploy/aplicacao3-frontend
```

## Publicar via GitHub Actions (GHCR + runner)
Faça push deste projeto; o `.github/workflows/ci-cd.yaml` builda no GHCR e faz deploy via runner self-hosted.

## Validar
```powershell
Invoke-WebRequest -UseBasicParsing http://xpto.localhost/aplicacao3
 Invoke-WebRequest -UseBasicParsing http://xpto.localhost/aplicacao3/api/health
 Invoke-WebRequest -UseBasicParsing http://xpto.localhost/aplicacao3/api2/health
```
Confira tambem no DevOps Console: http://xpto.localhost/devops
