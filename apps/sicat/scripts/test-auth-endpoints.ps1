#!/usr/bin/env pwsh

Write-Host "=== Teste 1: GET /v1/auth/partner-info ===" -ForegroundColor Cyan
$response1 = Invoke-WebRequest -Uri 'http://localhost:8080/v1/auth/partner-info?document=31913781000139' `
  -Method GET `
  -Headers @{
    'X-Correlation-Id' = 'test-partner-info'
    'Accept' = 'application/json'
  }
Write-Host "Status: $($response1.StatusCode)"
Write-Host $response1.Content
Write-Host ""

Write-Host "=== Teste 2: POST /v1/auth/login (com reCAPTCHA mock - erro esperado) ===" -ForegroundColor Cyan
try {
  $body2 = @{
    document = "31913781000139"
    password = "2dlzft"
    recaptchaToken = "mock"
  } | ConvertTo-Json
  
  $response2 = Invoke-WebRequest -Uri 'http://localhost:8080/v1/auth/login' `
    -Method POST `
    -Headers @{
      'X-Correlation-Id' = 'test-login-mock'
      'Content-Type' = 'application/json'
      'Accept' = 'application/json'
    } `
    -Body $body2 -ErrorAction Stop
  Write-Host "Status: $($response2.StatusCode)"
  Write-Host $response2.Content
} catch {
  Write-Host "Status: $($_.Exception.Response.StatusCode)"
  Write-Host $_.ErrorDetails.Message
}
Write-Host ""

Write-Host "=== Teste 3: POST /v1/auth/login (sem reCAPTCHA - erro esperado) ===" -ForegroundColor Cyan
try {
  $body3 = @{
    document = "31913781000139"
    password = "2dlzft"
  } | ConvertTo-Json
  
  $response3 = Invoke-WebRequest -Uri 'http://localhost:8080/v1/auth/login' `
    -Method POST `
    -Headers @{
      'X-Correlation-Id' = 'test-login-no-captcha'
      'Content-Type' = 'application/json'
      'Accept' = 'application/json'
    } `
    -Body $body3 -ErrorAction Stop
  Write-Host "Status: $($response3.StatusCode)"
  Write-Host $response3.Content
} catch {
  Write-Host "Status: $($_.Exception.Response.StatusCode)"
  Write-Host $_.ErrorDetails.Message
}
Write-Host ""

Write-Host "=== Teste 4: GET /v1/auth/partner-info (com CNPJ inválido) ===" -ForegroundColor Cyan
try {
  $response4 = Invoke-WebRequest -Uri 'http://localhost:8080/v1/auth/partner-info?document=00000000000000' `
    -Method GET `
    -Headers @{
      'X-Correlation-Id' = 'test-partner-invalid'
      'Accept' = 'application/json'
    } -ErrorAction Stop
  Write-Host "Status: $($response4.StatusCode)"
  Write-Host $response4.Content
} catch {
  Write-Host "Status: $($_.Exception.Response.StatusCode)"
  Write-Host $_.ErrorDetails.Message
}
Write-Host ""

Write-Host "✅ Testes completos!" -ForegroundColor Green
