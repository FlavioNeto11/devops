#requires -Version 7.0
<#
.SYNOPSIS
    Coleta um pacote de diagnostico da plataforma DevOps local em arquivos,
    para facilitar a investigacao de problemas.

.DESCRIPTION
    Cria a pasta C:/devops/diagnostics/<timestamp> e grava nela:
      - all-resources.txt        : kubectl get all -A
      - events.txt               : kubectl get events -A --sort-by=.lastTimestamp
      - ingressroutes.txt        : kubectl get ingressroute,middleware -A
      - describe-not-running.txt : describe dos pods que NAO estao Running
      - traefik-logs.txt         : logs do(s) pod(s) do Traefik
      - console-logs.txt         : logs do(s) pod(s) do Console
      - helm-list.txt            : helm list -A
      - nodes.txt                : kubectl get nodes -o wide
      - SUMMARY.txt              : resumo do ambiente e dos artefatos gerados

    Ao final imprime o caminho da pasta de diagnostico. Idempotente: cada execucao
    cria uma pasta nova com timestamp proprio.

.EXAMPLE
    pwsh -File C:/devops/scripts/diagnose.ps1
#>
[CmdletBinding()]
param()

$ErrorActionPreference = 'Continue'

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

# Executa um comando externo (capturando stdout+stderr) e grava no arquivo destino.
# Sempre escreve algo no arquivo, mesmo em caso de erro, para facilitar a leitura.
function Save-Command {
    param(
        [Parameter(Mandatory)][string]$Description,
        [Parameter(Mandatory)][scriptblock]$Command,
        [Parameter(Mandatory)][string]$OutFile
    )
    Write-Host "[..] $Description -> $([System.IO.Path]::GetFileName($OutFile))" -ForegroundColor Yellow
    $header = @(
        "# ============================================================"
        "# $Description"
        "# Coletado em: $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')"
        "# ============================================================"
        ""
    )
    try {
        # 2>&1 redireciona stderr para a saida; capturamos tudo como texto.
        $output = & $Command 2>&1 | Out-String
        if ([string]::IsNullOrWhiteSpace($output)) {
            $output = '(sem saida)'
        }
        ($header + $output) | Set-Content -LiteralPath $OutFile -Encoding utf8
    } catch {
        ($header + "ERRO ao executar: $($_.Exception.Message)") | Set-Content -LiteralPath $OutFile -Encoding utf8
        Write-Host "    [AVISO] $Description falhou: $($_.Exception.Message)" -ForegroundColor Yellow
    }
}

# ---------------------------------------------------------------------------
# 0) Pre-requisitos
# ---------------------------------------------------------------------------
Write-Section 'Diagnostico da plataforma DevOps local'

if (-not (Test-CommandExists -Name 'kubectl')) {
    Write-Host '[FALHA] kubectl ausente; nao e possivel coletar diagnostico do cluster.' -ForegroundColor Red
    exit 1
}
$hasHelm = Test-CommandExists -Name 'helm'

# ---------------------------------------------------------------------------
# 1) Criar pasta de diagnostico
# ---------------------------------------------------------------------------
$timestamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$diagRoot  = 'C:/devops/diagnostics'
$diagDir   = Join-Path $diagRoot $timestamp

New-Item -ItemType Directory -Path $diagDir -Force | Out-Null
Write-Host "[OK] Pasta de diagnostico: $diagDir" -ForegroundColor Green

# ---------------------------------------------------------------------------
# 2) Coletas gerais
# ---------------------------------------------------------------------------
Write-Section 'Coletando informacoes do cluster'

Save-Command -Description 'kubectl get all -A' `
    -Command { kubectl get all -A } `
    -OutFile (Join-Path $diagDir 'all-resources.txt')

Save-Command -Description 'kubectl get events -A --sort-by=.lastTimestamp' `
    -Command { kubectl get events -A --sort-by='.lastTimestamp' } `
    -OutFile (Join-Path $diagDir 'events.txt')

Save-Command -Description 'kubectl get ingressroute,middleware -A' `
    -Command { kubectl get ingressroute,middleware -A } `
    -OutFile (Join-Path $diagDir 'ingressroutes.txt')

Save-Command -Description 'kubectl get nodes -o wide' `
    -Command { kubectl get nodes -o wide } `
    -OutFile (Join-Path $diagDir 'nodes.txt')

if ($hasHelm) {
    Save-Command -Description 'helm list -A' `
        -Command { helm list -A } `
        -OutFile (Join-Path $diagDir 'helm-list.txt')
} else {
    '(helm ausente; helm list -A nao coletado)' | Set-Content -LiteralPath (Join-Path $diagDir 'helm-list.txt') -Encoding utf8
    Write-Host '[--] helm ausente; helm list -A pulado.' -ForegroundColor Gray
}

# ---------------------------------------------------------------------------
# 3) Describe dos pods que NAO estao Running
# ---------------------------------------------------------------------------
Write-Section 'Coletando describe de pods problematicos'

$describeFile = Join-Path $diagDir 'describe-not-running.txt'
try {
    # Lista pods cujo status.phase nao seja Running, em todos os namespaces.
    # Formato: "<namespace> <pod> <phase>"
    $lines = kubectl get pods -A `
        -o 'jsonpath={range .items[?(@.status.phase!="Running")]}{.metadata.namespace}{" "}{.metadata.name}{" "}{.status.phase}{"\n"}{end}' 2>$null

    $rows = @($lines -split "`n" | Where-Object { $_.Trim() -ne '' })

    if ($rows.Count -eq 0) {
        '(todos os pods estao Running; nada a descrever)' | Set-Content -LiteralPath $describeFile -Encoding utf8
        Write-Host '[OK] Todos os pods estao Running.' -ForegroundColor Green
    } else {
        $buffer = [System.Collections.Generic.List[string]]::new()
        $buffer.Add("# Pods que NAO estao Running (coletado em $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss'))")
        $buffer.Add("# Total: $($rows.Count)")
        $buffer.Add('')
        foreach ($row in $rows) {
            $parts = $row.Trim() -split '\s+'
            $ns   = $parts[0]
            $pod  = $parts[1]
            $phase = $parts[2]
            $buffer.Add('============================================================')
            $buffer.Add("Pod: $ns/$pod  (phase: $phase)")
            $buffer.Add('============================================================')
            Write-Host "[..] describe $ns/$pod ($phase)" -ForegroundColor Yellow
            $desc = kubectl describe pod -n $ns $pod 2>&1 | Out-String
            $buffer.Add($desc)
            $buffer.Add('')
        }
        $buffer -join "`n" | Set-Content -LiteralPath $describeFile -Encoding utf8
        Write-Host "[OK] $($rows.Count) pod(s) nao-Running descrito(s)." -ForegroundColor Green
    }
} catch {
    "ERRO ao coletar pods nao-Running: $($_.Exception.Message)" | Set-Content -LiteralPath $describeFile -Encoding utf8
    Write-Host "[AVISO] Erro ao coletar describe: $($_.Exception.Message)" -ForegroundColor Yellow
}

# ---------------------------------------------------------------------------
# 4) Logs do Traefik
# ---------------------------------------------------------------------------
Write-Section 'Coletando logs do Traefik'

$traefikLogFile = Join-Path $diagDir 'traefik-logs.txt'
try {
    $tpods = kubectl get pods -n traefik -l app.kubernetes.io/name=traefik -o name 2>$null
    if (-not $tpods) {
        $tpods = kubectl get pods -n traefik -o name 2>$null
    }
    $tpods = @($tpods | Where-Object { $_ -ne '' })
    if ($tpods.Count -eq 0) {
        '(nenhum pod do Traefik encontrado no namespace traefik)' | Set-Content -LiteralPath $traefikLogFile -Encoding utf8
        Write-Host '[--] Nenhum pod do Traefik encontrado.' -ForegroundColor Gray
    } else {
        $buffer = [System.Collections.Generic.List[string]]::new()
        foreach ($pod in $tpods) {
            $buffer.Add("# Logs de $pod (ns traefik) - coletado em $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')")
            $buffer.Add('')
            $log = kubectl logs -n traefik $pod --tail=500 2>&1 | Out-String
            $buffer.Add($log)
            $buffer.Add('')
        }
        $buffer -join "`n" | Set-Content -LiteralPath $traefikLogFile -Encoding utf8
        Write-Host "[OK] Logs do Traefik coletados ($($tpods.Count) pod(s))." -ForegroundColor Green
    }
} catch {
    "ERRO ao coletar logs do Traefik: $($_.Exception.Message)" | Set-Content -LiteralPath $traefikLogFile -Encoding utf8
    Write-Host "[AVISO] Erro ao coletar logs do Traefik: $($_.Exception.Message)" -ForegroundColor Yellow
}

# ---------------------------------------------------------------------------
# 5) Logs do Console
# ---------------------------------------------------------------------------
Write-Section 'Coletando logs do Console'

$consoleLogFile = Join-Path $diagDir 'console-logs.txt'
try {
    # Coletamos backend e frontend do console (todos os pods do namespace).
    $cpods = kubectl get pods -n devops-system -o name 2>$null
    $cpods = @($cpods | Where-Object { $_ -ne '' })
    if ($cpods.Count -eq 0) {
        '(nenhum pod encontrado no namespace devops-system)' | Set-Content -LiteralPath $consoleLogFile -Encoding utf8
        Write-Host '[--] Nenhum pod do Console encontrado.' -ForegroundColor Gray
    } else {
        $buffer = [System.Collections.Generic.List[string]]::new()
        foreach ($pod in $cpods) {
            $buffer.Add("# Logs de $pod (ns devops-system) - coletado em $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')")
            $buffer.Add('')
            $log = kubectl logs -n devops-system $pod --tail=500 --all-containers 2>&1 | Out-String
            $buffer.Add($log)
            $buffer.Add('')
        }
        $buffer -join "`n" | Set-Content -LiteralPath $consoleLogFile -Encoding utf8
        Write-Host "[OK] Logs do Console coletados ($($cpods.Count) pod(s))." -ForegroundColor Green
    }
} catch {
    "ERRO ao coletar logs do Console: $($_.Exception.Message)" | Set-Content -LiteralPath $consoleLogFile -Encoding utf8
    Write-Host "[AVISO] Erro ao coletar logs do Console: $($_.Exception.Message)" -ForegroundColor Yellow
}

# ---------------------------------------------------------------------------
# 6) SUMMARY.txt
# ---------------------------------------------------------------------------
Write-Section 'Gerando SUMMARY.txt'

$summaryFile = Join-Path $diagDir 'SUMMARY.txt'

# Coleta alguns metadados para o resumo (tudo tolerante a falha).
$ctx = try { kubectl config current-context 2>$null } catch { '(desconhecido)' }
$nodeCount = try { @(kubectl get nodes --no-headers 2>$null).Count } catch { 0 }
$nsList = try { (kubectl get namespace -o name 2>$null) -replace 'namespace/', '' } catch { @() }
$notRunningCount = try {
    @((kubectl get pods -A -o 'jsonpath={range .items[?(@.status.phase!="Running")]}{.metadata.name}{"\n"}{end}' 2>$null) -split "`n" | Where-Object { $_.Trim() -ne '' }).Count
} catch { 'desconhecido' }
$dockerVer = try {
    if (Test-CommandExists -Name 'docker') { docker version --format '{{.Server.Version}}' 2>$null } else { '(docker ausente)' }
} catch { '(engine nao respondeu)' }

$summary = @"
============================================================
 DIAGNOSTICO DA PLATAFORMA DEVOPS LOCAL
============================================================
 Gerado em        : $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')
 Pasta            : $diagDir
 Host (maquina)   : $(hostname)
 Usuario          : $env:USERNAME
 PowerShell       : $($PSVersionTable.PSVersion)

------------------------------------------------------------
 AMBIENTE
------------------------------------------------------------
 Contexto kube    : $ctx  (esperado: docker-desktop)
 Nodes acessiveis : $nodeCount
 Docker server    : $dockerVer
 Pods nao-Running : $notRunningCount

 Namespaces presentes:
$(($nsList | ForEach-Object { "   - $_" }) -join "`n")

------------------------------------------------------------
 ARQUIVOS COLETADOS
------------------------------------------------------------
   - all-resources.txt        : kubectl get all -A
   - events.txt               : eventos do cluster (ordenados por lastTimestamp)
   - ingressroutes.txt        : IngressRoute e Middleware (Traefik) em todos os ns
   - describe-not-running.txt : describe dos pods que nao estao Running
   - traefik-logs.txt         : logs do(s) pod(s) do Traefik
   - console-logs.txt         : logs do(s) pod(s) do Console
   - helm-list.txt            : helm list -A
   - nodes.txt                : kubectl get nodes -o wide

------------------------------------------------------------
 PROXIMOS PASSOS SUGERIDOS
------------------------------------------------------------
 - Revise events.txt e describe-not-running.txt para causas de falha.
 - Confira ingressroutes.txt se o roteamento por path nao estiver funcionando.
 - Compartilhe esta pasta inteira ao pedir ajuda.
============================================================
"@

$summary | Set-Content -LiteralPath $summaryFile -Encoding utf8
Write-Host "[OK] SUMMARY.txt gerado." -ForegroundColor Green

# ---------------------------------------------------------------------------
# Conclusao
# ---------------------------------------------------------------------------
Write-Section 'Diagnostico concluido'

Write-Host 'Pacote de diagnostico gerado em:' -ForegroundColor Green
Write-Host "  $diagDir" -ForegroundColor Cyan
Write-Host ''
Write-Host 'Arquivos:' -ForegroundColor Green
Get-ChildItem -LiteralPath $diagDir | ForEach-Object {
    Write-Host ("  - {0,-28} {1,8:N0} bytes" -f $_.Name, $_.Length) -ForegroundColor Gray
}
exit 0
