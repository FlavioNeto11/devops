#requires -Version 7.0
<#
.SYNOPSIS
    Executa as validacoes obrigatorias da plataforma DevOps local e imprime
    PASS/FAIL colorido para cada verificacao.

.DESCRIPTION
    Cada verificacao e isolada em try/catch e registrada como PASS, FAIL ou SKIP.
    Ao final imprime um resumo. Retorna codigo de saida diferente de zero se
    houver qualquer FAIL.

    Para os checks HTTP usamos:
        Invoke-WebRequest -UseBasicParsing -Headers @{ Host = 'xpto.localhost' } http://127.0.0.1/<path>
    Assim o roteamento por Host do Traefik funciona mesmo sem entrada no arquivo
    hosts do Windows.

.NOTES
    Contrato compartilhado:
      - Contexto kube: docker-desktop
      - Host de teste: xpto.localhost
      - Namespaces: devops-system, traefik, argocd, observability, apps, apps-dev, apps-prod-local
      - Repo git: https://github.com/FlavioNeto11/devops
#>
[CmdletBinding()]
param()

# Nao queremos abortar no primeiro erro: cada check trata seus proprios erros.
$ErrorActionPreference = 'Continue'

# ---------------------------------------------------------------------------
# Constantes (contrato compartilhado)
# ---------------------------------------------------------------------------
$ExpectedContext = 'docker-desktop'
$TestHost        = 'xpto.localhost'
$RepoExpected    = 'https://github.com/FlavioNeto11/devops'
$RepoSlug        = 'FlavioNeto11/devops'
$RepoPath        = 'C:/devops'
$Namespaces      = @('devops-system', 'traefik', 'argocd', 'observability', 'apps', 'apps-dev', 'apps-prod-local')

# ---------------------------------------------------------------------------
# Infraestrutura de checagem
# ---------------------------------------------------------------------------

function Write-Section {
    param([string]$Title)
    Write-Host ''
    Write-Host ('=' * 70) -ForegroundColor Cyan
    Write-Host (" $Title") -ForegroundColor Cyan
    Write-Host ('=' * 70) -ForegroundColor Cyan
}

$script:Checks = [System.Collections.Generic.List[pscustomobject]]::new()

# Executa um check (scriptblock que deve retornar $true/$false) e imprime o resultado.
# Em caso de excecao, conta como FAIL (a menos que -AllowSkipOnError aponte SKIP).
function Invoke-Check {
    param(
        [Parameter(Mandatory)][string]$Name,
        [Parameter(Mandatory)][scriptblock]$Test,
        # Se o teste lancar a string 'SKIP', registramos SKIP em vez de FAIL.
        [switch]$AllowSkip
    )
    $detail = ''
    $status = 'FAIL'
    try {
        $result = & $Test
        # O scriptblock pode devolver $true/$false ou uma string de detalhe via Write-Output.
        if ($result -is [array]) {
            # Ultimo valor e o booleano; demais sao detalhe.
            $bool   = [bool]$result[-1]
            $detail = ($result[0..($result.Count - 2)] -join ' ')
            $status = if ($bool) { 'PASS' } else { 'FAIL' }
        } else {
            $status = if ([bool]$result) { 'PASS' } else { 'FAIL' }
        }
    } catch {
        if ($AllowSkip -and $_.Exception.Message -eq 'SKIP') {
            $status = 'SKIP'
            $detail = 'pre-condicao ausente'
        } elseif ($_.Exception.Message -like 'SKIP:*') {
            $status = 'SKIP'
            $detail = $_.Exception.Message.Substring(5).Trim()
        } else {
            $status = 'FAIL'
            $detail = $_.Exception.Message
        }
    }

    $marker = "[$status]"
    $color  = switch ($status) {
        'PASS' { 'Green' }
        'FAIL' { 'Red' }
        'SKIP' { 'Yellow' }
    }
    $line = '{0,-8} {1}' -f $marker, $Name
    if ($detail) { $line += "  ($detail)" }
    Write-Host $line -ForegroundColor $color

    $script:Checks.Add([pscustomobject]@{ Name = $Name; Status = $status; Detail = $detail })
}

function Test-CommandExists {
    param([Parameter(Mandatory)][string]$Name)
    return [bool](Get-Command -Name $Name -ErrorAction SilentlyContinue)
}

# Faz uma requisicao HTTP via Traefik usando o header Host. Retorna o status code
# ou lanca excecao em erro de transporte. (4xx/5xx tambem chegam como excecao no
# Invoke-WebRequest, entao tratamos via -SkipHttpErrorCheck quando disponivel.)
function Invoke-PlatformHttp {
    param(
        [Parameter(Mandatory)][string]$Path,
        [int]$TimeoutSec = 10,
        # NoRedirect: devolve a PRIMEIRA resposta sem seguir 3xx. Necessario para
        # rotas atras do SSO (oauth2-proxy responde 302 para o login em HTTPS;
        # seguir o redirect quebraria por TLS/host fora do escopo deste check).
        [switch]$NoRedirect
    )
    $url = "http://127.0.0.1$Path"
    $extra = @{}
    # MaximumRedirection 0 devolve a resposta 3xx mas emite um erro NAO-terminante
    # ("maximum redirection count exceeded") — silenciamos para nao sujar o relatorio.
    if ($NoRedirect) { $extra.MaximumRedirection = 0; $extra.ErrorAction = 'SilentlyContinue' }
    $resp = Invoke-WebRequest -Uri $url -UseBasicParsing -Headers @{ Host = $TestHost } `
        -TimeoutSec $TimeoutSec -SkipHttpErrorCheck @extra
    return $resp
}

# Verifica se gh esta autenticado.
function Test-GhAuthenticated {
    if (-not (Test-CommandExists -Name 'gh')) { return $false }
    try {
        gh auth status 2>$null | Out-Null
        return ($LASTEXITCODE -eq 0)
    } catch { return $false }
}

# ---------------------------------------------------------------------------
# Inicio das validacoes
# ---------------------------------------------------------------------------
Write-Section 'Validacao da plataforma DevOps local'

# --- Pre-requisitos de CLI (apenas para orientar; nao contam como FAIL) ---
$hasKubectl = Test-CommandExists -Name 'kubectl'
$hasDocker  = Test-CommandExists -Name 'docker'
$hasGit     = Test-CommandExists -Name 'git'
$hasGh      = Test-CommandExists -Name 'gh'
$hasHelm    = Test-CommandExists -Name 'helm'

# 1) Docker rodando
Invoke-Check -Name 'Docker engine rodando' -Test {
    if (-not $hasDocker) { throw 'SKIP: CLI docker ausente' }
    $null = docker info 2>$null
    return ($LASTEXITCODE -eq 0)
} -AllowSkip

# 2) Kubernetes habilitado
Invoke-Check -Name 'Kubernetes habilitado (get nodes)' -Test {
    if (-not $hasKubectl) { throw 'SKIP: kubectl ausente' }
    $nodes = kubectl get nodes --no-headers 2>$null
    $ok = ($LASTEXITCODE -eq 0 -and $nodes)
    Write-Output ("{0} node(s)" -f (($nodes | Measure-Object).Count))
    Write-Output $ok
} -AllowSkip

# 3) Contexto docker-desktop
Invoke-Check -Name "Contexto kube = $ExpectedContext" -Test {
    if (-not $hasKubectl) { throw 'SKIP: kubectl ausente' }
    $ctx = kubectl config current-context 2>$null
    Write-Output "atual: $ctx"
    Write-Output ($ctx -eq $ExpectedContext)
} -AllowSkip

# 4) Namespaces existem
Invoke-Check -Name 'Namespaces da plataforma existem' -Test {
    if (-not $hasKubectl) { throw 'SKIP: kubectl ausente' }
    $existing = kubectl get namespace -o name 2>$null
    if ($LASTEXITCODE -ne 0) { return $false }
    # 'namespace/xxx'
    $names = $existing | ForEach-Object { ($_ -replace '^namespace/', '') }
    $missing = @($Namespaces | Where-Object { $_ -notin $names })
    if ($missing.Count -gt 0) {
        Write-Output ("faltando: {0}" -f ($missing -join ', '))
        Write-Output $false
    } else {
        Write-Output 'todos presentes'
        Write-Output $true
    }
} -AllowSkip

# 5) Pods do Traefik Ready
Invoke-Check -Name 'Traefik: pods Ready' -Test {
    if (-not $hasKubectl) { throw 'SKIP: kubectl ausente' }
    # jsonpath para condicao Ready de cada pod do traefik
    $ready = kubectl get pods -n traefik -l app.kubernetes.io/name=traefik `
        -o 'jsonpath={range .items[*]}{.status.conditions[?(@.type=="Ready")].status}{"\n"}{end}' 2>$null
    if ($LASTEXITCODE -ne 0 -or -not $ready) {
        # fallback: qualquer pod no namespace traefik
        $ready = kubectl get pods -n traefik `
            -o 'jsonpath={range .items[*]}{.status.conditions[?(@.type=="Ready")].status}{"\n"}{end}' 2>$null
    }
    $lines = @($ready -split "`n" | Where-Object { $_.Trim() -ne '' })
    if ($lines.Count -eq 0) { Write-Output 'nenhum pod do traefik'; Write-Output $false; return }
    $allReady = -not ($lines | Where-Object { $_.Trim() -ne 'True' })
    Write-Output ("{0}/{1} Ready" -f (@($lines | Where-Object { $_.Trim() -eq 'True' }).Count), $lines.Count)
    Write-Output $allReady
} -AllowSkip

# 6) Traefik respondendo via HTTP (entrypoint web)
Invoke-Check -Name 'Traefik respondendo (HTTP :80)' -Test {
    # Mesmo um 404 do Traefik indica que ele esta no ar respondendo.
    $resp = Invoke-PlatformHttp -Path '/'
    Write-Output ("HTTP {0}" -f $resp.StatusCode)
    Write-Output ($resp.StatusCode -ge 200 -and $resp.StatusCode -lt 600)
}

# 7) Argo CD instalado
Invoke-Check -Name 'Argo CD instalado (deploy)' -Test {
    if (-not $hasKubectl) { throw 'SKIP: kubectl ausente' }
    $deps = kubectl get deploy -n argocd -o name 2>$null
    Write-Output ("{0} deployment(s)" -f (@($deps).Count))
    Write-Output ($LASTEXITCODE -eq 0 -and $deps)
} -AllowSkip

# 8) Console publicado (deploy + HTTP /devops)
Invoke-Check -Name 'Console: deployments em devops-system' -Test {
    if (-not $hasKubectl) { throw 'SKIP: kubectl ausente' }
    $deps = kubectl get deploy -n devops-system -o name 2>$null
    Write-Output ("{0} deployment(s)" -f (@($deps).Count))
    Write-Output ($LASTEXITCODE -eq 0 -and $deps)
} -AllowSkip

Invoke-Check -Name 'Console: HTTP /devops responde (200 ou 302 do SSO)' -Test {
    # O console fica atras do oauth2-proxy: sem sessao, a resposta correta e um
    # 302 para o login (Keycloak). 200 = servido direto; ambos = console vivo.
    $resp = Invoke-PlatformHttp -Path '/devops' -NoRedirect
    Write-Output ("HTTP {0}" -f $resp.StatusCode)
    Write-Output ($resp.StatusCode -eq 200 -or $resp.StatusCode -eq 302)
}

# 9) Sample app aplicacao1 (deploy + HTTP /aplicacao1 e /aplicacao1/api/health)
Invoke-Check -Name 'Sample app: deployments em apps' -Test {
    if (-not $hasKubectl) { throw 'SKIP: kubectl ausente' }
    $deps = kubectl get deploy -n apps -o name 2>$null
    Write-Output ("{0} deployment(s)" -f (@($deps).Count))
    Write-Output ($LASTEXITCODE -eq 0 -and $deps)
} -AllowSkip

Invoke-Check -Name 'Sample app: HTTP /aplicacao1 responde 200' -Test {
    $resp = Invoke-PlatformHttp -Path '/aplicacao1'
    Write-Output ("HTTP {0}" -f $resp.StatusCode)
    Write-Output ($resp.StatusCode -eq 200)
}

Invoke-Check -Name 'Sample app: HTTP /aplicacao1/api/health responde 200' -Test {
    $resp = Invoke-PlatformHttp -Path '/aplicacao1/api/health'
    Write-Output ("HTTP {0}" -f $resp.StatusCode)
    Write-Output ($resp.StatusCode -eq 200)
}

# 10) Roteamento por path funcionando (frontend != api)
Invoke-Check -Name 'Roteamento por path (/aplicacao1 vs /aplicacao1/api/health)' -Test {
    $front = Invoke-PlatformHttp -Path '/aplicacao1'
    $api   = Invoke-PlatformHttp -Path '/aplicacao1/api/health'
    # Ambos devem responder 200; o teste confirma que os dois prefixos roteiam.
    $ok = ($front.StatusCode -eq 200 -and $api.StatusCode -eq 200)
    Write-Output ("front={0} api={1}" -f $front.StatusCode, $api.StatusCode)
    Write-Output $ok
}

# 11) Logs visiveis (kubectl logs de um pod do console retorna linhas)
Invoke-Check -Name 'Logs visiveis (console)' -Test {
    if (-not $hasKubectl) { throw 'SKIP: kubectl ausente' }
    # Pega o primeiro pod do backend do console.
    $pod = kubectl get pods -n devops-system -l app=console-backend -o name 2>$null | Select-Object -First 1
    if (-not $pod) {
        # fallback: qualquer pod do namespace
        $pod = kubectl get pods -n devops-system -o name 2>$null | Select-Object -First 1
    }
    if (-not $pod) { Write-Output 'nenhum pod no console'; Write-Output $false; return }
    $logs = kubectl logs -n devops-system $pod --tail=20 2>$null
    $count = @($logs | Where-Object { $_ -ne '' }).Count
    Write-Output ("{0} linha(s) de log" -f $count)
    Write-Output ($count -gt 0)
} -AllowSkip

# 12) Runner registrado (se gh autenticado)
Invoke-Check -Name 'GitHub runner registrado' -Test {
    if (-not (Test-GhAuthenticated)) { throw 'SKIP: gh nao autenticado' }
    $len = gh api "repos/$RepoSlug/actions/runners" --jq 'length' 2>$null
    if ($LASTEXITCODE -ne 0) { throw 'SKIP: gh api falhou' }
    Write-Output ("{0} runner(s)" -f $len)
    Write-Output ([int]$len -ge 1)
} -AllowSkip

# 13) GHCR autenticado (~/.docker/config.json contem ghcr.io)
Invoke-Check -Name 'GHCR autenticado (docker config)' -Test {
    $cfgPath = Join-Path $HOME '.docker/config.json'
    if (-not (Test-Path -LiteralPath $cfgPath)) { Write-Output 'config.json ausente'; Write-Output $false; return }
    $raw = Get-Content -LiteralPath $cfgPath -Raw
    $ok = $raw -match 'ghcr\.io'
    Write-Output ($(if ($ok) { 'entrada ghcr.io encontrada' } else { 'sem entrada ghcr.io' }))
    Write-Output $ok
}

# 14) Repo git correto
Invoke-Check -Name 'Repo git origin correto' -Test {
    if (-not $hasGit) { throw 'SKIP: git ausente' }
    if (-not (Test-Path -LiteralPath $RepoPath)) { throw "SKIP: $RepoPath nao e repo" }
    $url = git -C $RepoPath remote get-url origin 2>$null
    if ($LASTEXITCODE -ne 0) { throw 'SKIP: origin nao configurado' }
    $norm = $url.Trim().TrimEnd('/')
    $norm = $norm -replace '\.git$', ''
    Write-Output "origin: $norm"
    Write-Output ($norm -eq $RepoExpected)
} -AllowSkip

# ---------------------------------------------------------------------------
# Resumo
# ---------------------------------------------------------------------------
Write-Section 'Resumo da validacao'

$pass = @($script:Checks | Where-Object { $_.Status -eq 'PASS' }).Count
$fail = @($script:Checks | Where-Object { $_.Status -eq 'FAIL' }).Count
$skip = @($script:Checks | Where-Object { $_.Status -eq 'SKIP' }).Count
$total = $script:Checks.Count

Write-Host ("Total: {0}  |  PASS: {1}  |  FAIL: {2}  |  SKIP: {3}" -f $total, $pass, $fail, $skip) `
    -ForegroundColor $(if ($fail -gt 0) { 'Red' } else { 'Green' })

if ($fail -gt 0) {
    Write-Host ''
    Write-Host 'Checks com FAIL:' -ForegroundColor Red
    foreach ($c in ($script:Checks | Where-Object { $_.Status -eq 'FAIL' })) {
        Write-Host ("  - {0}{1}" -f $c.Name, $(if ($c.Detail) { " ($($c.Detail))" } else { '' })) -ForegroundColor Red
    }
    Write-Host ''
    Write-Host 'Dica: rode C:/devops/scripts/diagnose.ps1 para coletar diagnostico detalhado.' -ForegroundColor Yellow
    exit 1
}

Write-Host ''
if ($skip -gt 0) {
    Write-Host "Validacao concluida sem FAIL (com $skip check(s) pulado(s))." -ForegroundColor Green
} else {
    Write-Host 'Validacao concluida: todos os checks passaram.' -ForegroundColor Green
}
exit 0
