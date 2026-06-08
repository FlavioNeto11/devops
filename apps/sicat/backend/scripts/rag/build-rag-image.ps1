#requires -version 7
<#
.SYNOPSIS
  Reconstrói a imagem do backend SICAT COM o índice de conhecimento (RAG) embarcado.

.DESCRIPTION
  1. Sincroniza as fontes do RAG (7 docs de domínio + intent catalog) de apps/sicat/docs
     para apps/sicat/backend/docs (que é o contexto do docker build do backend).
  2. Lê a OPENAI_API_KEY do Secret k8s `sicat-config` (a chave NUNCA é embarcada na imagem;
     vai via secret efêmero do BuildKit, montado só durante o RUN do build).
  3. Roda `docker build` com `--secret`, que executa `npm run build:rag` em build-time e grava
     artifacts/conversation-knowledge-index.json DENTRO da imagem (persistente, regenerável).

  Rode novamente sempre que editar os docs/intents para regerar o índice.

.EXAMPLE
  pwsh apps/sicat/backend/scripts/rag/build-rag-image.ps1
  kubectl -n apps rollout restart deploy/sicat-api deploy/sicat-worker
#>
param(
  [string]$Tag = 'sicat-api:local',
  [string]$Namespace = 'apps'
)
$ErrorActionPreference = 'Stop'
$env:Path = [Environment]::GetEnvironmentVariable('Path', 'Machine') + ';' + [Environment]::GetEnvironmentVariable('Path', 'User')
$env:DOCKER_BUILDKIT = '1'

$backend = Split-Path (Split-Path $PSScriptRoot -Parent) -Parent  # .../apps/sicat/backend
$sicat = Split-Path $backend -Parent                             # .../apps/sicat
$docsSrc = Join-Path $sicat 'docs'

# 1. Sincroniza as fontes do RAG para o contexto do build (mantém em dia com os docs canônicos).
$docs = '01-visao-geral', '02-arquitetura', '04-fluxos-operacionais', '05-modelo-de-dados',
'07-integracao-cetesb', '08-riscos-e-lacunas', '16-camada-conversacional', '17-ferramentas-e-roteamento'
New-Item -ItemType Directory -Force (Join-Path $backend 'docs\copilot') | Out-Null
New-Item -ItemType Directory -Force (Join-Path $backend 'docs\ai-chat\intents') | Out-Null
foreach ($d in $docs) { Copy-Item (Join-Path $docsSrc "copilot\$d.md") (Join-Path $backend 'docs\copilot') -Force }
Copy-Item (Join-Path $docsSrc 'ai-chat\intents\sicat-chat-intent-catalog.jsonl') (Join-Path $backend 'docs\ai-chat\intents') -Force
Write-Host "[rag] fontes sincronizadas para o contexto do build."

# 2. Chave do Secret k8s -> arquivo temporário (texto puro, sem newline).
$b64 = kubectl -n $Namespace get secret sicat-config -o "jsonpath={.data.OPENAI_API_KEY}"
if (-not $b64) { throw "OPENAI_API_KEY ausente no Secret $Namespace/sicat-config." }
$key = [Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($b64))
$keyfile = Join-Path $env:TEMP 'sicat_oai_key.txt'
Set-Content -Path $keyfile -Value $key -NoNewline -Encoding ascii

# 3. Build com secret do BuildKit (gera o índice dentro da imagem).
try {
  docker build --secret "id=openai_key,src=$keyfile" -t $Tag -f (Join-Path $backend 'Dockerfile') $backend
  if ($LASTEXITCODE -ne 0) { throw "docker build falhou (exit $LASTEXITCODE)." }
}
finally {
  Remove-Item $keyfile -Force -ErrorAction SilentlyContinue
}
Write-Host "[rag] OK: imagem '$Tag' reconstruída com o índice RAG embarcado."
Write-Host "[rag] Aplique: kubectl -n $Namespace rollout restart deploy/sicat-api deploy/sicat-worker"
