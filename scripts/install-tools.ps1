#requires -Version 7.0
<#
.SYNOPSIS
    Instala (de forma idempotente) as ferramentas de linha de comando necessarias
    para a plataforma DevOps local, usando o winget.

.DESCRIPTION
    Para cada ferramenta, verifica primeiro se o comando ja existe (Get-Command).
    Se ja existir, apenas registra como "ja presente" e nao reinstala. Caso
    contrario, instala via:

        winget install -e --id <id> --silent --accept-package-agreements --accept-source-agreements

    NAO instala o Docker Desktop: assume-se que ele ja esta instalado. Apenas
    verifica a presenca da CLI 'docker' e avisa caso esteja ausente.

    Ao final imprime um resumo do que foi instalado, do que ja estava presente e
    de eventuais falhas.

.NOTES
    Algumas instalacoes (Node, .NET, kubectl) adicionam entradas ao PATH que so
    ficam visiveis em uma NOVA sessao de shell. Por isso, apos a instalacao, pode
    ser necessario abrir um novo terminal antes de rodar check-prereqs.ps1.
#>
[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'

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

# Acumuladores para o resumo final.
$script:Installed     = [System.Collections.Generic.List[string]]::new()
$script:AlreadyExists = [System.Collections.Generic.List[string]]::new()
$script:Failed        = [System.Collections.Generic.List[string]]::new()
$script:Warnings      = [System.Collections.Generic.List[string]]::new()

# Instala um pacote via winget apenas se o comando correspondente nao existir.
function Install-IfMissing {
    param(
        [Parameter(Mandatory)][string]$Command,   # comando a checar no PATH (ex.: 'git')
        [Parameter(Mandatory)][string]$WingetId,  # id exato no winget (ex.: 'Git.Git')
        [string]$Label = $null,
        [bool]$Optional = $false
    )
    if (-not $Label) { $Label = $Command }

    if (Test-CommandExists -Name $Command) {
        Write-Host "[JA PRESENTE] $Label ('$Command' encontrado no PATH)" -ForegroundColor Green
        $script:AlreadyExists.Add($Label)
        return
    }

    $optTag = if ($Optional) { ' (opcional)' } else { '' }
    Write-Host "[INSTALANDO] $Label$optTag via winget id '$WingetId'..." -ForegroundColor Yellow

    try {
        # Executa o winget. Nao usamos -ErrorAction porque winget e um exe nativo;
        # avaliamos o $LASTEXITCODE.
        winget install -e --id $WingetId --silent --accept-package-agreements --accept-source-agreements
        $code = $LASTEXITCODE

        # winget retorna 0 em sucesso. Tratamos alguns codigos conhecidos como sucesso/nao-erro.
        # -1978335189 (0x8A15002B) = nenhuma atualizacao aplicavel / ja instalado.
        if ($code -eq 0) {
            Write-Host "[OK] $Label instalado." -ForegroundColor Green
            $script:Installed.Add($Label)
        }
        elseif ($code -eq -1978335189) {
            Write-Host "[JA PRESENTE] $Label ja estava instalado segundo o winget." -ForegroundColor Green
            $script:AlreadyExists.Add($Label)
        }
        else {
            $msg = "winget retornou codigo $code para '$WingetId'"
            if ($Optional) {
                Write-Host "[AVISO] ${Label}: $msg (opcional, seguindo)." -ForegroundColor Yellow
                $script:Warnings.Add("$Label ($msg)")
            } else {
                Write-Host "[FALHA] ${Label}: $msg" -ForegroundColor Red
                $script:Failed.Add("$Label ($msg)")
            }
        }
    }
    catch {
        $msg = $_.Exception.Message
        if ($Optional) {
            Write-Host "[AVISO] ${Label}: erro ao instalar ($msg) - opcional, seguindo." -ForegroundColor Yellow
            $script:Warnings.Add("$Label ($msg)")
        } else {
            Write-Host "[FALHA] ${Label}: erro ao instalar ($msg)" -ForegroundColor Red
            $script:Failed.Add("$Label ($msg)")
        }
    }
}

# ---------------------------------------------------------------------------
# 0) Pre-condicao: winget disponivel
# ---------------------------------------------------------------------------
Write-Section 'Verificando o winget'

if (-not (Test-CommandExists -Name 'winget')) {
    Write-Host '[FALHA] winget nao encontrado.' -ForegroundColor Red
    Write-Host 'Instale o "App Installer" pela Microsoft Store ou atualize o Windows e tente novamente.' -ForegroundColor Yellow
    exit 1
}
Write-Host '[OK] winget disponivel.' -ForegroundColor Green

# ---------------------------------------------------------------------------
# 1) Docker Desktop: NAO instalamos, apenas verificamos
# ---------------------------------------------------------------------------
Write-Section 'Verificando Docker (nao sera instalado)'

if (Test-CommandExists -Name 'docker') {
    Write-Host '[JA PRESENTE] docker (CLI) encontrado. (Docker Desktop nao e instalado por este script.)' -ForegroundColor Green
    $script:AlreadyExists.Add('docker (CLI)')
} else {
    Write-Host '[AVISO] docker (CLI) ausente. Instale o Docker Desktop manualmente e habilite o Kubernetes.' -ForegroundColor Yellow
    Write-Host '        Download: https://www.docker.com/products/docker-desktop/' -ForegroundColor Yellow
    $script:Warnings.Add('docker (Docker Desktop deve ser instalado manualmente)')
}

# ---------------------------------------------------------------------------
# 2) Ferramentas obrigatorias via winget
# ---------------------------------------------------------------------------
Write-Section 'Instalando ferramentas obrigatorias (se faltarem)'

Install-IfMissing -Command 'git'     -WingetId 'Git.Git'              -Label 'Git'
Install-IfMissing -Command 'gh'      -WingetId 'GitHub.cli'           -Label 'GitHub CLI (gh)'
Install-IfMissing -Command 'kubectl' -WingetId 'Kubernetes.kubectl'   -Label 'kubectl'
Install-IfMissing -Command 'helm'    -WingetId 'Helm.Helm'            -Label 'Helm'
Install-IfMissing -Command 'node'    -WingetId 'OpenJS.NodeJS.LTS'    -Label 'Node.js LTS'
Install-IfMissing -Command 'dotnet'  -WingetId 'Microsoft.DotNet.SDK.8' -Label '.NET SDK 8'

# ---------------------------------------------------------------------------
# 3) Ferramentas opcionais via winget
# ---------------------------------------------------------------------------
Write-Section 'Instalando ferramentas opcionais (se faltarem)'

Install-IfMissing -Command 'k9s'  -WingetId 'Derailed.k9s'         -Label 'k9s (TUI Kubernetes)' -Optional $true
Install-IfMissing -Command 'pwsh' -WingetId 'Microsoft.PowerShell' -Label 'PowerShell 7'         -Optional $true

# ---------------------------------------------------------------------------
# Resumo final
# ---------------------------------------------------------------------------
Write-Section 'Resumo da instalacao'

Write-Host ("Instalados agora : {0}" -f ($(if ($script:Installed.Count) { $script:Installed -join ', ' } else { '(nenhum)' }))) -ForegroundColor Green
Write-Host ("Ja presentes     : {0}" -f ($(if ($script:AlreadyExists.Count) { $script:AlreadyExists -join ', ' } else { '(nenhum)' }))) -ForegroundColor Green

if ($script:Warnings.Count -gt 0) {
    Write-Host ("Avisos           : {0}" -f ($script:Warnings -join '; ')) -ForegroundColor Yellow
}

if ($script:Failed.Count -gt 0) {
    Write-Host ("Falhas           : {0}" -f ($script:Failed -join '; ')) -ForegroundColor Red
    Write-Host ''
    Write-Host 'Algumas instalacoes obrigatorias falharam. Reveja as mensagens acima.' -ForegroundColor Red
    exit 1
}

Write-Host ''
Write-Host 'DICA: abra um NOVO terminal para que o PATH atualizado seja carregado e' -ForegroundColor Cyan
Write-Host '      em seguida rode: pwsh -File C:/devops/scripts/check-prereqs.ps1' -ForegroundColor Cyan
exit 0
