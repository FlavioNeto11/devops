<#
.SYNOPSIS
  Ingestao UMA VEZ dos binarios do acervo BESC (biblioteca + jurisprudencia) no PVC do pod.
  Copia os arquivos de C:\besc-source para /data/library/<id><ext> e /data/jurisprudence/<id><ext>
  no pod besc-api, mapeando pelo catalogo (api/seed/*.json). Idempotente (pula ja-presentes).

  Rode APOS o deploy da nova imagem besc-api (o init() cria /data/library e /data/jurisprudence).

.PARAMETER SourceRoot  Pasta-fonte extraida (default C:\besc-source)
.PARAMETER Namespace   Namespace do pod (default apps)
.EXAMPLE
  pwsh C:\devops\apps\besc\seed\ingest-files.ps1
#>
param(
  [string]$SourceRoot = 'C:\besc-source',
  [string]$Namespace  = 'apps'
)
$ErrorActionPreference = 'Stop'
$env:Path = [Environment]::GetEnvironmentVariable('Path','Machine') + ';' + [Environment]::GetEnvironmentVariable('Path','User')

$seedDir = Join-Path $PSScriptRoot '..\api\seed'
$juris = Get-Content (Join-Path $seedDir 'jurisprudence.json') -Raw | ConvertFrom-Json
$lib   = Get-Content (Join-Path $seedDir 'library.json') -Raw | ConvertFrom-Json

$pod = (kubectl -n $Namespace get pod -l app.kubernetes.io/name=besc-api -o jsonpath='{.items[0].metadata.name}')
if (-not $pod) { throw "pod besc-api nao encontrado no namespace $Namespace" }
Write-Host "Pod: $pod" -ForegroundColor Cyan

# garante os diretorios no PVC (o init ja cria, mas reforca)
kubectl -n $Namespace exec $pod -c api -- sh -c "mkdir -p /data/library /data/jurisprudence" | Out-Null

# IMPORTANTE (Windows): kubectl cp confunde "C:\..." com pod:path por causa dos dois-pontos.
# Solucao: rodar a partir da SourceRoot e passar caminhos RELATIVOS (sem letra de drive).
Push-Location $SourceRoot

function Copy-Set($items, [string]$srcPrefix, [string]$destDir) {
  $copied = 0; $skipped = 0; $missing = 0; $n = 0
  foreach ($it in $items) {
    $n++
    $ext = $it.fileRef.ext
    if ($srcPrefix -eq 'library') { $rel = "informacoes/" + $it.sourceFilename }
    else { $rel = $it.sourcePath }   # ja e "jurisprudencia/..."
    $abs = Join-Path $SourceRoot ($rel -replace '/', '\')
    if (-not (Test-Path -LiteralPath $abs)) { Write-Warning "faltando fonte: $abs"; $missing++; continue }
    $dest = "/data/$destDir/$($it.id)$ext"
    $exists = (kubectl -n $Namespace exec $pod -c api -- sh -c "test -f '$dest' && echo yes || echo no").Trim()
    if ($exists -eq 'yes') { $skipped++; continue }
    kubectl -n $Namespace cp "$rel" "${pod}:$dest" -c api
    if ($LASTEXITCODE -eq 0) { $copied++ } else { Write-Warning "falha cp: $rel" }
    if ($n % 10 -eq 0) { Write-Host "  ... $n/$($items.Count)" }
  }
  Write-Host ("{0}: copiados={1} pulados={2} faltando={3} (total {4})" -f $destDir, $copied, $skipped, $missing, $items.Count) -ForegroundColor Green
}

Write-Host "`n== Jurisprudencia ($($juris.Count)) ==" -ForegroundColor Cyan
Copy-Set $juris 'jurisprudence' 'jurisprudence'
Write-Host "`n== Biblioteca ($($lib.Count)) ==" -ForegroundColor Cyan
Copy-Set $lib 'library' 'library'

Pop-Location

Write-Host "`n== Conferencia no PVC ==" -ForegroundColor Cyan
kubectl -n $Namespace exec $pod -c api -- sh -c "echo library=`$(ls /data/library | wc -l) jurisprudence=`$(ls /data/jurisprudence | wc -l); du -sh /data/library /data/jurisprudence"
Write-Host "`nIngestao concluida. Confira em https://dev.nvit.com.br/besc/jurisprudencia" -ForegroundColor Green
