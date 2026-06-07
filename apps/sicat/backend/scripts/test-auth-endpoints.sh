#!/bin/bash

# Teste 1: Partner Info (GET, sem autenticação)
echo "=== Teste 1: GET /v1/auth/partner-info ==="
curl -X GET \
  'http://localhost:8080/v1/auth/partner-info?document=31913781000139' \
  -H 'X-Correlation-Id: test-partner-info' \
  -H 'accept: application/json' \
  -w '\nHTTP Status: %{http_code}\n\n'

# Teste 2: Login com reCAPTCHA Mock (erro esperado)
echo "=== Teste 2: POST /v1/auth/login (com reCAPTCHA mock - erro esperado) ==="
curl -X POST \
  'http://localhost:8080/v1/auth/login' \
  -H 'X-Correlation-Id: test-login-mock' \
  -H 'Content-Type: application/json' \
  -H 'accept: application/json' \
  -d '{
  "document": "31913781000139",
  "password": "2dlzft",
  "recaptchaToken": "mock"
}' \
  -w '\nHTTP Status: %{http_code}\n\n'

# Teste 3: Login sem reCAPTCHA (erro: campo obrigatório)
echo "=== Teste 3: POST /v1/auth/login (sem reCAPTCHA - erro esperado) ==="
curl -X POST \
  'http://localhost:8080/v1/auth/login' \
  -H 'X-Correlation-Id: test-login-no-captcha' \
  -H 'Content-Type: application/json' \
  -H 'accept: application/json' \
  -d '{
  "document": "31913781000139",
  "password": "2dlzft"
}' \
  -w '\nHTTP Status: %{http_code}\n\n'

# Teste 4: Partner Info com documento inválido
echo "=== Teste 4: GET /v1/auth/partner-info (com CNPJ inválido) ==="
curl -X GET \
  'http://localhost:8080/v1/auth/partner-info?document=00000000000000' \
  -H 'X-Correlation-Id: test-partner-invalid' \
  -H 'accept: application/json' \
  -w '\nHTTP Status: %{http_code}\n\n'
