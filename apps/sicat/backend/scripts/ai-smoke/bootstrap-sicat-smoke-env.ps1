param(
  [string]$ApiBaseUrl = "http://127.0.0.1:8080",
  [string]$Email = "flavio_padilha_neto@msn.com",
  [string]$AccountId = ""
)

$ErrorActionPreference = "Stop"

Write-Host "Bootstrap do .env do smoke SICAT" -ForegroundColor Cyan
Write-Host "API: $ApiBaseUrl"
Write-Host "Usuário: $Email"
Write-Host ""

$securePassword = Read-Host "Senha SICAT" -AsSecureString
$plainPassword = [Runtime.InteropServices.Marshal]::PtrToStringAuto(
  [Runtime.InteropServices.Marshal]::SecureStringToBSTR($securePassword)
)

try {
  $env:SICAT_LOGIN_PASSWORD = $plainPassword

  $args = @(
    "scripts/ai-smoke/bootstrap-sicat-smoke-env.mjs",
    "--api-base-url", $ApiBaseUrl,
    "--email", $Email
  )

  if ($AccountId -and $AccountId.Trim()) {
    $args += @("--account-id", $AccountId)
  }

  node @args
}
finally {
  Remove-Item Env:SICAT_LOGIN_PASSWORD -ErrorAction SilentlyContinue
  $plainPassword = $null
}
