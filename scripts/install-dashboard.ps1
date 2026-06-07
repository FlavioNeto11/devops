#requires -Version 7.0
<#
.SYNOPSIS
    Builda as imagens locais do DevOps Console e o publica no namespace
    'devops-system' (rota /devops). Opcionalmente instala o kubernetes-dashboard.

.DESCRIPTION
    Script IDEMPOTENTE (seguro re-rodar). Constroi as imagens 'console-backend:local'
    e 'console-frontend:local' (o Kubernetes do Docker Desktop enxerga imagens locais),
    aplica os manifests em ../console/k8s e aguarda o rollout dos Deployments.

    Roteamento (convencao da plataforma):
      - /devops      -> console-frontend (SPA, base /devops/, SEM strip).
      - /devops/api  -> console-backend  (StripPrefix /devops/api).

    O console e SOMENTE LEITURA (RBAC get/list/watch via ServiceAccount em
    devops-system). As imagens locais usam imagePullPolicy: IfNotPresent.

.PARAMETER WithK8sDashboard
    Quando presente, instala adicionalmente o kubernetes-dashboard via Helm
    (componente opcional, exposto apenas por port-forward).

.NOTES
    Requer: docker, kubectl (e helm apenas se -WithK8sDashboard). Contexto kube
    'docker-desktop' ativo.
#>

[CmdletBinding()]
param(
    # Instala o kubernetes-dashboard opcional (via Helm).
    [switch]$WithK8sDashboard,

    # Timeout (em segundos) usado nos comandos de rollout do kubectl.
    [int]$TimeoutSeconds = 180
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

# Aguarda o rollout de todos os Deployments encontrados em um namespace.
function Wait-Deployments {
    param(
        [Parameter(Mandatory)][string]$Namespace,
        [Parameter(Mandatory)][int]$TimeoutSec
    )
    $names = & kubectl get deploy -n $Namespace -o name 2>$null
    if ($LASTEXITCODE -ne 0 -or [string]::IsNullOrWhiteSpace(($names -join ''))) {
        Write-Step "Nenhum Deployment encontrado no namespace '$Namespace' (ainda)."
        return
    }
    foreach ($n in ($names | Where-Object { $_ -and $_.Trim() })) {
        Invoke-External -FilePath 'kubectl' -Arguments @('-n', $Namespace, 'rollout', 'status', $n.Trim(), ("--timeout={0}s" -f $TimeoutSec))
    }
}

# -----------------------------------------------------------------------------
# Caminhos relativos a este script (../console).
# -----------------------------------------------------------------------------
$consoleDir       = Join-Path $PSScriptRoot '../console'
$backendDockerfile  = Join-Path $consoleDir 'Dockerfile.backend'
$frontendDockerfile = Join-Path $consoleDir 'Dockerfile.frontend'
$consoleK8sDir    = Join-Path $consoleDir 'k8s'

Write-Section 'Console :: Pre-requisitos'
Assert-Command -Name 'docker'
Assert-Command -Name 'kubectl'
foreach ($f in @($backendDockerfile, $frontendDockerfile)) {
    if (-not (Test-Path -LiteralPath $f)) {
        throw "Dockerfile nao encontrado: $f"
    }
}
if (-not (Test-Path -LiteralPath $consoleK8sDir)) {
    throw "Pasta de manifests do console nao encontrada: $consoleK8sDir"
}
Write-Step 'docker e kubectl encontrados; Dockerfiles e manifests presentes.'

# -----------------------------------------------------------------------------
# Build das imagens locais (idempotente: re-build apenas regenera as camadas).
# O contexto de build e a pasta ../console em ambos os casos.
# -----------------------------------------------------------------------------
Write-Section 'Console :: Build das imagens locais'
Invoke-External -FilePath 'docker' -Arguments @('build', '-t', 'console-backend:local',  '-f', $backendDockerfile,  $consoleDir)
Invoke-External -FilePath 'docker' -Arguments @('build', '-t', 'console-frontend:local', '-f', $frontendDockerfile, $consoleDir)

# -----------------------------------------------------------------------------
# Aplica os manifests do console (kubectl apply -f e idempotente).
# -----------------------------------------------------------------------------
Write-Section 'Console :: Aplicando manifests Kubernetes'
Invoke-External -FilePath 'kubectl' -Arguments @('apply', '-f', $consoleK8sDir)

# -----------------------------------------------------------------------------
# Aguarda o rollout dos Deployments do console em devops-system.
# Para garantir que a nova imagem seja recarregada, reinicia os deployments
# (imagePullPolicy IfNotPresent + tag fixa ':local' nao dispara update sozinho).
# -----------------------------------------------------------------------------
Write-Section 'Console :: Rollout em devops-system'
$deployNames = & kubectl get deploy -n devops-system -o name 2>$null
if ($LASTEXITCODE -eq 0 -and -not [string]::IsNullOrWhiteSpace(($deployNames -join ''))) {
    foreach ($n in ($deployNames | Where-Object { $_ -and $_.Trim() })) {
        Invoke-External -FilePath 'kubectl' -Arguments @('-n', 'devops-system', 'rollout', 'restart', $n.Trim())
    }
}
Wait-Deployments -Namespace 'devops-system' -TimeoutSec $TimeoutSeconds

# -----------------------------------------------------------------------------
# Kubernetes Dashboard opcional (-WithK8sDashboard).
# -----------------------------------------------------------------------------
if ($WithK8sDashboard) {
    Write-Section 'Console :: Kubernetes Dashboard (opcional)'
    Assert-Command -Name 'helm'
    Invoke-External -FilePath 'helm' -Arguments @('repo', 'add', 'kubernetes-dashboard', 'https://kubernetes.github.io/dashboard/', '--force-update')
    Invoke-External -FilePath 'helm' -Arguments @('repo', 'update', 'kubernetes-dashboard')
    Invoke-External -FilePath 'helm' -Arguments @(
        'upgrade', '--install', 'kubernetes-dashboard', 'kubernetes-dashboard/kubernetes-dashboard',
        '--namespace', 'devops-system',
        '--wait',
        '--timeout', ("{0}s" -f $TimeoutSeconds)
    )
    Write-Host ''
    Write-Host '  Kubernetes Dashboard instalado em devops-system.' -ForegroundColor Green
    Write-Host '  Acesse via port-forward (recomendado, pois usa HTTPS/proxy proprio):' -ForegroundColor White
    Write-Host '    kubectl -n devops-system port-forward svc/kubernetes-dashboard-kong-proxy 8443:443' -ForegroundColor Yellow
    Write-Host '    Depois acesse: https://localhost:8443' -ForegroundColor Yellow
    Write-Host '  Para gerar um token de acesso (ServiceAccount admin), use:' -ForegroundColor White
    Write-Host '    kubectl -n devops-system create token <service-account>' -ForegroundColor Yellow
} else {
    Write-Section 'Console :: Kubernetes Dashboard (opcional)'
    Write-Step 'Parametro -WithK8sDashboard ausente; pulando instalacao do kubernetes-dashboard.'
}

# -----------------------------------------------------------------------------
# Validacao e resumo.
# -----------------------------------------------------------------------------
Write-Section 'Console :: Validacao'
Invoke-External -FilePath 'kubectl' -Arguments @('get', 'pods', '-n', 'devops-system', '-o', 'wide')

Write-Host ''
Write-Host '  [OK] DevOps Console instalado/atualizado com sucesso.' -ForegroundColor Green
Write-Host '       URL: http://xpto.localhost/devops' -ForegroundColor Green
Write-Host '       (O console e somente leitura: RBAC get/list/watch.)' -ForegroundColor Green
