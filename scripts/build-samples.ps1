#requires -Version 7.0
<#
.SYNOPSIS
  [DEPRECATED] samples/ esta vazio (os exemplos viraram apps reais em apps/). Builds sao por-app.
.DESCRIPTION
  Cada app tem build-args proprios (VITE_BASE_PATH no SICAT, NEXT_PUBLIC_* no GymOps...), entao nao
  ha um builder generico. Build (lab, imagens :local) pelo Dockerfile de cada servico do app; depois:
      .\scripts\publish-app.ps1 -App <name>
  Veja docs/standards/golden-path.md e o README de cada app em apps/<name>.
#>
Set-StrictMode -Version Latest
Write-Host "[DEPRECATED] build-samples.ps1 -> samples/ vazio; builds sao por-app." -ForegroundColor Yellow
Write-Host "  Apps em apps/: $((Get-ChildItem (Join-Path $PSScriptRoot '..\apps') -Directory -ErrorAction SilentlyContinue).Name -join ', ')" -ForegroundColor Gray
Write-Host "  Depois de buildar as imagens :local: .\scripts\publish-app.ps1 -App <name>" -ForegroundColor Gray
