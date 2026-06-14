#requires -Version 7.0
<#
.SYNOPSIS
    Orquestra a instalacao completa da plataforma DevOps local sobre o
    Kubernetes do Docker Desktop (contexto 'docker-desktop').

.DESCRIPTION
    Script IDEMPOTENTE (seguro re-rodar). Executa, nesta ordem:
      1. kubectl apply dos namespaces da plataforma.
      2. install-traefik.ps1        (Ingress Controller).
         -> aguarda o Traefik ficar Ready antes de seguir.
      3. install-argocd.ps1         (GitOps / Argo CD).
      4. install-observability.ps1  (Prometheus + Grafana + Loki + Promtail).
      5. install-dashboard.ps1      (DevOps Console, somente leitura).
      6. publish-portal.ps1         (Portal NovaIT, landing na raiz "/").

    Ao final, imprime um resumo com as URLs de acesso.

.PARAMETER WithK8sDashboard
    Repassado para install-dashboard.ps1: instala tambem o kubernetes-dashboard.

.PARAMETER SkipObservability
    Pula a etapa de observabilidade (util para ambientes com pouca memoria).

.NOTES
    Requer: kubectl, helm, docker e o contexto kube 'docker-desktop' ativo.
    Os sub-scripts sao resolvidos via $PSScriptRoot (mesma pasta).
#>

[CmdletBinding()]
param(
    # Instala tambem o kubernetes-dashboard (repassado ao install-dashboard.ps1).
    [switch]$WithK8sDashboard,

    # Pula a stack de observabilidade.
    [switch]$SkipObservability
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

# -----------------------------------------------------------------------------
# Funcoes utilitarias de saida (cabecalhos de secao).
# -----------------------------------------------------------------------------
function Write-Section {
    param([Parameter(Mandatory)][string]$Title)
    Write-Host ''
    Write-Host ('#' * 78) -ForegroundColor Blue
    Write-Host "##  $Title" -ForegroundColor Blue
    Write-Host ('#' * 78) -ForegroundColor Blue
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

# Executa um sub-script PowerShell desta mesma pasta, validando a existencia.
function Invoke-SubScript {
    param(
        [Parameter(Mandatory)][string]$Name,
        [hashtable]$ScriptArgs = @{}
    )
    $path = Join-Path $PSScriptRoot $Name
    if (-not (Test-Path -LiteralPath $path)) {
        throw "Sub-script nao encontrado: $path"
    }
    Write-Step "Executando sub-script: $Name"
    # Os sub-scripts usam $ErrorActionPreference='Stop' e 'throw' em caso de falha;
    # como rodam no mesmo escopo via '&', qualquer excecao propaga ate aqui e
    # interrompe a orquestracao. (Nao inspecionamos $LASTEXITCODE: invocar um
    # .ps1 nao o atualiza por si so e, sob StrictMode, le-lo sem um comando
    # nativo previo lancaria erro.)
    & $path @ScriptArgs
}

# -----------------------------------------------------------------------------
# Pre-requisitos globais e checagem do contexto kube.
# -----------------------------------------------------------------------------
Write-Section 'Plataforma DevOps :: Pre-requisitos'
Assert-Command -Name 'kubectl'
Assert-Command -Name 'helm'
Assert-Command -Name 'docker'

$expectedContext = 'docker-desktop'
$currentContext = (& kubectl config current-context 2>$null)
if ($LASTEXITCODE -ne 0) {
    throw "Nao foi possivel obter o contexto kube atual. O cluster do Docker Desktop esta habilitado?"
}
$currentContext = ($currentContext | Out-String).Trim()
if ($currentContext -ne $expectedContext) {
    Write-Host "  [AVISO] Contexto kube atual e '$currentContext' (esperado '$expectedContext')." -ForegroundColor Yellow
    Write-Host "          Ajuste com: kubectl config use-context $expectedContext" -ForegroundColor Yellow
    throw "Contexto kube incorreto. Aborte ou troque para '$expectedContext' e re-execute."
}
Write-Step "Contexto kube confirmado: $currentContext"

# -----------------------------------------------------------------------------
# 1) Namespaces da plataforma.
# -----------------------------------------------------------------------------
Write-Section 'Plataforma DevOps :: 1/6 Namespaces'
$namespacesFile = Join-Path $PSScriptRoot '../platform/namespaces/namespaces.yaml'
if (-not (Test-Path -LiteralPath $namespacesFile)) {
    throw "Arquivo de namespaces nao encontrado: $namespacesFile"
}
Invoke-External -FilePath 'kubectl' -Arguments @('apply', '-f', $namespacesFile)

# -----------------------------------------------------------------------------
# 2) Traefik (Ingress Controller) e espera ficar Ready.
# -----------------------------------------------------------------------------
Write-Section 'Plataforma DevOps :: 2/6 Traefik (Ingress)'
Invoke-SubScript -Name 'install-traefik.ps1'

Write-Step 'Aguardando o Traefik ficar Ready (condition=Available)...'
Invoke-External -FilePath 'kubectl' -Arguments @(
    '-n', 'traefik', 'wait', '--for=condition=Available',
    'deploy/traefik', '--timeout=180s'
)
Write-Step 'Traefik esta Ready.'

# -----------------------------------------------------------------------------
# 3) Argo CD (GitOps).
# -----------------------------------------------------------------------------
Write-Section 'Plataforma DevOps :: 3/6 Argo CD (GitOps)'
Invoke-SubScript -Name 'install-argocd.ps1'

# -----------------------------------------------------------------------------
# 4) Observabilidade (opcional via -SkipObservability).
# -----------------------------------------------------------------------------
Write-Section 'Plataforma DevOps :: 4/6 Observabilidade'
if ($SkipObservability) {
    Write-Step 'Parametro -SkipObservability presente; pulando Prometheus/Grafana/Loki/Promtail.'
} else {
    Invoke-SubScript -Name 'install-observability.ps1'
}

# -----------------------------------------------------------------------------
# 5) DevOps Console (dashboard somente leitura).
# -----------------------------------------------------------------------------
Write-Section 'Plataforma DevOps :: 5/6 DevOps Console'
$dashboardArgs = @{}
if ($WithK8sDashboard) { $dashboardArgs['WithK8sDashboard'] = $true }
Invoke-SubScript -Name 'install-dashboard.ps1' -ScriptArgs $dashboardArgs

# -----------------------------------------------------------------------------
# 6) Portal NovaIT (landing publica na raiz "/", namespace devops-system).
#    GitOps: a TAG da imagem vem do manifest (fonte da verdade). No bootstrap
#    buildamos essa tag a partir do codigo atual (Docker Desktop compartilha o
#    daemon; IfNotPresent) e aplicamos; o Argo passa a reconciliar. Releases
#    depois sao via scripts/publish-portal.ps1 (bump do manifest + git).
# -----------------------------------------------------------------------------
Write-Section 'Plataforma DevOps :: 6/6 Portal NovaIT'
$portalManifest = Join-Path $PSScriptRoot '../portal/k8s/portal.yaml'
$portalDir = Join-Path $PSScriptRoot '../portal/frontend'
$portalMatch = [regex]::Match((Get-Content $portalManifest -Raw), 'image:\s*portal-frontend:(\S+)')
if (-not $portalMatch.Success) { throw "Nao achei 'image: portal-frontend:<tag>' em $portalManifest" }
$portalTag = $portalMatch.Groups[1].Value
Write-Step "Buildando portal-frontend:$portalTag (do codigo atual) + alias :local"
Invoke-External -FilePath 'docker' -Arguments @('build', '-t', "portal-frontend:$portalTag", '-t', 'portal-frontend:local', $portalDir)
Invoke-External -FilePath 'kubectl' -Arguments @('apply', '-f', $portalManifest)
Invoke-External -FilePath 'kubectl' -Arguments @('-n', 'devops-system', 'rollout', 'status', 'deployment/portal', '--timeout=120s')

# -----------------------------------------------------------------------------
# Resumo final com URLs.
# -----------------------------------------------------------------------------
Write-Section 'Plataforma DevOps :: Resumo'
Write-Host ''
Write-Host '  Plataforma instalada/atualizada com sucesso!' -ForegroundColor Green
Write-Host ''
Write-Host '  Acesse os servicos (host local nvit.localhost via Traefik na porta 80):' -ForegroundColor White
Write-Host ''
Write-Host '    DevOps Console : http://nvit.localhost/devops' -ForegroundColor Cyan
Write-Host '    Argo CD        : http://nvit.localhost/argocd' -ForegroundColor Cyan
if (-not $SkipObservability) {
    Write-Host '    Grafana        : http://nvit.localhost/grafana' -ForegroundColor Cyan
}
Write-Host ''
Write-Host '  Dica: para resolver nvit.localhost, confirme que o cabecalho Host chega' -ForegroundColor White
Write-Host '        ao Traefik. Em geral *.localhost ja resolve para 127.0.0.1; caso' -ForegroundColor White
Write-Host '        contrario, adicione "127.0.0.1 nvit.localhost" ao arquivo hosts.' -ForegroundColor White
Write-Host ''
Write-Host '  Senhas iniciais:' -ForegroundColor White
Write-Host '    Argo CD : kubectl -n argocd get secret argocd-initial-admin-secret -o jsonpath="{.data.password}"' -ForegroundColor Yellow
Write-Host '    Grafana : kubectl -n observability get secret kube-prometheus-stack-grafana -o jsonpath="{.data.admin-password}"' -ForegroundColor Yellow
Write-Host '    (decodifique com: [Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($valor)) )' -ForegroundColor Yellow
Write-Host ''
Write-Host '  Proximo passo sugerido: publicar a app de exemplo com' -ForegroundColor White
Write-Host '    ./publish-app.ps1' -ForegroundColor Yellow
Write-Host ''
