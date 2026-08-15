---
name: platform-health
description: Roda o relatório de saúde da plataforma DevOps local (scripts/validate-platform.ps1) e resume o estado do cluster (pods/services/ingressroutes). Use quando o pedido for verificar a saúde da plataforma, checar se está tudo no ar, ou diagnosticar de forma read-only o cluster. Somente leitura — não altera estado.
allowed-tools: Bash(pwsh -File C:\devops\scripts\validate-platform.ps1*), Bash(kubectl get:*), Bash(kubectl describe:*)
---

# Saúde da plataforma (read-only)

Operação SEGURA (read-only / idempotente) conforme `AGENTS.md` §5. Nunca aplica, deleta ou faz
upgrade de recursos vivos.

## Passos

1. **Relatório oficial (17 checks)** — `scripts/validate-platform.ps1`:
   ```powershell
   C:\devops\scripts\validate-platform.ps1
   ```
2. **Visão geral do cluster** (read-only):
   ```powershell
   kubectl get pods,svc,ingressroute -A
   ```
3. **Aprofundar só onde houver problema** — para qualquer pod fora de `Running`/`Ready`:
   ```powershell
   kubectl describe pod <pod> -n <ns>
   kubectl logs <pod> -n <ns> --tail=100
   ```

## Resumo a entregar

- Resultado do `validate-platform.ps1` (passou / quais checks falharam).
- Por namespace-chave (`traefik`, `argocd`, `identity`, `observability`, `kube-system`, `apps`):
  pods não-Ready, restarts, IngressRoutes ausentes.
- Componentes da plataforma no ar? (Traefik, Argo CD, Keycloak, kube-prometheus-stack/Loki,
  Sealed Secrets, DevOps Console).
- Recomendações de próximos passos. Ações destrutivas/com efeito colateral (apply, rollout, recover,
  reset) são COM APROVAÇÃO — apenas sugira, não execute (`AGENTS.md` §5).
