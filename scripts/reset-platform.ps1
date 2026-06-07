#requires -Version 7.0
<#
.SYNOPSIS
    Remove (reseta) a plataforma DevOps local do cluster docker-desktop.

.DESCRIPTION
    Faz a desinstalacao idempotente dos componentes instalados via Helm, remove as
    Applications do Argo CD e apaga os namespaces da plataforma. NAO desabilita o
    Kubernetes do Docker Desktop e NAO remove o repositorio local.

    Tudo e idempotente: componentes/namespaces ausentes sao ignorados.

    Pede confirmacao interativa, a menos que -Force seja informado.

.PARAMETER Force
    Pula a confirmacao interativa e executa o reset diretamente.

.EXAMPLE
    pwsh -File C:/devops/scripts/reset-platform.ps1

.EXAMPLE
    pwsh -File C:/devops/scripts/reset-platform.ps1 -Force
#>
[CmdletBinding()]
param(
    [switch]$Force
)

$ErrorActionPreference = 'Continue'

# ---------------------------------------------------------------------------
# Constantes (contrato compartilhado)
# ---------------------------------------------------------------------------
# Releases Helm -> namespace onde foram instalados.
$HelmReleases = @(
    @{ Name = 'traefik';              Namespace = 'traefik' }
    @{ Name = 'argocd';               Namespace = 'argocd' }
    @{ Name = 'kube-prometheus-stack'; Namespace = 'observability' }
    @{ Name = 'loki';                 Namespace = 'observability' }
    @{ Name = 'promtail';             Namespace = 'observability' }
)

# Namespaces a remover ao final.
$Namespaces = @('apps', 'apps-dev', 'apps-prod-local', 'argocd', 'observability', 'traefik', 'devops-system')

$script:Removed = [System.Collections.Generic.List[string]]::new()

# ---------------------------------------------------------------------------
# Funcoes auxiliares
# ---------------------------------------------------------------------------

function Write-Section {
    param([string]$Title)
    Write-Host ''
    Write-Host ('=' * 70) -ForegroundColor Cyan
    Write-Host (" $Title") -ForegroundColor Cyan
    Write-Host ('=' * 70) -ForegroundColor Cyan
}

function Test-CommandExists {
    param([Parameter(Mandatory)][string]$Name)
    return [bool](Get-Command -Name $Name -ErrorAction SilentlyContinue)
}

# ---------------------------------------------------------------------------
# Pre-requisitos minimos
# ---------------------------------------------------------------------------
if (-not (Test-CommandExists -Name 'kubectl')) {
    Write-Host '[FALHA] kubectl ausente; nao e possivel resetar a plataforma.' -ForegroundColor Red
    exit 1
}
$hasHelm = Test-CommandExists -Name 'helm'
if (-not $hasHelm) {
    Write-Host '[AVISO] helm ausente; etapas de helm uninstall serao puladas.' -ForegroundColor Yellow
}

# ---------------------------------------------------------------------------
# Confirmacao
# ---------------------------------------------------------------------------
Write-Section 'Reset da plataforma DevOps local'

Write-Host 'Esta operacao ira REMOVER:' -ForegroundColor Yellow
Write-Host '  - Releases Helm: traefik, argocd, kube-prometheus-stack, loki, promtail' -ForegroundColor Yellow
Write-Host '  - Applications do Argo CD (namespace argocd)' -ForegroundColor Yellow
Write-Host ("  - Namespaces: {0}" -f ($Namespaces -join ', ')) -ForegroundColor Yellow
Write-Host ''
Write-Host 'NAO sera desabilitado o Kubernetes do Docker Desktop, nem alterado o repo local.' -ForegroundColor Gray
Write-Host ''

if (-not $Force) {
    $answer = Read-Host 'Confirmar reset? Digite "sim" para prosseguir'
    if ($answer -ne 'sim') {
        Write-Host 'Operacao cancelada pelo usuario.' -ForegroundColor Cyan
        exit 0
    }
} else {
    Write-Host '-Force informado; prosseguindo sem confirmacao.' -ForegroundColor Yellow
}

# ---------------------------------------------------------------------------
# 1) helm uninstall (ignorando ausentes)
# ---------------------------------------------------------------------------
Write-Section 'Desinstalando releases Helm'

if ($hasHelm) {
    foreach ($rel in $HelmReleases) {
        $name = $rel.Name
        $ns   = $rel.Namespace
        # Verifica se o release existe antes de tentar desinstalar (idempotencia).
        $exists = helm status $name -n $ns 2>$null
        if ($LASTEXITCODE -eq 0 -and $exists) {
            Write-Host "[..] helm uninstall $name -n $ns" -ForegroundColor Yellow
            helm uninstall $name -n $ns 2>$null | Out-Null
            if ($LASTEXITCODE -eq 0) {
                Write-Host "[OK] Release '$name' removido." -ForegroundColor Green
                $script:Removed.Add("helm:$name")
            } else {
                Write-Host "[AVISO] Falha ao remover release '$name' (seguindo)." -ForegroundColor Yellow
            }
        } else {
            Write-Host "[--] Release '$name' (ns $ns) nao encontrado; ignorando." -ForegroundColor Gray
        }
    }
} else {
    Write-Host '[--] helm ausente; pulando uninstall de releases.' -ForegroundColor Gray
}

# ---------------------------------------------------------------------------
# 2) Remover Applications do Argo CD
# ---------------------------------------------------------------------------
Write-Section 'Removendo Applications do Argo CD'

# Verifica se a CRD application existe e se o namespace argocd existe.
$argoNs = kubectl get namespace argocd -o name 2>$null
if ($LASTEXITCODE -eq 0 -and $argoNs) {
    $apps = kubectl get applications.argoproj.io -n argocd -o name 2>$null
    if ($LASTEXITCODE -eq 0 -and $apps) {
        Write-Host '[..] Apagando Applications do Argo CD...' -ForegroundColor Yellow
        # Removemos finalizers para nao travar a exclusao, depois deletamos.
        foreach ($app in $apps) {
            kubectl patch $app -n argocd --type merge -p '{"metadata":{"finalizers":null}}' 2>$null | Out-Null
        }
        kubectl delete applications.argoproj.io --all -n argocd --ignore-not-found 2>$null | Out-Null
        Write-Host '[OK] Applications do Argo CD removidas.' -ForegroundColor Green
        $script:Removed.Add('argocd:applications')
    } else {
        Write-Host '[--] Nenhuma Application do Argo CD encontrada; ignorando.' -ForegroundColor Gray
    }
} else {
    Write-Host '[--] Namespace argocd ausente; pulando remocao de Applications.' -ForegroundColor Gray
}

# ---------------------------------------------------------------------------
# 3) Apagar namespaces
# ---------------------------------------------------------------------------
Write-Section 'Removendo namespaces da plataforma'

foreach ($ns in $Namespaces) {
    $exists = kubectl get namespace $ns -o name 2>$null
    if ($LASTEXITCODE -eq 0 -and $exists) {
        Write-Host "[..] kubectl delete namespace $ns" -ForegroundColor Yellow
        kubectl delete namespace $ns --ignore-not-found 2>$null | Out-Null
        Write-Host "[OK] Namespace '$ns' removido (ou em remocao)." -ForegroundColor Green
        $script:Removed.Add("ns:$ns")
    } else {
        Write-Host "[--] Namespace '$ns' nao encontrado; ignorando." -ForegroundColor Gray
    }
}

# ---------------------------------------------------------------------------
# Resumo
# ---------------------------------------------------------------------------
Write-Section 'Resumo do reset'

if ($script:Removed.Count -gt 0) {
    Write-Host 'Itens removidos:' -ForegroundColor Green
    foreach ($item in $script:Removed) {
        Write-Host "  - $item" -ForegroundColor Green
    }
} else {
    Write-Host 'Nada a remover: a plataforma ja estava ausente (idempotente).' -ForegroundColor Cyan
}

Write-Host ''
Write-Host 'O Kubernetes do Docker Desktop continua habilitado.' -ForegroundColor Gray
Write-Host 'Para reinstalar a plataforma, rode: pwsh -File C:/devops/scripts/bootstrap.ps1' -ForegroundColor Cyan
exit 0
