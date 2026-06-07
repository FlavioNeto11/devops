param(
  [Parameter(Mandatory = $true)]
  [string]$IntegrationAccountId,

  [Parameter(Mandatory = $true)]
  [int]$PartnerCode,

  [Parameter(Mandatory = $true)]
  [int]$UserAccessCode,

  [Parameter(Mandatory = $true)]
  [string]$PartnerDocument,

  [Parameter(Mandatory = $true)]
  [string]$Email,

  [Parameter(Mandatory = $true)]
  [string]$UserName,

  [Parameter(Mandatory = $true)]
  [string]$JwtToken,

  [string]$BaseUrl = 'http://localhost:8080'
)

$ErrorActionPreference = 'Stop'

$correlationId = "corr_scx_manual_$(Get-Date -Format 'yyyyMMddHHmmss')"

$body = @{
  integrationAccountId = $IntegrationAccountId
  partnerDocument      = $PartnerDocument
  partnerType          = 'J'
  partnerCode          = $PartnerCode
  userAccessCode       = $UserAccessCode
  userName             = $UserName
  email                = $Email
  authMode             = 'manual-token'
  jwtToken             = $JwtToken
  metadata             = @{
    stateCode         = 26
    stateAbbreviation = 'SP'
    updatedBy         = 'refresh-session-context-manual-token.ps1'
  }
} | ConvertTo-Json -Depth 8

$response = Invoke-RestMethod -Method Post `
  -Uri "$BaseUrl/v1/session-contexts" `
  -Headers @{ 'Content-Type' = 'application/json'; 'X-Correlation-Id' = $correlationId } `
  -Body $body

Write-Host "Session context criado: $($response.id)"
Write-Host "CorrelationId: $correlationId"
Write-Host "Use esse sessionContextId no /v1/catalog-sync"
