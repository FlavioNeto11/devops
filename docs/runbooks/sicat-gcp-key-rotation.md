---
title: "Runbook — rotação da GCP API Key legada do SICAT"
status: guide
applies_to: [sicat]
updated: 2026-07-02
language: pt-BR
---

# Runbook — rotação da GCP API Key legada do SICAT

> **Para o OPERADOR (ações manuais fora do repo).** Contexto: o repo **legado**
> `FlavioNeto11/sicat` tem uma **GCP API Key vazada no histórico** (`.vscode/mcp.json`,
> commit `7e5cbf7`) — o GitHub Push Protection bloqueia pushes lá por causa disso.
> O SICAT foi importado para o monorepo via `git subtree --squash`, então o histórico
> **do monorepo `C:\devops` está limpo** — **não** é preciso BFG/rewrite aqui.
> Ver também [`apps/sicat/ONBOARDING-DEVOPS.md`](../../apps/sicat/ONBOARDING-DEVOPS.md) §7.

## Checklist

### 1. Revogar a chave no Google Cloud
- [ ] Abrir o [Google Cloud Console → APIs & Services → Credentials](https://console.cloud.google.com/apis/credentials)
      no projeto GCP onde a chave foi criada (conta `flavio.padilha.neto@gmail.com`).
- [ ] Localizar a API Key correspondente à vazada (comparar o valor com o commit
      `7e5cbf7` de `.vscode/mcp.json` no repo legado).
- [ ] **Deletar** a chave (ou "Regenerate key" se algum uso legítimo ainda existir —
      preferir deletar: nada nesta plataforma a usa).
- [ ] Conferir em **APIs & Services → Metrics** se houve uso recente/inesperado da chave
      antes da revogação (indicador de abuso).

### 2. Arquivar o repo legado
- [ ] Em `https://github.com/FlavioNeto11/sicat` → Settings → **Archive this repository**
      (o histórico com o segredo morto deixa de receber pushes; a chave já revogada
      torna o vazamento inerte).
- [ ] Alternativa mais forte (opcional): tornar o repo **privado** ou deletá-lo — o
      monorepo `FlavioNeto11/devops` é a única fonte da verdade do SICAT desde a importação.

### 3. Conferir que nada no cluster usa a chave
```powershell
# nenhum Secret/ConfigMap deve conter chave GCP (o SICAT não usa GCP em runtime):
kubectl get secret -n apps sicat-config -o jsonpath='{.data}' | % { $_ }   # só OPENAI/CETESB/etc.
kubectl get secret,configmap -n apps -o yaml | Select-String -Pattern 'AIza' # padrão de GCP API Key — deve vir VAZIO
# grep no repo (defesa em profundidade; deve vir vazio):
git -C C:\devops grep -I 'AIza' -- . ':!node_modules'
```
- [ ] Os três comandos acima sem ocorrências → nada no cluster/repo depende da chave.

### 4. Registrar a conclusão
- [ ] Atualizar [`apps/sicat/ONBOARDING-DEVOPS.md`](../../apps/sicat/ONBOARDING-DEVOPS.md) §7
      (remover a pendência 🔐) e o `CLAUDE.md` do SICAT (armadilha nº 7) no mesmo PR.

## O que NÃO fazer
- **Não** rodar BFG/`filter-repo` no monorepo `C:\devops` — o histórico daqui está limpo
  (importação por squash); rewrite só criaria risco de force-push (fronteira proibida).
- **Não** commitar a chave (nem "de exemplo") em lugar nenhum — segredos nunca em git
  (ver [`docs/standards/hard-constraints.md`](../standards/hard-constraints.md)).
