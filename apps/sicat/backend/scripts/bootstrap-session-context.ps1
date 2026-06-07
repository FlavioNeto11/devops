param(
  [Parameter(Mandatory = $true)]
  [string]$IntegrationAccountId,

  [Parameter(Mandatory = $true)]
  [string]$PartnerDocument,

  [Parameter(Mandatory = $true)]
  [ValidateSet('J','F')]
  [string]$PartnerType,

  [Parameter(Mandatory = $true)]
  [int]$PartnerCode,

  [Parameter(Mandatory = $true)]
  [int]$UserAccessCode,

  [Parameter(Mandatory = $true)]
  [string]$UserName,

  [Parameter(Mandatory = $true)]
  [string]$Email,

  [Parameter(Mandatory = $true)]
  [SecureString]$Password,

  [string]$RecaptchaToken = '',

  [string]$BaseUrl = 'http://localhost:8080',
  [int]$StateCode = 26,
  [int]$System = 0
)

$ErrorActionPreference = 'Stop'

$passwordBstr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($Password)
$plainPassword = $null

$correlationId = "corr_bootstrap_scx_$(Get-Date -Format 'yyyyMMddHHmmss')"

try {
  $plainPassword = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($passwordBstr)

  $payload = @{
    integrationAccountId = $IntegrationAccountId
    partnerDocument      = $PartnerDocument
    partnerType          = $PartnerType
    partnerCode          = $PartnerCode
    userAccessCode       = $UserAccessCode
    userName             = $UserName
    email                = $Email
    authMode             = 'bootstrap'
    metadata             = @{
      stateCode         = $StateCode
      stateAbbreviation = 'SP'
      recaptchaToken    = $RecaptchaToken
      credentials       = @{
        login    = $PartnerDocument
        email    = $Email
        password = $plainPassword
      }
      system = $System
    }
  } | ConvertTo-Json -Depth 10

  $response = Invoke-RestMethod -Method Post `
    -Uri "$BaseUrl/v1/session-contexts" `
    -Headers @{ 'Content-Type' = 'application/json'; 'X-Correlation-Id' = $correlationId } `
    -Body $payload

  Write-Host "Session context criado com sucesso."
  Write-Host "id: $($response.id)"
  Write-Host "status: $($response.status)"
  Write-Host "expiresAt: $($response.expiresAt)"
  Write-Host "correlationId: $correlationId"
  Write-Host ""
  Write-Host "Use o sessionContextId no catalog-sync:"
  Write-Host "  $($response.id)"
}
finally {
  [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($passwordBstr)
}
