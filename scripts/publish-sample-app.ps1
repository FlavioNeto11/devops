#requires -Version 7.0
<#
.SYNOPSIS
    Builda as imagens locais da aplicacao de exemplo 'aplicacao1' e a publica
    no namespace 'apps' (rotas /aplicacao1 e /aplicacao1/api).

.DESCRIPTION
    Script IDEMPOTENTE (seguro re-rodar). Constroi as imagens locais
    'aplicacao1-frontend:local', 'aplicacao1-api:local' e 'aplicacao1-worker:local'
    (o Kubernetes do Docker Desktop enxerga imagens locais), aplica os manifests
    em ../samples/aplicacao1/k8s e aguarda o rollout dos Deployments.

    Roteamento (conforme devops.yaml da aplicacao):
      - /aplicacao1        -> frontend (SPA, base /aplicacao1/, SEM strip).
      - /aplicacao1/api    -> api      (StripPrefix /aplicacao1/api -> backend ve /).
      - worker             -> sem ingress (apenas health interno para probes).

    As imagens locais usam imagePullPolicy: IfNotPresent.

.PARAMETER Rebuild
    Forca o rebuild das imagens sem usar cache do Docker (--no-cache) e reinicia
    os Deployments para recarregar a imagem com a mesma tag ':local'.

.NOTES
    Requer: docker e kubectl. Contexto kube 'docker-desktop' ativo.
#>

[CmdletBinding()]
param(
    # Forca rebuild sem cache e reinicia os deployments.
    [switch]$Rebuild,

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
# Caminhos relativos a este script (../samples/aplicacao1).
# -----------------------------------------------------------------------------
$appDir       = Join-Path $PSScriptRoot '../samples/aplicacao1'
$frontendDir  = Join-Path $appDir 'frontend'
$apiDir       = Join-Path $appDir 'api'
$workerDir    = Join-Path $appDir 'worker'
$appK8sDir    = Join-Path $appDir 'k8s'

Write-Section 'aplicacao1 :: Pre-requisitos'
Assert-Command -Name 'docker'
Assert-Command -Name 'kubectl'
foreach ($d in @($frontendDir, $apiDir, $workerDir, $appK8sDir)) {
    if (-not (Test-Path -LiteralPath $d)) {
        throw "Pasta esperada nao encontrada: $d"
    }
}
Write-Step 'docker e kubectl encontrados; pastas de build e manifests presentes.'

# -----------------------------------------------------------------------------
# Build das imagens locais. Cada servico tem seu proprio contexto/Dockerfile.
# Com -Rebuild, usa --no-cache para regenerar todas as camadas.
# -----------------------------------------------------------------------------
Write-Section 'aplicacao1 :: Build das imagens locais'
$builds = @(
    @{ Tag = 'aplicacao1-frontend:local'; Context = $frontendDir },
    @{ Tag = 'aplicacao1-api:local';      Context = $apiDir },
    @{ Tag = 'aplicacao1-worker:local';   Context = $workerDir }
)
foreach ($b in $builds) {
    $dockerArgs = @('build', '-t', $b.Tag)
    if ($Rebuild) { $dockerArgs += '--no-cache' }
    $dockerArgs += $b.Context
    Invoke-External -FilePath 'docker' -Arguments $dockerArgs
}

# -----------------------------------------------------------------------------
# Aplica os manifests da aplicacao (kubectl apply -f e idempotente).
# -----------------------------------------------------------------------------
Write-Section 'aplicacao1 :: Aplicando manifests Kubernetes'
Invoke-External -FilePath 'kubectl' -Arguments @('apply', '-f', $appK8sDir)

# -----------------------------------------------------------------------------
# Rollout em 'apps'. Com -Rebuild, reinicia os Deployments para recarregar a
# imagem com a mesma tag ':local' (IfNotPresent nao dispara update sozinho).
# -----------------------------------------------------------------------------
Write-Section 'aplicacao1 :: Rollout em apps'
if ($Rebuild) {
    $deployNames = & kubectl get deploy -n apps -o name 2>$null
    if ($LASTEXITCODE -eq 0 -and -not [string]::IsNullOrWhiteSpace(($deployNames -join ''))) {
        foreach ($n in ($deployNames | Where-Object { $_ -and $_.Trim() })) {
            Invoke-External -FilePath 'kubectl' -Arguments @('-n', 'apps', 'rollout', 'restart', $n.Trim())
        }
    }
}
Wait-Deployments -Namespace 'apps' -TimeoutSec $TimeoutSeconds

# -----------------------------------------------------------------------------
# Validacao.
# -----------------------------------------------------------------------------
Write-Section 'aplicacao1 :: Validacao'
Invoke-External -FilePath 'kubectl' -Arguments @('get', 'pods', '-n', 'apps', '-o', 'wide')

# -----------------------------------------------------------------------------
# URLs e comandos de teste.
# -----------------------------------------------------------------------------
Write-Section 'aplicacao1 :: URLs e testes'
Write-Host '  URLs (via Traefik):' -ForegroundColor Green
Write-Host '    Frontend : http://xpto.localhost/aplicacao1' -ForegroundColor Green
Write-Host '    API      : http://xpto.localhost/aplicacao1/api/health' -ForegroundColor Green
Write-Host ''
Write-Host '  Testes diretos no Traefik (sem depender do DNS xpto.localhost),' -ForegroundColor White
Write-Host '  enviando o cabecalho Host manualmente:' -ForegroundColor White
Write-Host ''
Write-Host "    Invoke-WebRequest -Headers @{Host='xpto.localhost'} http://127.0.0.1/aplicacao1" -ForegroundColor Yellow
Write-Host "    Invoke-WebRequest -Headers @{Host='xpto.localhost'} http://127.0.0.1/aplicacao1/api/health" -ForegroundColor Yellow

# Smoke test best-effort do endpoint de health da API (nao falha o script se indisponivel).
Write-Host ''
Write-Step 'Smoke test (best-effort) do endpoint /aplicacao1/api/health...'
try {
    $resp = Invoke-WebRequest -Headers @{ Host = 'xpto.localhost' } -Uri 'http://127.0.0.1/aplicacao1/api/health' -TimeoutSec 10 -SkipHttpErrorCheck
    Write-Host ("  Health respondeu HTTP {0}." -f [int]$resp.StatusCode) -ForegroundColor Magenta
} catch {
    Write-Host "  (Smoke test nao concluido agora: $($_.Exception.Message))" -ForegroundColor DarkYellow
    Write-Host '  Isso e normal se o Traefik/pods ainda estiverem subindo. Tente novamente em alguns segundos.' -ForegroundColor DarkYellow
}

Write-Host ''
Write-Host '  [OK] aplicacao1 publicada/atualizada com sucesso.' -ForegroundColor Green
