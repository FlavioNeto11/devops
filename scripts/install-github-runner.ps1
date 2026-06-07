#requires -Version 7.0
<#
.SYNOPSIS
    Instala e registra (de forma idempotente) um GitHub Actions self-hosted runner
    para o repositorio FlavioNeto11/devops, rodando como servico do Windows.

.DESCRIPTION
    - Cria a pasta C:/devops/runner.
    - Se o runner ja estiver configurado (existe o arquivo .runner ou ja ha um
      servico actions.runner.*), apenas imprime o status e sai (idempotente).
    - Descobre a versao mais recente do runner via 'gh api', com fallback para uma
      versao fixada caso o gh falhe.
    - Baixa e extrai o pacote do runner (pula o download/extracao se ja existir).
    - Obtem o registration token automaticamente via 'gh api' (POST) quando o gh
      estiver autenticado. Se nao for possivel e nenhum -Token for informado, para
      e imprime os passos manuais EXATOS para obter o token.
    - Configura o runner com config.cmd e o instala como servico.
    - Valida ao final: docker, contexto kube, nodes, status do servico; e lembra
      de fazer 'docker login ghcr.io'.

.PARAMETER Repo
    Repositorio no formato owner/repo. Padrao: FlavioNeto11/devops.

.PARAMETER RunnerVersion
    Versao especifica do runner (sem o 'v'). Vazio = descobrir a mais recente.

.PARAMETER Token
    Registration token do runner. Vazio = tentar obter via gh.

.PARAMETER Labels
    Labels do runner (separadas por virgula).

.EXAMPLE
    pwsh -File C:/devops/scripts/install-github-runner.ps1

.EXAMPLE
    pwsh -File C:/devops/scripts/install-github-runner.ps1 -Token ABC123...
#>
[CmdletBinding()]
param(
    [string]$Repo          = 'FlavioNeto11/devops',
    [string]$RunnerVersion = '',
    [string]$Token         = '',
    [string]$Labels        = 'self-hosted,windows,docker-desktop,local-k8s,flavio-devops'
)

$ErrorActionPreference = 'Stop'

# ---------------------------------------------------------------------------
# Constantes / configuracao
# ---------------------------------------------------------------------------
$RunnerDir       = 'C:/devops/runner'
$RepoUrl         = "https://github.com/$Repo"
# Versao de fallback usada apenas se o gh falhar ao descobrir a mais recente.
$FallbackVersion = '2.319.1'

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

# Verifica se o gh esta autenticado (gh auth status retorna 0 quando logado).
function Test-GhAuthenticated {
    if (-not (Test-CommandExists -Name 'gh')) { return $false }
    try {
        gh auth status 2>$null | Out-Null
        return ($LASTEXITCODE -eq 0)
    } catch {
        return $false
    }
}

# Imprime os passos manuais exatos para obter o registration token.
function Show-ManualTokenSteps {
    Write-Host ''
    Write-Host 'NAO foi possivel obter o registration token automaticamente.' -ForegroundColor Yellow
    Write-Host 'Para concluir o registro do runner, siga EXATAMENTE estes passos:' -ForegroundColor Yellow
    Write-Host ''
    Write-Host '  1) Abra no navegador (logado como FlavioNeto11):' -ForegroundColor White
    Write-Host '     https://github.com/FlavioNeto11/devops/settings/actions/runners/new?arch=x64&os=win' -ForegroundColor Cyan
    Write-Host ''
    Write-Host '  2) Na pagina, localize a secao "Configure" e copie o valor que aparece' -ForegroundColor White
    Write-Host '     logo apos --token na linha do config.cmd, por exemplo:' -ForegroundColor White
    Write-Host '       ./config.cmd --url https://github.com/FlavioNeto11/devops --token AAA...' -ForegroundColor Cyan
    Write-Host '     (copie apenas o token, o trecho AAA...)' -ForegroundColor White
    Write-Host ''
    Write-Host '  3) Re-rode este script informando o token:' -ForegroundColor White
    Write-Host '     pwsh -File C:/devops/scripts/install-github-runner.ps1 -Token <token>' -ForegroundColor Cyan
    Write-Host ''
    Write-Host 'Dica: voce tambem pode rodar "gh auth login" antes para que o token seja' -ForegroundColor White
    Write-Host '      obtido automaticamente nas proximas execucoes.' -ForegroundColor White
}

# ---------------------------------------------------------------------------
# 1) Pasta do runner
# ---------------------------------------------------------------------------
Write-Section 'Preparando a pasta do runner'

if (-not (Test-Path -LiteralPath $RunnerDir)) {
    New-Item -ItemType Directory -Path $RunnerDir -Force | Out-Null
    Write-Host "[OK] Pasta criada: $RunnerDir" -ForegroundColor Green
} else {
    Write-Host "[OK] Pasta ja existe: $RunnerDir" -ForegroundColor Green
}

# ---------------------------------------------------------------------------
# 2) Idempotencia: ja configurado?
# ---------------------------------------------------------------------------
Write-Section 'Verificando se o runner ja esta configurado'

$dotRunnerFile  = Join-Path $RunnerDir '.runner'
$existingService = Get-Service -Name 'actions.runner.*' -ErrorAction SilentlyContinue

if ((Test-Path -LiteralPath $dotRunnerFile) -or $existingService) {
    Write-Host '[OK] Runner ja configurado neste host (idempotente: nada a fazer).' -ForegroundColor Green
    if (Test-Path -LiteralPath $dotRunnerFile) {
        Write-Host "      Arquivo de configuracao: $dotRunnerFile" -ForegroundColor Gray
    }
    if ($existingService) {
        foreach ($svc in $existingService) {
            Write-Host ("      Servico: {0} (Status: {1})" -f $svc.Name, $svc.Status) -ForegroundColor Gray
        }
    }
    Write-Host ''
    Write-Host 'Para reconfigurar do zero: remova o servico com .\svc.cmd uninstall e o' -ForegroundColor Yellow
    Write-Host 'config com .\config.cmd remove --token <token>, depois rode este script novamente.' -ForegroundColor Yellow
    exit 0
}

Write-Host '[..] Runner ainda nao configurado; prosseguindo com a instalacao.' -ForegroundColor Yellow

# ---------------------------------------------------------------------------
# 3) Descobrir a versao do runner
# ---------------------------------------------------------------------------
Write-Section 'Descobrindo a versao do runner'

$version = $RunnerVersion
if ([string]::IsNullOrWhiteSpace($version)) {
    if (Test-CommandExists -Name 'gh') {
        try {
            # tag_name vem no formato "v2.319.1"; removemos o 'v'.
            $tag = gh api repos/actions/runner/releases/latest --jq '.tag_name' 2>$null
            if ($LASTEXITCODE -eq 0 -and $tag) {
                $version = $tag.TrimStart('v').Trim()
                Write-Host "[OK] Versao mais recente descoberta via gh: $version" -ForegroundColor Green
            } else {
                Write-Host "[AVISO] gh nao retornou a versao mais recente; usando fallback $FallbackVersion." -ForegroundColor Yellow
                $version = $FallbackVersion
            }
        } catch {
            Write-Host "[AVISO] Erro ao consultar a versao via gh ($($_.Exception.Message)); usando fallback $FallbackVersion." -ForegroundColor Yellow
            $version = $FallbackVersion
        }
    } else {
        Write-Host "[AVISO] gh ausente; usando versao de fallback $FallbackVersion." -ForegroundColor Yellow
        $version = $FallbackVersion
    }
} else {
    Write-Host "[OK] Usando versao informada via -RunnerVersion: $version" -ForegroundColor Green
}

# ---------------------------------------------------------------------------
# 4) Baixar e extrair o runner (pula se ja extraido)
# ---------------------------------------------------------------------------
Write-Section 'Baixando e extraindo o runner'

$configCmd = Join-Path $RunnerDir 'config.cmd'
if (Test-Path -LiteralPath $configCmd) {
    Write-Host "[OK] Binarios do runner ja extraidos (config.cmd presente); pulando download." -ForegroundColor Green
} else {
    $zipName = "actions-runner-win-x64-$version.zip"
    $zipPath = Join-Path $RunnerDir $zipName
    $zipUrl  = "https://github.com/actions/runner/releases/download/v$version/$zipName"

    if (-not (Test-Path -LiteralPath $zipPath)) {
        Write-Host "[..] Baixando $zipUrl" -ForegroundColor Yellow
        try {
            Invoke-WebRequest -Uri $zipUrl -OutFile $zipPath -UseBasicParsing
            Write-Host "[OK] Download concluido: $zipPath" -ForegroundColor Green
        } catch {
            Write-Host "[FALHA] Erro ao baixar o runner: $($_.Exception.Message)" -ForegroundColor Red
            exit 1
        }
    } else {
        Write-Host "[OK] Pacote ja baixado: $zipPath" -ForegroundColor Green
    }

    Write-Host '[..] Extraindo pacote...' -ForegroundColor Yellow
    try {
        Expand-Archive -LiteralPath $zipPath -DestinationPath $RunnerDir -Force
        Write-Host "[OK] Extraido em $RunnerDir" -ForegroundColor Green
    } catch {
        Write-Host "[FALHA] Erro ao extrair o pacote: $($_.Exception.Message)" -ForegroundColor Red
        exit 1
    }
}

# ---------------------------------------------------------------------------
# 5) Obter o registration token
# ---------------------------------------------------------------------------
Write-Section 'Obtendo o registration token'

if ([string]::IsNullOrWhiteSpace($Token)) {
    if (Test-GhAuthenticated) {
        Write-Host '[..] Solicitando registration token via gh api...' -ForegroundColor Yellow
        try {
            $Token = gh api -X POST "repos/$Repo/actions/runners/registration-token" --jq '.token' 2>$null
            if ($LASTEXITCODE -eq 0 -and $Token) {
                Write-Host '[OK] Registration token obtido automaticamente via gh.' -ForegroundColor Green
            } else {
                Write-Host '[AVISO] gh autenticado, mas nao retornou token (permissao admin no repo?).' -ForegroundColor Yellow
                Show-ManualTokenSteps
                exit 0
            }
        } catch {
            Write-Host "[AVISO] Erro ao obter token via gh: $($_.Exception.Message)" -ForegroundColor Yellow
            Show-ManualTokenSteps
            exit 0
        }
    } else {
        Write-Host '[AVISO] gh nao esta autenticado (ou ausente).' -ForegroundColor Yellow
        Show-ManualTokenSteps
        # Sem token nao ha como prosseguir, mas isto nao e um erro: retornamos 0.
        exit 0
    }
} else {
    Write-Host '[OK] Usando o token informado via -Token.' -ForegroundColor Green
}

# ---------------------------------------------------------------------------
# 6) Configurar o runner (config.cmd) como servico
# ---------------------------------------------------------------------------
Write-Section 'Configurando o runner como servico'

$runnerName = "$(hostname)-devops"
Write-Host "[..] Registrando runner '$runnerName' no repo $Repo com labels: $Labels" -ForegroundColor Yellow

# Executamos config.cmd a partir da pasta do runner sem usar 'cd' (mantendo
# compatibilidade); passamos os argumentos diretamente.
$configExe = Join-Path $RunnerDir 'config.cmd'
try {
    & $configExe --url $RepoUrl --token $Token --labels $Labels --name $runnerName --unattended --runasservice
    $code = $LASTEXITCODE
    if ($code -ne 0) {
        Write-Host "[FALHA] config.cmd retornou codigo $code." -ForegroundColor Red
        exit 1
    }
    Write-Host '[OK] Runner configurado e servico instalado.' -ForegroundColor Green
} catch {
    Write-Host "[FALHA] Erro ao executar config.cmd: $($_.Exception.Message)" -ForegroundColor Red
    exit 1
}

# ---------------------------------------------------------------------------
# 7) Validacao final
# ---------------------------------------------------------------------------
Write-Section 'Validacao final do ambiente do runner'

# docker version
if (Test-CommandExists -Name 'docker') {
    try {
        $dv = docker version --format '{{.Server.Version}}' 2>$null
        if ($LASTEXITCODE -eq 0 -and $dv) {
            Write-Host "[OK] Docker server: $dv" -ForegroundColor Green
        } else {
            Write-Host '[AVISO] docker presente, mas o engine nao respondeu (Docker Desktop rodando?).' -ForegroundColor Yellow
        }
    } catch {
        Write-Host "[AVISO] Erro ao consultar o docker: $($_.Exception.Message)" -ForegroundColor Yellow
    }
} else {
    Write-Host '[AVISO] docker ausente no PATH.' -ForegroundColor Yellow
}

# kubectl current-context
if (Test-CommandExists -Name 'kubectl') {
    try {
        $ctx = kubectl config current-context 2>$null
        if ($LASTEXITCODE -eq 0 -and $ctx) {
            if ($ctx -eq 'docker-desktop') {
                Write-Host "[OK] Contexto kube: $ctx" -ForegroundColor Green
            } else {
                Write-Host "[AVISO] Contexto kube atual e '$ctx' (esperado 'docker-desktop')." -ForegroundColor Yellow
            }
        } else {
            Write-Host '[AVISO] Nao foi possivel obter o contexto kube atual.' -ForegroundColor Yellow
        }
    } catch {
        Write-Host "[AVISO] Erro ao consultar o contexto kube: $($_.Exception.Message)" -ForegroundColor Yellow
    }

    # kubectl get nodes
    try {
        $nodes = kubectl get nodes --no-headers 2>$null
        if ($LASTEXITCODE -eq 0 -and $nodes) {
            $n = ($nodes | Measure-Object).Count
            Write-Host "[OK] Kubernetes acessivel: $n node(s)." -ForegroundColor Green
        } else {
            Write-Host '[AVISO] kubectl get nodes nao retornou nodes.' -ForegroundColor Yellow
        }
    } catch {
        Write-Host "[AVISO] Erro em kubectl get nodes: $($_.Exception.Message)" -ForegroundColor Yellow
    }
} else {
    Write-Host '[AVISO] kubectl ausente no PATH.' -ForegroundColor Yellow
}

# Status do servico do runner
$svc = Get-Service -Name 'actions.runner.*' -ErrorAction SilentlyContinue
if ($svc) {
    foreach ($s in $svc) {
        $color = if ($s.Status -eq 'Running') { 'Green' } else { 'Yellow' }
        Write-Host ("[{0}] Servico do runner: {1} (Status: {2})" -f $(if ($s.Status -eq 'Running') {'OK'} else {'AVISO'}), $s.Name, $s.Status) -ForegroundColor $color
    }
} else {
    Write-Host '[AVISO] Nenhum servico actions.runner.* encontrado apos a configuracao.' -ForegroundColor Yellow
}

# ---------------------------------------------------------------------------
# 8) Lembrete sobre o GHCR
# ---------------------------------------------------------------------------
Write-Section 'Proximo passo: autenticar no GHCR'

Write-Host 'Para que os workflows facam push das imagens no GHCR, autentique o Docker:' -ForegroundColor Cyan
Write-Host '  1) Gere um PAT com escopo write:packages em https://github.com/settings/tokens' -ForegroundColor White
Write-Host '  2) Faca login (usuario em minusculas no GHCR):' -ForegroundColor White
Write-Host '     echo <PAT> | docker login ghcr.io -u flavioneto11 --password-stdin' -ForegroundColor Cyan
Write-Host ''
Write-Host '[OK] Instalacao do runner concluida.' -ForegroundColor Green
exit 0
