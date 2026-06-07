param(
  [string]$WorkspaceRoot = "c:\GIT\PADILHA\sicat"
)

$ErrorActionPreference = 'Stop'

function Wait-HttpReady {
  param(
    [Parameter(Mandatory = $true)][string]$Url,
    [int]$TimeoutSeconds = 90,
    [string]$Name = 'service'
  )

  $deadline = (Get-Date).AddSeconds($TimeoutSeconds)
  while ((Get-Date) -lt $deadline) {
    try {
      $response = Invoke-WebRequest -Uri $Url -UseBasicParsing -TimeoutSec 5
      if ($response.StatusCode -ge 200 -and $response.StatusCode -lt 500) {
        Write-Host "[localhost:up] $Name ready at $Url"
        return
      }
    }
    catch {
      Start-Sleep -Seconds 2
    }
  }

  throw "[localhost:up] timeout waiting for $Name at $Url"
}

Set-Location $WorkspaceRoot

Write-Host "[localhost:up] preparing local dependencies..."
docker compose up -d postgres | Out-Null
npm run migrate
npm run validate:openapi

Write-Host "[localhost:up] stopping previous processes..."
& "$WorkspaceRoot/scripts/restart-stack-vscode.ps1" -WorkspaceRoot $WorkspaceRoot

Write-Host "[localhost:up] starting API, worker and frontend..."
Start-Process -FilePath "pwsh" -WorkingDirectory $WorkspaceRoot -WindowStyle Hidden -ArgumentList @(
  "-NoLogo",
  "-NoProfile",
  "-Command",
  "Set-Location '$WorkspaceRoot'; `$env:CETESB_GATEWAY_MODE='real'; npm run dev"
) | Out-Null

Start-Process -FilePath "pwsh" -WorkingDirectory $WorkspaceRoot -WindowStyle Hidden -ArgumentList @(
  "-NoLogo",
  "-NoProfile",
  "-Command",
  "Set-Location '$WorkspaceRoot'; `$env:CETESB_GATEWAY_MODE='real'; npm run worker"
) | Out-Null

Start-Process -FilePath "pwsh" -WorkingDirectory "$WorkspaceRoot/frontend" -WindowStyle Hidden -ArgumentList @(
  "-NoLogo",
  "-NoProfile",
  "-Command",
  "Set-Location '$WorkspaceRoot/frontend'; `$env:VITE_API_BASE_URL='http://127.0.0.1:8080'; npm run dev -- --host 127.0.0.1 --port 5174"
) | Out-Null

Write-Host "[localhost:up] waiting for services to become reachable..."
Wait-HttpReady -Name "api" -Url "http://127.0.0.1:8080/v1/ping" -TimeoutSeconds 120
Wait-HttpReady -Name "frontend" -Url "http://127.0.0.1:5174" -TimeoutSeconds 120

Write-Host "[localhost:up] stack is up"
