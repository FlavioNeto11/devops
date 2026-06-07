#requires -Version 7.0
<#
.SYNOPSIS
    Instala/atualiza a stack de observabilidade no namespace 'observability':
    kube-prometheus-stack (Prometheus + Grafana + Alertmanager), Loki e Promtail.

.DESCRIPTION
    Script IDEMPOTENTE (seguro re-rodar). Adiciona/atualiza os repositorios Helm,
    executa 'helm upgrade --install' para cada componente com os values da
    plataforma, e publica o Grafana no subpath /grafana via IngressRoute do Traefik.

    Roteamento (convencao da plataforma):
      - /grafana -> service 'kube-prometheus-stack-grafana' (porta 80), entryPoints [web].
      - SEM StripPrefix: o Grafana usa serve_from_sub_path + root_url .../grafana
        (configurado em grafana-values.yaml), portanto serve sob o subpath.

.NOTES
    Requer: kubectl, helm e contexto kube 'docker-desktop' ativo.
#>

[CmdletBinding()]
param(
    # Timeout (em segundos) usado nos comandos helm/kubectl.
    [int]$TimeoutSeconds = 600
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

# -----------------------------------------------------------------------------
# Caminhos relativos a este script (../platform/observability).
# -----------------------------------------------------------------------------
$obsDir            = Join-Path $PSScriptRoot '../platform/observability'
$prometheusValues  = Join-Path $obsDir 'prometheus-values.yaml'
$grafanaValues     = Join-Path $obsDir 'grafana-values.yaml'
$lokiValues        = Join-Path $obsDir 'loki-values.yaml'

Write-Section 'Observabilidade :: Pre-requisitos'
Assert-Command -Name 'kubectl'
Assert-Command -Name 'helm'
foreach ($f in @($prometheusValues, $grafanaValues, $lokiValues)) {
    if (-not (Test-Path -LiteralPath $f)) {
        throw "Arquivo de values nao encontrado: $f"
    }
}
Write-Step 'kubectl e helm encontrados; arquivos de values presentes.'

# -----------------------------------------------------------------------------
# Repositorios Helm (idempotente).
# -----------------------------------------------------------------------------
Write-Section 'Observabilidade :: Repositorios Helm'
Invoke-External -FilePath 'helm' -Arguments @('repo', 'add', 'prometheus-community', 'https://prometheus-community.github.io/helm-charts', '--force-update')
Invoke-External -FilePath 'helm' -Arguments @('repo', 'add', 'grafana', 'https://grafana.github.io/helm-charts', '--force-update')
Invoke-External -FilePath 'helm' -Arguments @('repo', 'update', 'prometheus-community', 'grafana')

# -----------------------------------------------------------------------------
# kube-prometheus-stack (Prometheus + Grafana + Alertmanager).
# Dois arquivos de values: prometheus-values.yaml e grafana-values.yaml.
# -----------------------------------------------------------------------------
Write-Section 'Observabilidade :: kube-prometheus-stack'
$kpsArgs = @(
    'upgrade', '--install', 'kube-prometheus-stack', 'prometheus-community/kube-prometheus-stack',
    '--namespace', 'observability',
    '--create-namespace',
    '-f', $prometheusValues,
    '-f', $grafanaValues,
    '--wait',
    '--timeout', ("{0}s" -f $TimeoutSeconds)
)
Invoke-External -FilePath 'helm' -Arguments $kpsArgs

# -----------------------------------------------------------------------------
# Loki (armazenamento de logs).
# -----------------------------------------------------------------------------
Write-Section 'Observabilidade :: Loki'
$lokiArgs = @(
    'upgrade', '--install', 'loki', 'grafana/loki',
    '--namespace', 'observability',
    '-f', $lokiValues,
    '--wait',
    '--timeout', ("{0}s" -f $TimeoutSeconds)
)
Invoke-External -FilePath 'helm' -Arguments $lokiArgs

# -----------------------------------------------------------------------------
# Promtail (coletor de logs -> Loki).
# A URL do client aponta para o service do Loki no namespace observability.
# -----------------------------------------------------------------------------
Write-Section 'Observabilidade :: Promtail'
$promtailArgs = @(
    'upgrade', '--install', 'promtail', 'grafana/promtail',
    '--namespace', 'observability',
    '--set', 'config.clients[0].url=http://loki.observability:3100/loki/api/v1/push',
    '--wait',
    '--timeout', ("{0}s" -f $TimeoutSeconds)
)
Invoke-External -FilePath 'helm' -Arguments $promtailArgs

# -----------------------------------------------------------------------------
# IngressRoute para /grafana (here-string canalizada para kubectl apply -f -).
# SEM StripPrefix: o Grafana usa serve_from_sub_path (ver grafana-values.yaml).
# entryPoints [web]; Hosts xpto.localhost e dev.nvit.com.br.
# -----------------------------------------------------------------------------
Write-Section 'Observabilidade :: IngressRoute (/grafana)'
$grafanaRoute = @'
apiVersion: traefik.io/v1alpha1
kind: IngressRoute
metadata:
  name: grafana
  namespace: observability
  labels:
    app.kubernetes.io/part-of: devops-platform
    app.kubernetes.io/managed-by: install-observability-script
spec:
  entryPoints:
    - web
  routes:
    - kind: Rule
      match: (Host(`xpto.localhost`) || Host(`dev.nvit.com.br`)) && PathPrefix(`/grafana`)
      priority: 10
      services:
        - name: kube-prometheus-stack-grafana
          port: 80
'@

Write-Step 'Aplicando IngressRoute do Grafana via kubectl apply -f -'
$grafanaRoute | & kubectl apply -f -
if ($LASTEXITCODE -ne 0) {
    throw "Falha ao aplicar a IngressRoute do Grafana (exit code $LASTEXITCODE)."
}

# -----------------------------------------------------------------------------
# Validacao.
# -----------------------------------------------------------------------------
Write-Section 'Observabilidade :: Validacao'
Invoke-External -FilePath 'kubectl' -Arguments @('get', 'pods', '-n', 'observability', '-o', 'wide')

# -----------------------------------------------------------------------------
# Instrucoes de acesso (senha do Grafana).
# -----------------------------------------------------------------------------
Write-Section 'Observabilidade :: Acesso ao Grafana'
Write-Host '  URL (via Traefik): http://xpto.localhost/grafana' -ForegroundColor Green
Write-Host ''
Write-Host '  Usuario: admin' -ForegroundColor White
Write-Host '  Para obter a senha do admin do Grafana, rode:' -ForegroundColor White
Write-Host ''
Write-Host '    $enc = kubectl -n observability get secret kube-prometheus-stack-grafana -o jsonpath="{.data.admin-password}"' -ForegroundColor Yellow
Write-Host '    [Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($enc))' -ForegroundColor Yellow
Write-Host ''

# Tenta exibir a senha automaticamente (best-effort).
try {
    $enc = & kubectl -n observability get secret kube-prometheus-stack-grafana -o jsonpath='{.data.admin-password}' 2>$null
    if ($LASTEXITCODE -eq 0 -and -not [string]::IsNullOrWhiteSpace($enc)) {
        $pwd = [Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($enc))
        Write-Host "  Senha atual (admin): $pwd" -ForegroundColor Magenta
    } else {
        Write-Host '  (Secret kube-prometheus-stack-grafana ainda nao disponivel.)' -ForegroundColor DarkYellow
    }
} catch {
    Write-Host "  (Nao foi possivel ler a senha automaticamente: $($_.Exception.Message))" -ForegroundColor DarkYellow
}

Write-Host ''
Write-Host '  [OK] Stack de observabilidade instalada/atualizada com sucesso.' -ForegroundColor Green
