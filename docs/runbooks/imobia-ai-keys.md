---
title: "Runbook — acender as chaves de IA do imobia"
status: guide
applies_to: [imobia]
updated: 2026-07-02
language: pt-BR
---

# Runbook — acender as chaves de IA do imobia

> **Para o OPERADOR.** O imobia é **fail-soft**: sem chaves, todos os módulos funcionam
> manualmente e as IAs ficam **dormentes** (a API responde `dormant: true`). As chaves
> entram no Secret **`imobia-config`** (namespace `apps`) — nomes de env conferidos no
> código ([`apps/imobia/api/src/env.ts`](../../apps/imobia/api/src/env.ts)):
>
> | Env | Acende | Modelos |
> |---|---|---|
> | `OPENAI_API_KEY` | GPT (lógica/function-calling), Cortex (triagem), busca semântica/embeddings, lead scoring | OpenAI |
> | `ANTHROPIC_API_KEY` | Claude (redação/análise: Corbam, Vistoria, PTAM), Cortex | Anthropic |
> | `GOOGLE_API_KEY` | Gemini (documentos/visão) | Google |
>
> O Secret também carrega `JWT_SECRET` e `KEYCLOAK_USERINFO_URL` — **preserve-os** ao
> atualizar (o `envFrom` da api e do worker lê o Secret inteiro).

## Checklist

### 1. Gerar/obter as chaves
- [ ] OpenAI: <https://platform.openai.com/api-keys> (`sk-...`).
- [ ] Anthropic: <https://console.anthropic.com/settings/keys> (`sk-ant-...`).
- [ ] Google AI Studio: <https://aistudio.google.com/app/apikey> (opcional; Gemini).

### 2. Atualizar o Secret `imobia-config` SEM perder as chaves existentes
Via **Sealed Secrets** (padrão da plataforma — o SealedSecret criptografado PODE ser
versionado; o Secret plaintext NUNCA):
```powershell
# parte dos valores atuais (preserva JWT_SECRET/KEYCLOAK_USERINFO_URL) e acrescenta as chaves:
$cur = kubectl -n apps get secret imobia-config -o json | ConvertFrom-Json
$args = $cur.data.PSObject.Properties | ForEach-Object {
  "--from-literal=$($_.Name)=$([Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($_.Value)))"
}
kubectl -n apps create secret generic imobia-config @args `
  --from-literal=OPENAI_API_KEY="<sk-...>" `
  --from-literal=ANTHROPIC_API_KEY="<sk-ant-...>" `
  --from-literal=GOOGLE_API_KEY="<AIza...>" `
  --dry-run=client -o yaml | kubeseal --format yaml > imobia-config.sealed.yaml
kubectl apply -f imobia-config.sealed.yaml
Remove-Item imobia-config.sealed.yaml   # ou versionar o SEALED (nunca o plaintext)
```
> Atalho de laboratório (sem versionar): mesmo pipeline sem `kubeseal`, aplicando o
> Secret direto. O Secret real fica **fora do git** e fora do `kustomization.yaml`
> (o prune do Argo não o toca) — ver `apps/imobia/k8s/secret.example.yaml`.

### 3. Reciclar api e worker (envFrom só é lido no boot)
```powershell
kubectl -n apps rollout restart deploy/imobia-api deploy/imobia-worker
kubectl -n apps rollout status  deploy/imobia-api
```

### 4. Validar que a IA acordou
```powershell
curl.exe -s https://dev.nvit.com.br/imobia/api/health          # 200
# qualquer módulo de IA deve parar de responder `dormant: true`
# (ex.: lead scoring usa OPENAI, cartas Corbam usam ANTHROPIC — testar pela UI /imobia)
kubectl -n apps logs deploy/imobia-api --tail=50               # sem erros de auth das APIs
```
- [ ] Respostas deixaram de vir com `dormant: true` nos módulos com chave configurada.

## Notas
- **Não** pôr as chaves em `devops.yaml`, manifests ou `.env` versionado — segredos nunca
  em git ([`docs/standards/hard-constraints.md`](../standards/hard-constraints.md)).
- Deixar uma chave **vazia** é válido: o módulo correspondente continua dormante (fail-soft).
- Custo: as chaves passam a gerar consumo real (OpenAI/Anthropic/Google) — acompanhar os
  painéis de uso dos provedores.
