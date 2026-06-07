#requires -Version 7.0
<#
.SYNOPSIS
    Verifica os pre-requisitos da plataforma DevOps local de Kubernetes (Windows).

.DESCRIPTION
    Checa a presenca das ferramentas de linha de comando obrigatorias e opcionais,
    se o engine do Docker esta rodando, se o Kubernetes esta habilitado no Docker
    Desktop e se o contexto kube atual e 'docker-desktop'.

    Imprime uma tabela com o resultado de cada verificacao usando os marcadores
    [OK] / [FALTANDO] / [AVISO]. Retorna codigo de saida 1 se algum item
    REQUERIDO estiver faltando.

.PARAMETER Fix
    Quando presente, tenta corrigir automaticamente o que for possivel. Hoje a unica
    correcao automatica e trocar o contexto kube para 'docker-desktop'
    (kubectl config use-context docker-desktop).

.EXAMPLE
    pwsh -File C:/devops/scripts/check-prereqs.ps1

.EXAMPLE
    pwsh -File C:/devops/scripts/check-prereqs.ps1 -Fix
#>
[CmdletBinding()]
param(
    [switch]$Fix
)

# Para erros nao tratados, abortamos; cada verificacao usa try/catch propriamente.
$ErrorActionPreference = 'Stop'

# Contexto kube esperado (contrato compartilhado).
$ExpectedContext = 'docker-desktop'

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

# Acumulador de resultados para montar a tabela ao final.
$script:Results = [System.Collections.Generic.List[pscustomobject]]::new()

function Add-Result {
    param(
        [Parameter(Mandatory)][string]$Name,
        [Parameter(Mandatory)][ValidateSet('OK', 'FALTANDO', 'AVISO')][string]$Status,
        [string]$Detail = '',
        # Indica se a falha deste item deve fazer o script retornar erro.
        [bool]$Required = $true
    )
    $script:Results.Add([pscustomobject]@{
        Name     = $Name
        Status   = $Status
        Detail   = $Detail
        Required = $Required
    })
}

# Verifica se um comando existe no PATH.
function Test-CommandExists {
    param([Parameter(Mandatory)][string]$Name)
    return [bool](Get-Command -Name $Name -ErrorAction SilentlyContinue)
}

# Verifica a presenca de uma CLI requerida (ou opcional) registrando o resultado.
function Test-Tool {
    param(
        [Parameter(Mandatory)][string]$Command,
        [string]$Label = $null,
        [bool]$Required = $true,
        # Comando opcional para capturar a versao (executado apenas se a CLI existir).
        [scriptblock]$VersionScript = $null
    )
    if (-not $Label) { $Label = $Command }

    if (Test-CommandExists -Name $Command) {
        $detail = ''
        if ($VersionScript) {
            try {
                $detail = (& $VersionScript) -join ' '
            } catch {
                $detail = '(versao indisponivel)'
            }
        }
        Add-Result -Name $Label -Status 'OK' -Detail $detail -Required $Required
        return $true
    }

    if ($Required) {
        Add-Result -Name $Label -Status 'FALTANDO' -Detail 'CLI nao encontrada no PATH' -Required $true
    } else {
        Add-Result -Name $Label -Status 'AVISO' -Detail 'CLI opcional nao encontrada' -Required $false
    }
    return $false
}

# ---------------------------------------------------------------------------
# 1) Ferramentas de linha de comando
# ---------------------------------------------------------------------------
Write-Section 'Verificando ferramentas de linha de comando'

Test-Tool -Command 'git'     -Label 'git'     -Required $true  -VersionScript { (git --version) } | Out-Null
Test-Tool -Command 'gh'      -Label 'gh (GitHub CLI)' -Required $true -VersionScript { (gh --version | Select-Object -First 1) } | Out-Null
$dockerCliPresent = Test-Tool -Command 'docker' -Label 'docker (CLI)' -Required $true -VersionScript { (docker --version) }
Test-Tool -Command 'kubectl' -Label 'kubectl' -Required $true  -VersionScript { (kubectl version --client -o yaml 2>$null | Select-String 'gitVersion' | Select-Object -First 1).ToString().Trim() } | Out-Null
Test-Tool -Command 'helm'    -Label 'helm'    -Required $true  -VersionScript { (helm version --short) } | Out-Null
Test-Tool -Command 'node'    -Label 'node'    -Required $true  -VersionScript { (node --version) } | Out-Null

# dotnet e opcional: util para o desenvolvimento de servicos .NET, mas nao bloqueia a plataforma.
Test-Tool -Command 'dotnet'  -Label 'dotnet (SDK, opcional)' -Required $false -VersionScript { (dotnet --version) } | Out-Null

# ---------------------------------------------------------------------------
# 2) Versao do PowerShell (>= 7)
# ---------------------------------------------------------------------------
Write-Section 'Verificando versao do PowerShell'

$psVersion = $PSVersionTable.PSVersion
if ($psVersion.Major -ge 7) {
    Add-Result -Name 'PowerShell >= 7' -Status 'OK' -Detail "$psVersion" -Required $true
} else {
    Add-Result -Name 'PowerShell >= 7' -Status 'FALTANDO' -Detail "Encontrado $psVersion; instale o PowerShell 7+" -Required $true
}

# ---------------------------------------------------------------------------
# 3) Engine do Docker rodando
# ---------------------------------------------------------------------------
Write-Section 'Verificando engine do Docker'

if ($dockerCliPresent) {
    try {
        # 'docker info' so retorna 0 se o engine estiver acessivel.
        $null = docker info 2>$null
        if ($LASTEXITCODE -eq 0) {
            $serverVersion = (docker version --format '{{.Server.Version}}' 2>$null)
            Add-Result -Name 'Docker engine rodando' -Status 'OK' -Detail "Server $serverVersion" -Required $true
        } else {
            Add-Result -Name 'Docker engine rodando' -Status 'FALTANDO' -Detail 'docker info falhou; inicie o Docker Desktop' -Required $true
        }
    } catch {
        Add-Result -Name 'Docker engine rodando' -Status 'FALTANDO' -Detail "Erro ao consultar o engine: $($_.Exception.Message)" -Required $true
    }
} else {
    Add-Result -Name 'Docker engine rodando' -Status 'FALTANDO' -Detail 'CLI docker ausente; nao foi possivel checar o engine' -Required $true
}

# ---------------------------------------------------------------------------
# 4) Kubernetes habilitado e contexto correto
# ---------------------------------------------------------------------------
Write-Section 'Verificando Kubernetes (Docker Desktop)'

if (Test-CommandExists -Name 'kubectl') {
    # 4a) Kubernetes habilitado: kubectl get nodes responde?
    try {
        $nodes = kubectl get nodes --no-headers 2>$null
        if ($LASTEXITCODE -eq 0 -and $nodes) {
            $nodeCount = ($nodes | Measure-Object).Count
            Add-Result -Name 'Kubernetes habilitado' -Status 'OK' -Detail "$nodeCount node(s) acessivel(is)" -Required $true
        } else {
            Add-Result -Name 'Kubernetes habilitado' -Status 'FALTANDO' -Detail 'kubectl get nodes nao retornou nodes; habilite o Kubernetes no Docker Desktop' -Required $true
        }
    } catch {
        Add-Result -Name 'Kubernetes habilitado' -Status 'FALTANDO' -Detail "Erro em kubectl get nodes: $($_.Exception.Message)" -Required $true
    }

    # 4b) Contexto atual deve ser docker-desktop.
    try {
        $currentContext = (kubectl config current-context 2>$null)
        if ($LASTEXITCODE -ne 0) { $currentContext = $null }

        if ($currentContext -eq $ExpectedContext) {
            Add-Result -Name "Contexto kube = $ExpectedContext" -Status 'OK' -Detail "Atual: $currentContext" -Required $true
        } else {
            if ($Fix) {
                Write-Host "  -Fix ativo: trocando contexto para '$ExpectedContext'..." -ForegroundColor Yellow
                try {
                    kubectl config use-context $ExpectedContext | Out-Null
                    $currentContext = (kubectl config current-context 2>$null)
                    if ($currentContext -eq $ExpectedContext) {
                        Add-Result -Name "Contexto kube = $ExpectedContext" -Status 'OK' -Detail 'Corrigido via -Fix' -Required $true
                    } else {
                        Add-Result -Name "Contexto kube = $ExpectedContext" -Status 'FALTANDO' -Detail "Falha ao trocar contexto (atual: $currentContext)" -Required $true
                    }
                } catch {
                    Add-Result -Name "Contexto kube = $ExpectedContext" -Status 'FALTANDO' -Detail "Erro ao trocar contexto: $($_.Exception.Message)" -Required $true
                }
            } else {
                $hint = "Atual: '$currentContext'. Rode com -Fix ou: kubectl config use-context $ExpectedContext"
                Add-Result -Name "Contexto kube = $ExpectedContext" -Status 'FALTANDO' -Detail $hint -Required $true
            }
        }
    } catch {
        Add-Result -Name "Contexto kube = $ExpectedContext" -Status 'FALTANDO' -Detail "Erro ao consultar contexto: $($_.Exception.Message)" -Required $true
    }
} else {
    Add-Result -Name 'Kubernetes habilitado' -Status 'FALTANDO' -Detail 'kubectl ausente' -Required $true
    Add-Result -Name "Contexto kube = $ExpectedContext" -Status 'FALTANDO' -Detail 'kubectl ausente' -Required $true
}

# ---------------------------------------------------------------------------
# Tabela de resultados
# ---------------------------------------------------------------------------
Write-Section 'Resultado das verificacoes'

foreach ($r in $script:Results) {
    $marker = switch ($r.Status) {
        'OK'       { '[OK]' }
        'AVISO'    { '[AVISO]' }
        'FALTANDO' { '[FALTANDO]' }
    }
    $color = switch ($r.Status) {
        'OK'       { 'Green' }
        'AVISO'    { 'Yellow' }
        'FALTANDO' { 'Red' }
    }
    $line = '{0,-12} {1,-28} {2}' -f $marker, $r.Name, $r.Detail
    Write-Host $line -ForegroundColor $color
}

# ---------------------------------------------------------------------------
# Conclusao / codigo de saida
# ---------------------------------------------------------------------------
$missingRequired = @($script:Results | Where-Object { $_.Status -eq 'FALTANDO' -and $_.Required })
$warnings        = @($script:Results | Where-Object { $_.Status -eq 'AVISO' })

Write-Host ''
if ($missingRequired.Count -gt 0) {
    Write-Host "RESULTADO: $($missingRequired.Count) pre-requisito(s) REQUERIDO(S) faltando." -ForegroundColor Red
    Write-Host 'Sugestao: rode C:/devops/scripts/install-tools.ps1 para instalar o que faltar.' -ForegroundColor Yellow
    if ($warnings.Count -gt 0) {
        Write-Host "(Tambem ha $($warnings.Count) aviso(s) nao bloqueante(s).)" -ForegroundColor Yellow
    }
    exit 1
}

if ($warnings.Count -gt 0) {
    Write-Host "RESULTADO: todos os requeridos OK, com $($warnings.Count) aviso(s) opcional(is)." -ForegroundColor Yellow
} else {
    Write-Host 'RESULTADO: todos os pre-requisitos OK.' -ForegroundColor Green
}
exit 0
