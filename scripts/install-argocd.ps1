#requires -Version 7.0
<#
.SYNOPSIS
    Instala/atualiza o Argo CD via Helm no namespace 'argocd' e publica em /argocd.

.DESCRIPTION
    Script IDEMPOTENTE (seguro re-rodar). Cria o namespace (se necessario),
    adiciona/atualiza o repositorio Helm do Argo, executa 'helm upgrade --install'
    com os values da plataforma, aguarda o rollout do argocd-server, aplica uma
    IngressRoute do Traefik para o subpath /argocd e aplica as Applications.

    Roteamento (convencao da plataforma):
      - /argocd -> service 'argocd-server' (porta 80), entryPoints [web].
      - SEM StripPrefix: o Argo CD roda com '--insecure' e rootpath /argocd
        (configurado em helm-values.yaml), portanto ele mesmo serve sob o subpath.

.NOTES
    Requer: kubectl, helm e contexto kube 'docker-desktop' ativo.
#>

[CmdletBinding()]
param(
    # Timeout (em segundos) usado nos comandos de rollout/wait do kubectl/helm.
    [int]$TimeoutSeconds = 300
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

# -----------------------------------------------------------------------------
# Funcoes utilitarias de saida (cabecalhos de secao).
# -----------------------------------------------------------------------------
function Write-Section {
    param([Parameter(Mandatory)][string]$Title)
    Write-Host ''
    Write-Host ('=' * 78) -ForegroundColor Cyan
    Write-Host "  $Title" -ForegroundColor Cyan
    Write-Host ('=' * 78) -ForegroundColor Cyan
}

function Write-Step {
    param([Parameter(Mandatory)][string]$Message)
    Write-Host "  -> $Message" -ForegroundColor Gray
}

function Assert-Command {
    param([Parameter(Mandatory)][string]$Name)
    if (-not (Get-Command $Name -ErrorAction SilentlyContinue)) {
        throw "Comando obrigatorio nao encontrado no PATH: '$Name'. Instale-o antes de continuar."
    }
}

function Invoke-External {
    param(
        [Parameter(Mandatory)][string]$FilePath,
        [Parameter(Mandatory)][string[]]$Arguments
    )
    Write-Step ("{0} {1}" -f $FilePath, ($Arguments -join ' '))
    & $FilePath @Arguments
    if ($LASTEXITCODE -ne 0) {
        throw ("Falha ao executar '{0} {1}' (exit code {2})." -f $FilePath, ($Arguments -join ' '), $LASTEXITCODE)
    }
}

# -----------------------------------------------------------------------------
# Caminhos relativos a este script (../platform/argocd).
# -----------------------------------------------------------------------------
$argocdDir   = Join-Path $PSScriptRoot '../platform/argocd'
$valuesFile  = Join-Path $argocdDir 'helm-values.yaml'
$appsDir     = Join-Path $argocdDir 'apps'

Write-Section 'Argo CD :: Pre-requisitos'
Assert-Command -Name 'kubectl'
Assert-Command -Name 'helm'
if (-not (Test-Path -LiteralPath $valuesFile)) {
    throw "Arquivo de values nao encontrado: $valuesFile"
}
Write-Step 'kubectl e helm encontrados; helm-values.yaml presente.'

# -----------------------------------------------------------------------------
# Namespace (idempotente: cria apenas se nao existir).
# -----------------------------------------------------------------------------
Write-Section 'Argo CD :: Namespace'
& kubectl get namespace argocd *> $null
if ($LASTEXITCODE -ne 0) {
    Write-Step "Namespace 'argocd' nao existe; criando."
    Invoke-External -FilePath 'kubectl' -Arguments @('create', 'namespace', 'argocd')
} else {
    Write-Step "Namespace 'argocd' ja existe; nada a fazer."
}

# -----------------------------------------------------------------------------
# Repositorio Helm (idempotente).
# -----------------------------------------------------------------------------
Write-Section 'Argo CD :: Repositorio Helm'
Invoke-External -FilePath 'helm' -Arguments @('repo', 'add', 'argo', 'https://argoproj.github.io/argo-helm', '--force-update')
Invoke-External -FilePath 'helm' -Arguments @('repo', 'update', 'argo')

# -----------------------------------------------------------------------------
# Instalacao/atualizacao via helm upgrade --install (idempotente).
# -----------------------------------------------------------------------------
Write-Section 'Argo CD :: helm upgrade --install'
$helmArgs = @(
    'upgrade', '--install', 'argocd', 'argo/argo-cd',
    '--namespace', 'argocd',
    '-f', $valuesFile,
    '--wait',
    '--timeout', ("{0}s" -f $TimeoutSeconds)
)
Invoke-External -FilePath 'helm' -Arguments $helmArgs

# -----------------------------------------------------------------------------
# Aguarda o rollout do argocd-server.
# -----------------------------------------------------------------------------
Write-Section 'Argo CD :: Aguardando rollout'
Invoke-External -FilePath 'kubectl' -Arguments @(
    '-n', 'argocd', 'rollout', 'status', 'deploy/argocd-server',
    ("--timeout={0}s" -f $TimeoutSeconds)
)

# -----------------------------------------------------------------------------
# IngressRoute para /argocd (here-string canalizada para kubectl apply -f -).
# SEM StripPrefix: o argocd-server usa rootpath /argocd (ver helm-values.yaml).
# entryPoints [web]; Hosts xpto.localhost e dev.nvit.com.br.
# kubectl apply e idempotente.
# -----------------------------------------------------------------------------
Write-Section 'Argo CD :: IngressRoute (/argocd)'
$argocdRoute = @'
apiVersion: traefik.io/v1alpha1
kind: IngressRoute
metadata:
  name: argocd-server
  namespace: argocd
  labels:
    app.kubernetes.io/part-of: devops-platform
    app.kubernetes.io/managed-by: install-argocd-script
spec:
  entryPoints:
    - web
  routes:
    - kind: Rule
      match: (Host(`xpto.localhost`) || Host(`dev.nvit.com.br`)) && PathPrefix(`/argocd`)
      priority: 10
      services:
        - name: argocd-server
          port: 80
'@

Write-Step 'Aplicando IngressRoute do Argo CD via kubectl apply -f -'
$argocdRoute | & kubectl apply -f -
if ($LASTEXITCODE -ne 0) {
    throw "Falha ao aplicar a IngressRoute do Argo CD (exit code $LASTEXITCODE)."
}

# -----------------------------------------------------------------------------
# Applications do Argo CD (App-of-apps / aplicacoes individuais).
# Aplica apenas se existir ao menos um manifest em ../platform/argocd/apps.
# -----------------------------------------------------------------------------
Write-Section 'Argo CD :: Applications'
if (Test-Path -LiteralPath $appsDir) {
    $appManifests = Get-ChildItem -LiteralPath $appsDir -Filter '*.yaml' -File -ErrorAction SilentlyContinue
    if ($appManifests -and $appManifests.Count -gt 0) {
        Invoke-External -FilePath 'kubectl' -Arguments @('apply', '-f', $appsDir)
    } else {
        Write-Step "Nenhum manifest .yaml em '$appsDir'; pulando Applications."
    }
} else {
    Write-Step "Pasta '$appsDir' nao existe; pulando Applications."
}

# -----------------------------------------------------------------------------
# Instrucoes de acesso (senha inicial e fallback por port-forward).
# -----------------------------------------------------------------------------
Write-Section 'Argo CD :: Acesso'
Write-Host '  URL (via Traefik): http://xpto.localhost/argocd' -ForegroundColor Green
Write-Host ''
Write-Host '  Usuario inicial: admin' -ForegroundColor White
Write-Host '  Para obter a senha inicial do admin, rode:' -ForegroundColor White
Write-Host ''
Write-Host '    $enc = kubectl -n argocd get secret argocd-initial-admin-secret -o jsonpath="{.data.password}"' -ForegroundColor Yellow
Write-Host '    [Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($enc))' -ForegroundColor Yellow
Write-Host ''

# Tenta exibir a senha automaticamente (best-effort; nao falha o script se ausente).
try {
    $enc = & kubectl -n argocd get secret argocd-initial-admin-secret -o jsonpath='{.data.password}' 2>$null
    if ($LASTEXITCODE -eq 0 -and -not [string]::IsNullOrWhiteSpace($enc)) {
        $pwd = [Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($enc))
        Write-Host "  Senha inicial atual (admin): $pwd" -ForegroundColor Magenta
        Write-Host '  (Recomendado trocar a senha e remover o secret argocd-initial-admin-secret depois.)' -ForegroundColor DarkYellow
    } else {
        Write-Host '  (Secret argocd-initial-admin-secret ainda nao disponivel; pode ja ter sido removido apos a troca de senha.)' -ForegroundColor DarkYellow
    }
} catch {
    Write-Host "  (Nao foi possivel ler a senha inicial automaticamente: $($_.Exception.Message))" -ForegroundColor DarkYellow
}

Write-Host ''
Write-Host '  Fallback de acesso (sem ingress), via port-forward:' -ForegroundColor White
Write-Host '    kubectl port-forward svc/argocd-server -n argocd 8080:80' -ForegroundColor Yellow
Write-Host '    Depois acesse: http://localhost:8080' -ForegroundColor Yellow

Write-Host ''
Write-Host '  [OK] Argo CD instalado/atualizado com sucesso.' -ForegroundColor Green
