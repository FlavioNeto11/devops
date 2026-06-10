#requires -Version 7.0
<#
.SYNOPSIS
    Valida todo apps/*/devops.yaml e o exemplo canonico
    templates/app-template/app.yaml contra schema/devops-schema.json.

.DESCRIPTION
    Script READ-ONLY. Estrategia em camadas (a primeira disponivel vence):

      1) Node + ajv: usa um node_modules existente com 'ajv' (+ 'js-yaml')
         — por padrao apps/sicat/node_modules — via NODE_PATH. Converte o
         YAML para objeto com js-yaml e valida com ajv (draft-07). Se
         'ajv-formats' existir, e plugado (opcional; o schema atual nao usa
         formats, entao a ausencia nao quebra).

      2) npx ajv-cli: gera um JSON temporario a partir do YAML (tambem via
         js-yaml local, se houver) e roda 'npx --yes ajv-cli validate'. Util
         quando ha rede/cache do npx mas nao um node_modules pronto.

      3) Mensagem clara: se nada disso estiver disponivel (lab offline sem
         ajv vendorizado), explica como habilitar e sai com erro.

    Exit code != 0 em qualquer arquivo invalido ou na ausencia de validador.

.PARAMETER RepoRoot
    Raiz do repo. Default: pasta-mae deste script (C:\devops).

.PARAMETER NodeModulesPath
    node_modules com ajv (+ js-yaml). Default: apps/sicat/node_modules.

.EXAMPLE
    pwsh -File C:\devops\scripts\validate-devops-yaml.ps1

.EXAMPLE
    pwsh -File C:\devops\scripts\validate-devops-yaml.ps1 -NodeModulesPath C:\devops\apps\gymops\node_modules

.NOTES
    Read-only. Schema: schema/devops-schema.json (draft-07).
    Referencia humana do contrato: docs/new-project-contract.md.
#>
[CmdletBinding()]
param(
    [string]$RepoRoot = (Split-Path -Parent $PSScriptRoot),
    [string]$NodeModulesPath
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

# ---------------------------------------------------------------------------
# Constantes / caminhos
# ---------------------------------------------------------------------------
$RepoRoot   = (Resolve-Path -LiteralPath $RepoRoot).Path
$SchemaPath = Join-Path $RepoRoot 'schema/devops-schema.json'

if (-not $NodeModulesPath) {
    $NodeModulesPath = Join-Path $RepoRoot 'apps/sicat/node_modules'
}

function Write-Section {
    param([string]$Title)
    Write-Host ''
    Write-Host ('=' * 72) -ForegroundColor Cyan
    Write-Host (" $Title") -ForegroundColor Cyan
    Write-Host ('=' * 72) -ForegroundColor Cyan
}

function Resolve-RelPath {
    param([string]$Path)
    if ($Path.StartsWith($RepoRoot, [System.StringComparison]::OrdinalIgnoreCase)) {
        return $Path.Substring($RepoRoot.Length).TrimStart('\', '/').Replace('\', '/')
    }
    return $Path
}

# ---------------------------------------------------------------------------
# Descoberta dos alvos: apps/*/devops.yaml + templates/app-template/app.yaml
# ---------------------------------------------------------------------------
function Get-Targets {
    $targets = [System.Collections.Generic.List[string]]::new()

    $appsDir = Join-Path $RepoRoot 'apps'
    if (Test-Path -LiteralPath $appsDir) {
        Get-ChildItem -LiteralPath $appsDir -Directory | ForEach-Object {
            $p = Join-Path $_.FullName 'devops.yaml'
            if (Test-Path -LiteralPath $p) { $targets.Add($p) }
        }
    }

    $tpl = Join-Path $RepoRoot 'templates/app-template/app.yaml'
    if (Test-Path -LiteralPath $tpl) { $targets.Add($tpl) }

    return @($targets)
}

# ---------------------------------------------------------------------------
# Resolucao de ferramentas
# ---------------------------------------------------------------------------
function Get-NodeExe {
    $cmd = Get-Command node -ErrorAction SilentlyContinue
    if ($cmd) { return $cmd.Source }
    return $null
}

function Test-NodeModule {
    param([string]$ModulesRoot, [string]$Name)
    return (Test-Path -LiteralPath (Join-Path $ModulesRoot $Name))
}

# ---------------------------------------------------------------------------
# Camada 1: validacao via Node + ajv (programatica).
# Gera um script Node temporario que carrega ajv + js-yaml a partir do
# NODE_PATH, le o schema e cada YAML, valida e imprime resultado por arquivo.
# Retorna o exit code do Node (0 = tudo valido).
# ---------------------------------------------------------------------------
function Invoke-AjvNode {
    param([string]$NodeExe, [string]$ModulesRoot, [string[]]$Targets)

    $scriptFile = [System.IO.Path]::Combine([System.IO.Path]::GetTempPath(), "validate-devops-$([guid]::NewGuid().ToString('N')).cjs")

    $nodeScript = @'
const fs = require('fs');
const path = require('path');

const schemaPath = process.argv[2];
const targets = process.argv.slice(3);

let Ajv, yaml;
try {
  Ajv = require('ajv');
  yaml = require('js-yaml');
} catch (e) {
  console.error('ERRO: nao foi possivel carregar ajv/js-yaml do NODE_PATH: ' + e.message);
  process.exit(2);
}

const AjvCtor = Ajv.default || Ajv;
const ajv = new AjvCtor({ allErrors: true, strict: false });

// ajv-formats e opcional: o schema atual nao usa "format", mas plugamos se existir.
try {
  const addFormats = require('ajv-formats');
  (addFormats.default || addFormats)(ajv);
} catch (e) {
  // sem ajv-formats: seguimos normalmente.
}

let schema;
try {
  schema = JSON.parse(fs.readFileSync(schemaPath, 'utf8'));
} catch (e) {
  console.error('ERRO: nao foi possivel ler/parsear o schema: ' + e.message);
  process.exit(2);
}

let validate;
try {
  validate = ajv.compile(schema);
} catch (e) {
  console.error('ERRO: nao foi possivel compilar o schema: ' + e.message);
  process.exit(2);
}

let failures = 0;
for (const file of targets) {
  let data;
  try {
    data = yaml.load(fs.readFileSync(file, 'utf8'));
  } catch (e) {
    console.error('  [FAIL] ' + file + ' :: YAML invalido: ' + e.message);
    failures++;
    continue;
  }
  const ok = validate(data);
  if (ok) {
    console.log('  [PASS] ' + file);
  } else {
    failures++;
    console.error('  [FAIL] ' + file);
    for (const err of validate.errors || []) {
      const where = err.instancePath || '(raiz)';
      console.error('         ' + where + ' ' + err.message +
        (err.params ? ' ' + JSON.stringify(err.params) : ''));
    }
  }
}

process.exit(failures > 0 ? 1 : 0);
'@

    Set-Content -LiteralPath $scriptFile -Value $nodeScript -Encoding utf8
    try {
        $prevNodePath = $env:NODE_PATH
        $env:NODE_PATH = $ModulesRoot
        # Captura stdout+stderr e imprime via Write-Host para NAO poluir o
        # valor de retorno da funcao (que deve ser apenas o exit code).
        $output = & $NodeExe $scriptFile $SchemaPath @Targets 2>&1
        $code = $LASTEXITCODE
        foreach ($line in $output) { Write-Host $line }
    } finally {
        $env:NODE_PATH = $prevNodePath
        Remove-Item -LiteralPath $scriptFile -ErrorAction SilentlyContinue
    }
    return [int]$code
}

# ---------------------------------------------------------------------------
# Camada 2: validacao via npx ajv-cli.
# Converte cada YAML em JSON temporario (preferindo js-yaml local; senao,
# tenta o modulo global via require comum) e roda 'npx --yes ajv-cli validate'.
# ---------------------------------------------------------------------------
function Invoke-AjvCli {
    param([string]$NodeExe, [string]$ModulesRoot, [string[]]$Targets)

    $npx = Get-Command npx -ErrorAction SilentlyContinue
    if (-not $npx) { return $null }   # camada indisponivel

    $failures = 0
    $tmpDir = [System.IO.Path]::Combine([System.IO.Path]::GetTempPath(), "devops-yaml-$([guid]::NewGuid().ToString('N'))")
    New-Item -ItemType Directory -Path $tmpDir -Force | Out-Null

    # Script de conversao YAML -> JSON (usa js-yaml local se NODE_PATH apontar).
    $convFile = Join-Path $tmpDir 'yaml2json.cjs'
    $convScript = @'
const fs = require('fs');
const yaml = require('js-yaml');
const data = yaml.load(fs.readFileSync(process.argv[2], 'utf8'));
fs.writeFileSync(process.argv[3], JSON.stringify(data, null, 2));
'@
    Set-Content -LiteralPath $convFile -Value $convScript -Encoding utf8

    try {
        $i = 0
        foreach ($t in $Targets) {
            $i++
            $jsonOut = Join-Path $tmpDir ("target-$i.json")

            $prevNodePath = $env:NODE_PATH
            $env:NODE_PATH = $ModulesRoot
            try {
                & $NodeExe $convFile $t $jsonOut
                $convCode = $LASTEXITCODE
            } finally {
                $env:NODE_PATH = $prevNodePath
            }
            if ($convCode -ne 0 -or -not (Test-Path -LiteralPath $jsonOut)) {
                Write-Host ("  [FAIL] {0} :: falha ao converter YAML->JSON" -f $t) -ForegroundColor Red
                $failures++
                continue
            }

            # ajv-cli: 'validate -s schema -d data'. --spec=draft7 garante o draft.
            & npx --yes ajv-cli validate --spec=draft7 -s $SchemaPath -d $jsonOut 2>&1 | ForEach-Object {
                Write-Host ("      {0}" -f $_)
            }
            if ($LASTEXITCODE -ne 0) {
                Write-Host ("  [FAIL] {0}" -f $t) -ForegroundColor Red
                $failures++
            } else {
                Write-Host ("  [PASS] {0}" -f $t) -ForegroundColor Green
            }
        }
    } finally {
        Remove-Item -LiteralPath $tmpDir -Recurse -Force -ErrorAction SilentlyContinue
    }

    return ($failures -gt 0 ? 1 : 0)
}

# ---------------------------------------------------------------------------
# Execucao
# ---------------------------------------------------------------------------
Write-Section "Validacao de devops.yaml contra o schema"
Write-Host (" Repo:   {0}" -f $RepoRoot) -ForegroundColor DarkGray
Write-Host (" Schema: {0}" -f (Resolve-RelPath $SchemaPath)) -ForegroundColor DarkGray

if (-not (Test-Path -LiteralPath $SchemaPath)) {
    Write-Host ("ERRO: schema nao encontrado em {0}" -f $SchemaPath) -ForegroundColor Red
    exit 2
}

$targets = Get-Targets
if ($targets.Count -eq 0) {
    Write-Host "Nenhum devops.yaml/app.yaml encontrado para validar." -ForegroundColor Yellow
    exit 0
}

Write-Host ''
Write-Host " Alvos:" -ForegroundColor DarkGray
foreach ($t in $targets) { Write-Host ("   - {0}" -f (Resolve-RelPath $t)) -ForegroundColor DarkGray }
Write-Host ''

$nodeExe = Get-NodeExe
if (-not $nodeExe) {
    Write-Host "ERRO: 'node' nao esta no PATH. Instale o Node ou rode no CI (setup-node)." -ForegroundColor Red
    exit 2
}

$hasAjv   = Test-NodeModule -ModulesRoot $NodeModulesPath -Name 'ajv'
$hasYaml  = Test-NodeModule -ModulesRoot $NodeModulesPath -Name 'js-yaml'

$exit = $null

# --- Camada 1: Node + ajv (preferida) ---
if ($hasAjv -and $hasYaml) {
    Write-Host ("Validador: Node + ajv (NODE_PATH={0})" -f (Resolve-RelPath $NodeModulesPath)) -ForegroundColor Cyan
    $exit = Invoke-AjvNode -NodeExe $nodeExe -ModulesRoot $NodeModulesPath -Targets $targets
}
# --- Camada 2: npx ajv-cli (fallback) ---
elseif ($hasYaml) {
    Write-Host "ajv ausente no node_modules; tentando 'npx ajv-cli'..." -ForegroundColor Yellow
    $exit = Invoke-AjvCli -NodeExe $nodeExe -ModulesRoot $NodeModulesPath -Targets $targets
    if ($null -eq $exit) {
        Write-Host "ERRO: 'npx' indisponivel; nao ha como validar." -ForegroundColor Red
        $exit = 2
    }
}
else {
    Write-Host "ajv e js-yaml ausentes; tentando 'npx ajv-cli' (requer rede/cache)..." -ForegroundColor Yellow
    $exit = Invoke-AjvCli -NodeExe $nodeExe -ModulesRoot $NodeModulesPath -Targets $targets
    if ($null -eq $exit) {
        Write-Host '' -ForegroundColor Red
        Write-Host "ERRO: nenhum validador disponivel." -ForegroundColor Red
        Write-Host "  Habilite uma das opcoes:" -ForegroundColor Red
        Write-Host "   1) Instale ajv + js-yaml em algum app (ex.: apps/sicat) e re-rode," -ForegroundColor Red
        Write-Host "      ou passe -NodeModulesPath para um node_modules que os contenha." -ForegroundColor Red
        Write-Host "   2) Garanta acesso ao npx (online) para usar ajv-cli." -ForegroundColor Red
        $exit = 2
    }
}

# ---------------------------------------------------------------------------
# Resumo
# ---------------------------------------------------------------------------
Write-Section "Resumo"
if ($exit -eq 0) {
    Write-Host (" Todos os {0} arquivo(s) sao validos contra o schema." -f $targets.Count) -ForegroundColor Green
} else {
    Write-Host " Ha arquivo(s) invalido(s) ou validador indisponivel (ver acima)." -ForegroundColor Red
}
exit $exit
