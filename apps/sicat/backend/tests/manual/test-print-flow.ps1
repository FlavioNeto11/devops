#!/usr/bin/env pwsh
# Test: Fluxo completo de impressão de MTR
# DL-023: Validação do Handoff 4 (Worker/Persistência)

$ErrorActionPreference = 'Stop'
$baseUrl = 'http://localhost:8080'
$headers = @{ 'Content-Type' = 'application/json' }

function Write-Step {
    param([string]$Message)
    Write-Host "`n==> $Message" -ForegroundColor Cyan
}

function Write-Success {
    param([string]$Message)
    Write-Host "✓ $Message" -ForegroundColor Green
}

function Write-Fail {
    param([string]$Message)
    Write-Host "✗ $Message" -ForegroundColor Red
}

try {
    Write-Step "1. Verificar saúde da API"
    $health = Invoke-RestMethod -Uri "$baseUrl/health" -Method Get
    if ($health.status -eq 'ok') {
        Write-Success "API está saudável"
    } else {
        throw "API não está saudável: $($health | ConvertTo-Json)"
    }

    Write-Step "2. Criar session-context (mock)"
    $sessionPayload = @{
        integrationAccountId = 'acc_test_print'
        partnerCode = 176163
        stateCode = 26
        username = 'test.user'
        password = 'test.password'
    } | ConvertTo-Json
    
    $sessionResponse = Invoke-RestMethod -Uri "$baseUrl/v1/session-contexts" -Method Post -Headers $headers -Body $sessionPayload
    $sessionId = $sessionResponse.id
    Write-Success "Session criada: $sessionId"

    Write-Step "3. Criar manifesto"
    $manifestPayload = @{
        integrationAccountId = 'acc_test_print'
        sessionContextId = $sessionId
        manifestType = 1
        state = @{ code = 26; abbreviation = 'SP' }
        responsibleName = 'Test User'
        expeditionDate = (Get-Date).ToString('yyyy-MM-dd')
        driverName = 'Test Driver'
        vehiclePlate = 'ABC1234'
        hasTemporaryStorage = $false
        hasCadriInResidueList = $false
        generator = @{
            partnerCode = 176163
            description = 'Test Generator'
        }
        carrier = @{
            partnerCode = 160627
            description = 'Test Carrier'
        }
        receiver = @{
            partnerCode = 123456
            description = 'Test Receiver'
        }
        residues = @(
            @{
                residueCode = '010101'
                quantity = 100.5
                unitCode = 1
                transportStateCode = 1
                packagingCode = 1
                classificationCode = 1
            }
        )
    } | ConvertTo-Json -Depth 10

    $manifestResponse = Invoke-RestMethod -Uri "$baseUrl/v1/manifestos" -Method Post -Headers $headers -Body $manifestPayload
    $manifestId = $manifestResponse.id
    Write-Success "Manifesto criado: $manifestId"

    Write-Step "4. Submeter manifesto"
    $submitPayload = @{
        sessionContextId = $sessionId
        validateOnly = $false
        printAfterSubmit = $false
    } | ConvertTo-Json

    $submitResponse = Invoke-RestMethod -Uri "$baseUrl/v1/manifestos/$manifestId/submit" -Method Post -Headers $headers -Body $submitPayload
    $submitJobId = $submitResponse.jobId
    Write-Success "Submit enfileirado: $submitJobId"

    Write-Step "5. Aguardar worker processar submit (max 30s)"
    $maxWait = 30
    $waited = 0
    $submitCompleted = $false
    
    while ($waited -lt $maxWait -and -not $submitCompleted) {
        Start-Sleep -Seconds 2
        $waited += 2
        
        $jobStatus = Invoke-RestMethod -Uri "$baseUrl/v1/jobs/$submitJobId" -Method Get
        Write-Host "  Job status: $($jobStatus.status) (tentativas: $($jobStatus.attempts))"
        
        if ($jobStatus.status -eq 'succeeded') {
            $submitCompleted = $true
            Write-Success "Submit concluído em ${waited}s"
        } elseif ($jobStatus.status -eq 'failed' -or $jobStatus.status -eq 'dlq') {
            throw "Submit falhou: $($jobStatus.lastErrorMessage)"
        }
    }

    if (-not $submitCompleted) {
        throw "Timeout aguardando submit"
    }

    Write-Step "6. Verificar manifesto após submit"
    $manifest = Invoke-RestMethod -Uri "$baseUrl/v1/manifestos/$manifestId" -Method Get
    Write-Host "  Status: $($manifest.status)"
    Write-Host "  ExternalHashCode: $($manifest.externalHashCode)"
    
    if (-not $manifest.externalHashCode) {
        throw "Manifesto não tem externalHashCode após submit"
    }
    Write-Success "Manifesto submetido com hash: $($manifest.externalHashCode)"

    Write-Step "7. Solicitar impressão"
    $printPayload = @{
        documentType = 'manifest_pdf'
        regenerateIfMissing = $true
    } | ConvertTo-Json

    $printResponse = Invoke-RestMethod -Uri "$baseUrl/v1/manifestos/$manifestId/print" -Method Post -Headers $headers -Body $printPayload
    $printJobId = $printResponse.jobId
    Write-Success "Print enfileirado: $printJobId"

    Write-Step "8. Aguardar worker processar print (max 30s)"
    $waited = 0
    $printCompleted = $false
    
    while ($waited -lt $maxWait -and -not $printCompleted) {
        Start-Sleep -Seconds 2
        $waited += 2
        
        $jobStatus = Invoke-RestMethod -Uri "$baseUrl/v1/jobs/$printJobId" -Method Get
        Write-Host "  Job status: $($jobStatus.status) (tentativas: $($jobStatus.attempts))"
        
        if ($jobStatus.status -eq 'succeeded') {
            $printCompleted = $true
            Write-Success "Print concluído em ${waited}s"
            
            # Validar payload do job
            if ($jobStatus.payload.printUrl) {
                Write-Success "printUrl presente no job: $($jobStatus.payload.printUrl)"
            } else {
                Write-Fail "printUrl NÃO encontrado no job payload"
            }
        } elseif ($jobStatus.status -eq 'failed' -or $jobStatus.status -eq 'dlq') {
            throw "Print falhou: $($jobStatus.lastErrorMessage)"
        }
    }

    if (-not $printCompleted) {
        throw "Timeout aguardando print"
    }

    Write-Step "9. Verificar manifesto após print"
    $manifest = Invoke-RestMethod -Uri "$baseUrl/v1/manifestos/$manifestId" -Method Get
    Write-Host "  Status: $($manifest.status)"
    Write-Host "  Documentos: $($manifest.documents.Count)"
    
    if ($manifest.status -ne 'printed') {
        Write-Fail "Status esperado 'printed', obtido '$($manifest.status)'"
    } else {
        Write-Success "Status atualizado para 'printed'"
    }
    
    if ($manifest.documents.Count -eq 0) {
        throw "Nenhum documento encontrado no manifesto"
    }
    Write-Success "Documentos encontrados: $($manifest.documents.Count)"

    Write-Step "10. Validar documento PDF"
    $pdfDoc = $manifest.documents | Where-Object { $_.type -eq 'manifest_pdf' } | Select-Object -First 1
    
    if (-not $pdfDoc) {
        throw "Documento PDF não encontrado"
    }
    
    Write-Host "  Document ID: $($pdfDoc.id)"
    Write-Host "  Status: $($pdfDoc.status)"
    Write-Host "  DownloadUrl: $($pdfDoc.downloadUrl)"
    
    if ($pdfDoc.status -ne 'available') {
        Write-Fail "Status do documento esperado 'available', obtido '$($pdfDoc.status)'"
    } else {
        Write-Success "Documento disponível para download"
    }

    Write-Step "11. Download do PDF"
    $pdfUrl = "$baseUrl$($pdfDoc.downloadUrl)"
    $tempPdf = [System.IO.Path]::GetTempFileName() + ".pdf"
    
    Invoke-WebRequest -Uri $pdfUrl -OutFile $tempPdf
    $pdfSize = (Get-Item $tempPdf).Length
    
    if ($pdfSize -gt 0) {
        Write-Success "PDF baixado com sucesso: $pdfSize bytes"
        Write-Host "  Arquivo temporário: $tempPdf"
    } else {
        throw "PDF baixado está vazio"
    }

    Write-Step "12. Verificar storage local"
    $storagePattern = "storage\documents\$manifestId\mtr-*.pdf"
    $storedFiles = Get-ChildItem -Path $storagePattern -ErrorAction SilentlyContinue
    
    if ($storedFiles) {
        Write-Success "PDF encontrado no storage local: $($storedFiles[0].FullName)"
        Write-Host "  Tamanho: $($storedFiles[0].Length) bytes"
    } else {
        Write-Fail "PDF NÃO encontrado no storage local"
    }

    Write-Host "`n" -NoNewline
    Write-Host "================================================" -ForegroundColor Green
    Write-Host "✓ TESTE COMPLETO: Fluxo de impressão funcionando!" -ForegroundColor Green
    Write-Host "================================================" -ForegroundColor Green
    Write-Host "`nResumo:"
    Write-Host "  - Manifesto: $manifestId"
    Write-Host "  - Status: $($manifest.status)"
    Write-Host "  - Job print: $printJobId"
    Write-Host "  - Documento: $($pdfDoc.id)"
    Write-Host "  - PDF size: $pdfSize bytes"
    Write-Host "  - PDF temp: $tempPdf"

} catch {
    Write-Host "`n" -NoNewline
    Write-Host "================================================" -ForegroundColor Red
    Write-Host "✗ TESTE FALHOU" -ForegroundColor Red
    Write-Host "================================================" -ForegroundColor Red
    Write-Host $_.Exception.Message -ForegroundColor Red
    Write-Host $_.ScriptStackTrace -ForegroundColor DarkGray
    exit 1
}
