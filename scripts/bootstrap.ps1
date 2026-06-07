#requires -Version 7.0
<#
.SYNOPSIS
    Orquestrador de bootstrap da plataforma DevOps local de Kubernetes (Windows).

.DESCRIPTION
    Executa, em ordem, os scripts irmaos que preparam a plataforma:
      1) check-prereqs.ps1     (falha rapido se faltar pre-requisito requerido)
      2) install-tools.ps1     (a menos que -SkipTools)
      3) install-platform.ps1  (instala Traefik, Argo CD, observabilidade, console, sample app)
      4) validate-platform.ps1 (valida tudo)

    Ao final imprime um resumo com as URLs de acesso. Avisa que o GitHub Actions
    runner e instalado a parte (install-github-runner.ps1), pois exige um token.

    Usa $PSScriptRoot para localizar os scripts irmaos, entao funciona de qualquer
    diretorio.

.PARAMETER SkipTools
    Pula a etapa install-tools.ps1 (util quando as ferramentas ja estao instaladas).

.EXAMPLE
    pwsh -File C:/devops/scripts/bootstrap.ps1

.EXAMPLE
    pwsh -File C:/devops/scripts/bootstrap.ps1 -SkipTools
#>
[CmdletBinding()]
param(
    [switch]$SkipTools
)

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

function Write-Banner {
    Write-Host ''
    Write-Host '##############################################################' -ForegroundColor Magenta
    Write-Host '#                                                            #' -ForegroundColor Magenta
    Write-Host '#      Plataforma DevOps Local - Kubernetes (Windows)        #' -ForegroundColor Magenta
    Write-Host '#                  Bootstrap / Orquestrador                  #' -ForegroundColor Magenta
    Write-Host '#                                                            #' -ForegroundColor Magenta
    Write-Host '##############################################################' -ForegroundColor Magenta
    Write-Host ("  Data: {0}" -f (Get-Date -Format 'yyyy-MM-dd HH:mm:ss')) -ForegroundColor Gray
    Write-Host ("  Repo: https://github.com/FlavioNeto11/devops") -ForegroundColor Gray
    Write-Host ''
}

# Executa um script irmao via pwsh e aborta o bootstrap se ele retornar codigo != 0.
function Invoke-Step {
    param(
        [Parameter(Mandatory)][string]$ScriptName,
        # IMPORTANTE: usamos splatting por HASHTABLE (e nao por array). Splatting de
        # array passa os elementos como argumentos posicionais e NAO liga parametros
        # do tipo [switch] (ex.: -Fix). Hashtable @{ Fix = $true } liga corretamente.
        [hashtable]$Parameters = @{},
        [string]$Title
    )
    if (-not $Title) { $Title = $ScriptName }
    Write-Section "Etapa: $Title"

    $scriptPath = Join-Path $PSScriptRoot $ScriptName
    if (-not (Test-Path -LiteralPath $scriptPath)) {
        Write-Host "[FALHA] Script nao encontrado: $scriptPath" -ForegroundColor Red
        exit 1
    }

    $argDisplay = ($Parameters.GetEnumerator() | ForEach-Object { "-$($_.Key) $($_.Value)" }) -join ' '
    Write-Host "[..] Executando $ScriptName $argDisplay" -ForegroundColor Yellow

    # Invocamos com o mesmo pwsh atual para herdar a versao 7.
    & $scriptPath @Parameters
    $code = $LASTEXITCODE

    if ($code -ne 0) {
        Write-Host ''
        Write-Host "[FALHA] Etapa '$Title' retornou codigo $code. Abortando bootstrap." -ForegroundColor Red
        exit $code
    }
    Write-Host "[OK] Etapa '$Title' concluida." -ForegroundColor Green
}

# ---------------------------------------------------------------------------
# Inicio
# ---------------------------------------------------------------------------
Write-Banner

# 1) Pre-requisitos (falha rapido). Passamos -Fix para corrigir o contexto kube
#    automaticamente quando possivel.
Invoke-Step -ScriptName 'check-prereqs.ps1' -Parameters @{ Fix = $true } -Title 'Verificacao de pre-requisitos'

# 2) Instalacao de ferramentas (opcional).
if ($SkipTools) {
    Write-Section 'Etapa: Instalacao de ferramentas (PULADA)'
    Write-Host '[..] -SkipTools informado; pulando install-tools.ps1.' -ForegroundColor Yellow
} else {
    Invoke-Step -ScriptName 'install-tools.ps1' -Title 'Instalacao de ferramentas'
}

# 3) Instalacao da plataforma (Traefik, Argo CD, observabilidade, console, sample app).
Invoke-Step -ScriptName 'install-platform.ps1' -Title 'Instalacao da plataforma'

# 4) Validacao.
Invoke-Step -ScriptName 'validate-platform.ps1' -Title 'Validacao da plataforma'

# ---------------------------------------------------------------------------
# Resumo final
# ---------------------------------------------------------------------------
Write-Section 'Bootstrap concluido com sucesso'

Write-Host 'A plataforma esta no ar. URLs de acesso (host local: xpto.localhost):' -ForegroundColor Green
Write-Host ''
Write-Host '  Console DevOps : http://xpto.localhost/devops' -ForegroundColor Cyan
Write-Host '  Console API    : http://xpto.localhost/devops/api' -ForegroundColor Cyan
Write-Host '  Argo CD        : http://xpto.localhost/argocd' -ForegroundColor Cyan
Write-Host '  Grafana        : http://xpto.localhost/grafana' -ForegroundColor Cyan
Write-Host '  App exemplo    : http://xpto.localhost/aplicacao1' -ForegroundColor Cyan
Write-Host '  App exemplo API: http://xpto.localhost/aplicacao1/api/health' -ForegroundColor Cyan
Write-Host ''
Write-Host 'Observacao: se "xpto.localhost" nao resolver, use o header Host apontando' -ForegroundColor Gray
Write-Host 'para 127.0.0.1, por exemplo:' -ForegroundColor Gray
Write-Host '  Invoke-WebRequest -UseBasicParsing -Headers @{ Host = "xpto.localhost" } http://127.0.0.1/devops' -ForegroundColor Gray
Write-Host ''
Write-Host 'HTTPS (websecure) ainda esta PENDENTE (certificado self-signed) - documentado no repo.' -ForegroundColor Yellow
Write-Host ''

Write-Section 'Atencao: GitHub Actions runner (etapa separada)'
Write-Host 'O self-hosted runner NAO e instalado pelo bootstrap porque exige um token.' -ForegroundColor Yellow
Write-Host 'Instale-o separadamente quando desejar CI/CD local:' -ForegroundColor Yellow
Write-Host '  pwsh -File C:/devops/scripts/install-github-runner.ps1' -ForegroundColor Cyan
Write-Host '(O script obtem o token automaticamente se "gh auth login" ja foi feito.)' -ForegroundColor Gray
Write-Host ''
Write-Host '[OK] Bootstrap finalizado.' -ForegroundColor Green
exit 0
