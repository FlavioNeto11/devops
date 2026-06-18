#requires -Version 7.0
<#
.SYNOPSIS
  FORGE — Fase C (scaffold determinístico) de um produto greenfield. Cria o
  ESQUELETO completo de um app novo no golden path a partir de
  specs/products/<name>/product.json + o blueprint curado.
.DESCRIPTION
  Este script é HUMANO-run (não Claude). Por isso PODE criar os arquivos que a
  DENYLIST do guard bloqueia para o Claude (devops.yaml em apps/<name>, k8s, CI,
  Application do Argo em platform/, registros). O Claude (fase D) só preenche
  apps/<name>/** depois.

  O que faz (idempotente — aborta se apps/<name> já existe, salvo -Force):
    1. Lê product.json + blueprint.json.
    2. Roda scripts/new-app.ps1 (gera app + k8s + CI + Application do Argo).
    3. Overlay do blueprint: Postgres (se db), secret.example, meta-docs
       (CLAUDE.md/AGENTS.md/README) semeadas do brief, e um smoke test.
    4. Imprime o CHECKLIST de registros (Console/Portal/Compartilhados) a aplicar
       no mesmo PR de bootstrap (curado, humano).

  NÃO escreve segredos reais. NÃO commita (o humano revisa e abre o PR de bootstrap).
.EXAMPLE
  .\scripts\scaffold-product.ps1 -Name crm
.EXAMPLE
  .\scripts\scaffold-product.ps1 -Name crm -WhatIfOnly   # só mostra o que faria
#>
[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)][string]$Name,
  [string]$SpecsDir = 'C:\devops\specs',
  [string]$OutDir = 'C:\devops\apps',
  [string]$ArgoAppsDir = 'C:\devops\platform\argocd\apps',
  [switch]$NoArgo,
  [switch]$Force,
  [switch]$WhatIfOnly
)
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
$here = $PSScriptRoot

function Read-Json($p) { Get-Content -Raw -Path $p | ConvertFrom-Json }

# --- 1) carregar produto + blueprint ----------------------------------------
$prodPath = Join-Path $SpecsDir "products\$Name\product.json"
if (-not (Test-Path $prodPath)) { throw "Produto não encontrado: $prodPath. Crie o brief antes (fase A)." }
$prod = Read-Json $prodPath
if ($prod.name -ne $Name) { throw "product.json: name '$($prod.name)' != pasta '$Name'." }
$bpPath = Join-Path $SpecsDir "blueprints\$($prod.blueprint)\blueprint.json"
if (-not (Test-Path $bpPath)) { throw "Blueprint não encontrado: $bpPath (referenciado por product.json)." }
$bp = Read-Json $bpPath

$root = Join-Path $OutDir $Name
$basePath = $prod.base_path
$services = @($bp.services)
$appType = if ($prod.PSObject.Properties.Name -contains 'app_type' -and $prod.app_type) { $prod.app_type } else { 'product_software' }
$ns = if ($prod.PSObject.Properties.Name -contains 'namespace' -and $prod.namespace) { $prod.namespace } else { 'apps' }

Write-Host "== FORGE scaffold: produto '$Name' | blueprint '$($bp.id)@$($bp.version)' | serviços: $($services -join ', ') ==" -ForegroundColor Cyan
Write-Host "   base_path=$basePath  appType=$appType  db=$($bp.db)"

if ((Test-Path $root) -and -not $Force) { throw "apps\$Name já existe. Abortando (idempotência). Use -Force para sobrescrever — CUIDADO: perde o código já implementado." }
if ($WhatIfOnly) { Write-Host "[WhatIf] Rodaria new-app.ps1 + overlays. Saindo sem escrever." -ForegroundColor Yellow; return }

# --- 2) scaffold base (golden path) ------------------------------------------
$newAppArgs = @{
  Name = $Name; BasePath = $basePath; Services = $services; Type = $appType; OutDir = $OutDir; ArgoAppsDir = $ArgoAppsDir
}
if ($Force) { $newAppArgs.Force = $true }
if ($NoArgo) { $newAppArgs.NoArgo = $true }
& (Join-Path $here 'new-app.ps1') @newAppArgs

# --- 3) overlay do blueprint --------------------------------------------------
$k8sDir = Join-Path $root 'k8s'

# 3a) Postgres (se o blueprint declara db) — espelha o padrão SICAT/GymOps.
if ($bp.db -eq 'postgres') {
  $pg = @"
# Postgres do $Name (gerado pelo FORGE scaffold). Secret $Name-db (POSTGRES_*) criado
# no cluster (NÃO versionado). PVC persiste os dados.
apiVersion: v1
kind: PersistentVolumeClaim
metadata: { name: $Name-pgdata, namespace: $ns, labels: { app.kubernetes.io/part-of: $Name } }
spec: { accessModes: ['ReadWriteOnce'], resources: { requests: { storage: 2Gi } } }
---
apiVersion: apps/v1
kind: Deployment
metadata:
  name: $Name-postgres
  namespace: $ns
  labels: { app.kubernetes.io/name: $Name-postgres, app.kubernetes.io/component: database, app.kubernetes.io/part-of: $Name }
spec:
  replicas: 1
  strategy: { type: Recreate }
  selector: { matchLabels: { app.kubernetes.io/name: $Name-postgres } }
  template:
    metadata: { labels: { app.kubernetes.io/name: $Name-postgres, app.kubernetes.io/part-of: $Name } }
    spec:
      containers:
        - name: postgres
          image: postgres:16-alpine
          envFrom: [ { secretRef: { name: $Name-db } } ]
          ports: [ { name: postgres, containerPort: 5432 } ]
          volumeMounts: [ { name: pgdata, mountPath: /var/lib/postgresql/data, subPath: pgdata } ]
          readinessProbe: { exec: { command: ['sh','-c','pg_isready -U `$POSTGRES_USER -d `$POSTGRES_DB'] }, initialDelaySeconds: 5, periodSeconds: 10 }
          resources: { requests: { cpu: 50m, memory: 256Mi }, limits: { cpu: '1', memory: 1Gi } }
      volumes: [ { name: pgdata, persistentVolumeClaim: { claimName: $Name-pgdata } } ]
---
apiVersion: v1
kind: Service
metadata: { name: $Name-postgres, namespace: $ns, labels: { app.kubernetes.io/part-of: $Name } }
spec:
  selector: { app.kubernetes.io/name: $Name-postgres }
  ports: [ { name: postgres, port: 5432, targetPort: postgres } ]
"@
  Set-Content (Join-Path $k8sDir 'postgres.yaml') $pg -Encoding utf8
  # ATENCAO: extensao .tmpl (NAO .yaml). A Application do Argo aponta apps/<app>/k8s com
  # prune+selfHeal; o Argo APLICA todo .yaml/.yml/.json daquele path. Se este template fosse
  # .yaml, o Argo sobrescreveria o Secret real <app>-db com os placeholders CHANGE_ME. Como
  # .tmpl, o Argo o ignora. O Secret real e criado fora do git (Sealed Secrets / kubectl).
  $sec = @"
# Template do Secret do banco — copie para $Name-db.secret.yaml (gitignored) ou use Sealed Secrets.
# NAO e aplicado pelo Argo (extensao .tmpl). NUNCA commite o secret real.
apiVersion: v1
kind: Secret
metadata: { name: $Name-db, namespace: $ns }
stringData:
  POSTGRES_USER: $Name
  POSTGRES_PASSWORD: CHANGE_ME
  POSTGRES_DB: $($Name)_db
  DATABASE_URL: postgres://$($Name):CHANGE_ME@$Name-postgres:5432/$($Name)_db
"@
  Set-Content (Join-Path $k8sDir 'secret.example.yaml.tmpl') $sec -Encoding utf8
  Write-Host "  -> Postgres + secret.example gerados (k8s/postgres.yaml, k8s/secret.example.yaml.tmpl)"

  # Liga a conexao ao banco: injeta `envFrom: secretRef <app>-db` nos containers api/worker do
  # manifesto gerado pelo new-app.ps1 (que e generico e nao conhece o db). Sem isso, DATABASE_URL
  # fica vazio e o `pg` cai em localhost:5432 (ECONNREFUSED) no migrate/seed do boot da api.
  $appYaml = Join-Path $k8sDir "$Name.yaml"
  if (Test-Path $appYaml) {
    $out = [System.Collections.Generic.List[string]]::new()
    $curSvc = $null
    $injected = 0
    foreach ($line in (Get-Content -Path $appYaml)) {
      $out.Add($line)
      if ($line -match '^        - name: (\S+)\s*$') { $curSvc = $Matches[1] }
      elseif ($line -match '^          imagePullPolicy: IfNotPresent\s*$' -and $curSvc -and $curSvc -notmatch '^frontend') {
        $out.Add('          envFrom:')
        $out.Add('            - secretRef:')
        $out.Add("                name: $Name-db")
        $injected++
      }
    }
    Set-Content -Path $appYaml -Value $out -Encoding utf8
    Write-Host "  -> envFrom secretRef '$Name-db' injetado em $injected deployment(s) nao-frontend (api/worker)"
  }
}

# 3b) meta-docs (CLAUDE.md/AGENTS.md/README) semeadas do brief + blueprint.
$reuses = ($bp.reuses -join ', ')
$today = Get-Date -Format 'yyyy-MM-dd'
$claudeMd = @"
---
title: "$($prod.display_name) — Manual para Claude Code"
status: guide
applies_to: [$Name]
updated: $today
language: pt-BR
---

# $($prod.display_name) — Manual para Claude Code

> App GERADO pelo FORGE (produto greenfield) a partir dos requisitos em
> ``specs/requirements/$Name/``. Fronteiras: ``AGENTS.md``. Plataforma:
> ``../../CLAUDE.md`` · Máquina: ``~/.claude/CLAUDE.md``.

## O que é
$($prod.vision)

- **Blueprint:** $($bp.name) ($($bp.id)) — stack: $(( $bp.stack.PSObject.Properties | ForEach-Object { "$($_.Name)=$($_.Value)" } ) -join ' · ').
- **Reusa:** $reuses.
- Roteamento: ``basePath: $basePath`` (frontend sem strip, base ``$basePath/``; API com strip, vê rotas na raiz).

## Como o Claude implementa aqui
Cada requisito ``REQ-$($Name.ToUpper())-*`` vira código DENTRO de ``apps/$Name/**`` (a esteira
abre PR ``Closes-Req``). Consulte a baseline (``specs/baseline/current-baseline.json``) e o
requisito antes de implementar. Mantenha as camadas do blueprint: $((($bp.default_adrs) -join '; ')).

## Regras inegociáveis
Ver ``../../docs/standards/hard-constraints.md`` (labels, roteamento, segredos, GitOps, imagens) +
``../../docs/standards/golden-path.md``. Segredo NUNCA em git.
"@
Set-Content (Join-Path $root 'CLAUDE.md') $claudeMd -Encoding utf8

$agentsMd = @"
---
title: "$($prod.display_name) — contrato de agentes"
status: guide
applies_to: [$Name]
updated: $today
language: pt-BR
---

# $($prod.display_name) — contrato de agentes (AGENTS.md)

## Fronteiras de operação (ver ../../AGENTS.md §5)
- **Seguras (autônomas):** editar código/testes em ``apps/$Name/**``; rodar build/test locais.
- **Com aprovação:** build de imagem, apply no cluster, qualquer deploy, mudança de manifesto fora de ``apps/$Name/k8s``.
- **Proibidas:** segredos em git; tocar ``platform/**``, ``.github/**``, ``specs/**``; force push.

## Blast-radius (esteira)
``product_scope: $Name`` → o guard só permite ``apps/$Name/**``. Registrado em
``specs/products/$Name/product.json``.

## Validação
``npm test`` / ``npm run build`` em cada serviço; smoke em ``apps/$Name/test/smoke.mjs``;
health de cada serviço (``$basePath/api/health`` etc.).
"@
Set-Content (Join-Path $root 'AGENTS.md') $agentsMd -Encoding utf8

# 3c) smoke test stub (o Claude completa os fluxos)
$testDir = Join-Path $root 'test'
New-Item -ItemType Directory -Force -Path $testDir | Out-Null
$smoke = @"
// Smoke E2E do $Name (gerado pelo FORGE; o Claude completa os fluxos CRUD).
// Roda contra a app no ar. Uso: node test/smoke.mjs [baseUrl]
const base = process.argv[2] || 'http://nvit.localhost$basePath';
const got = await fetch(base + '/api/health').then(r => r.status).catch(() => 0);
if (got !== 200) { console.error('[smoke] /api/health != 200 (got ' + got + ')'); process.exit(1); }
console.log('[smoke] OK: health 200');
"@
Set-Content (Join-Path $testDir 'smoke.mjs') $smoke -Encoding utf8

Write-Host "  -> meta-docs (CLAUDE.md/AGENTS.md) + smoke test gerados"

# --- 4) checklist de registros (humano aplica no MESMO PR de bootstrap) -------
Write-Host ""
Write-Host "== Scaffold de '$Name' pronto em apps\$Name (+ Application do Argo em platform\argocd\apps\$Name.yaml) ==" -ForegroundColor Green
Write-Host "PROXIMOS PASSOS (humano, no PR de bootstrap — fora do auto-merge):" -ForegroundColor Yellow
Write-Host "  1. Registrar no Console (Projetos & Tarefas): adicionar entrada em console/pm-api/scripts/seed.js"
Write-Host "       key=$Name name='$($prod.display_name)' app_type=$appType route=$basePath k8s_label_selector='app.kubernetes.io/part-of=$Name'"
Write-Host "  2. Registrar no Portal raiz: card do app em portal/frontend/index.html (#produtos)."
Write-Host "  3. Registrar em Compartilhados: console/pm-api/src/data/shared-resources.json (devops.yaml + packages reusados: $reuses)."
Write-Host "  4. Criar o Secret real do banco ($Name-db) via Sealed Secrets (NUNCA em git)."
Write-Host "  5. Revisar, commitar TUDO num PR de bootstrap (sem label claude-generated) e mergear."
Write-Host "  6. Só então a esteira (fase D) implementa os requisitos REQ-$($Name.ToUpper())-* em apps\$Name\**."
