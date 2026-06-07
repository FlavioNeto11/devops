#requires -Version 7.0
<#
.SYNOPSIS
    Instala/atualiza o Ingress Controller Traefik via Helm no namespace 'traefik'.

.DESCRIPTION
    Script IDEMPOTENTE (seguro re-rodar). Adiciona/atualiza o repositorio Helm do
    Traefik, executa 'helm upgrade --install' com os values da plataforma, aguarda
    o rollout do Deployment e aplica os Middlewares e a IngressRoute do dashboard.

    Convencao da plataforma:
      - Entrypoints: web (porta 80) e websecure (porta 443).
      - CRDs do Traefik: IngressRoute e Middleware (traefik.io/v1alpha1).
      - Rotas locais usam entryPoints [web] (HTTP). HTTPS/websecure fica pendente.

.NOTES
    Requer: kubectl, helm e contexto kube 'docker-desktop' ativo.
#>

[CmdletBinding()]
param(
    # Timeout (em segundos) usado nos comandos de rollout/wait do kubectl.
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

# Executa um comando externo e lanca excecao se o exit code for != 0.
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
# Caminhos relativos a este script (../platform/traefik).
# -----------------------------------------------------------------------------
$traefikDir          = Join-Path $PSScriptRoot '../platform/traefik'
$valuesFile          = Join-Path $traefikDir 'values.yaml'
$middlewaresFile     = Join-Path $traefikDir 'middlewares.yaml'
$dashboardRouteFile  = Join-Path $traefikDir 'dashboard-ingressroute.yaml'

Write-Section 'Traefik :: Pre-requisitos'
Assert-Command -Name 'kubectl'
Assert-Command -Name 'helm'

foreach ($f in @($valuesFile, $middlewaresFile, $dashboardRouteFile)) {
    if (-not (Test-Path -LiteralPath $f)) {
        throw "Arquivo de manifest/values nao encontrado: $f"
    }
}
Write-Step 'kubectl e helm encontrados; arquivos de configuracao presentes.'

# -----------------------------------------------------------------------------
# Repositorio Helm (idempotente: 'helm repo add' apenas atualiza se ja existe).
# -----------------------------------------------------------------------------
Write-Section 'Traefik :: Repositorio Helm'
Invoke-External -FilePath 'helm' -Arguments @('repo', 'add', 'traefik', 'https://traefik.github.io/charts', '--force-update')
Invoke-External -FilePath 'helm' -Arguments @('repo', 'update', 'traefik')

# -----------------------------------------------------------------------------
# Instalacao/atualizacao via helm upgrade --install (idempotente).
# -----------------------------------------------------------------------------
Write-Section 'Traefik :: helm upgrade --install'
$helmArgs = @(
    'upgrade', '--install', 'traefik', 'traefik/traefik',
    '--namespace', 'traefik',
    '--create-namespace',
    '-f', $valuesFile,
    '--wait',
    '--timeout', ("{0}s" -f $TimeoutSeconds)
)
Invoke-External -FilePath 'helm' -Arguments $helmArgs

# -----------------------------------------------------------------------------
# Aguarda o Deployment do Traefik ficar disponivel.
# -----------------------------------------------------------------------------
Write-Section 'Traefik :: Aguardando rollout'
Invoke-External -FilePath 'kubectl' -Arguments @(
    '-n', 'traefik', 'rollout', 'status', 'deploy/traefik',
    ("--timeout={0}s" -f $TimeoutSeconds)
)

# -----------------------------------------------------------------------------
# Aplica Middlewares (StripPrefix etc.) e a IngressRoute do dashboard.
# kubectl apply e idempotente por natureza.
# -----------------------------------------------------------------------------
Write-Section 'Traefik :: Middlewares e IngressRoute do dashboard'
Invoke-External -FilePath 'kubectl' -Arguments @('apply', '-f', $middlewaresFile)
Invoke-External -FilePath 'kubectl' -Arguments @('apply', '-f', $dashboardRouteFile)

# -----------------------------------------------------------------------------
# Validacao final.
# -----------------------------------------------------------------------------
Write-Section 'Traefik :: Validacao'
Invoke-External -FilePath 'kubectl' -Arguments @('get', 'pods', '-n', 'traefik', '-o', 'wide')

Write-Host ''
Write-Host '  [OK] Traefik instalado/atualizado com sucesso.' -ForegroundColor Green
Write-Host '       Entrypoints: web (80) e websecure (443).' -ForegroundColor Green
Write-Host '       HTTPS/websecure permanece pendente (certificado self-signed).' -ForegroundColor Yellow
