#requires -Version 7.0
<#
.SYNOPSIS
  [DEPRECATED] As apps de exemplo (aplicacao1/2/3) foram removidas. Use publish-app.ps1 -App <name>.
.DESCRIPTION
  Mantido apenas como ponteiro: os exemplos sairam de samples/ e os apps reais vivem em apps/
  (sicat, gymops, rmambiental). Para publicar um app real:
      .\scripts\publish-app.ps1 -App <name>
  Veja docs/standards/golden-path.md.
#>
[CmdletBinding()]
param([string]$App)
Set-StrictMode -Version Latest
Write-Host "[DEPRECATED] publish-sample-app.ps1 -> use publish-app.ps1 -App <name>" -ForegroundColor Yellow
Write-Host "  Apps disponiveis em apps/: $((Get-ChildItem (Join-Path $PSScriptRoot '..\apps') -Directory -ErrorAction SilentlyContinue).Name -join ', ')" -ForegroundColor Gray
if ($App) {
  Write-Host "  Encaminhando para publish-app.ps1 -App $App ..." -ForegroundColor Gray
  & (Join-Path $PSScriptRoot 'publish-app.ps1') -App $App
} else {
  Write-Host "  Exemplo: .\scripts\publish-app.ps1 -App sicat" -ForegroundColor Gray
}
