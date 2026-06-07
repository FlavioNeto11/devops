# Comece aqui

## Objetivo

Executar o projeto e os testes com integração real da CETESB, sem caminho de execução mock no backend e no worker.

## Fluxo recomendado

1. Prepare a infraestrutura local.
2. Suba API, worker e frontend em modo real.
3. Rode os smokes seguros.
4. Execute testes reais somente com credenciais válidas.

## Setup inicial

```powershell
cp .env.example .env
npm install
docker compose up -d postgres
npm run migrate
```

## Subida da aplicação

```powershell
npm run dev
npm run worker
Set-Location frontend
npm run dev
```

## Verificações rápidas

```powershell
curl.exe "http://127.0.0.1:8080/v1/ping" -H "Accept: application/json"
npm run smoke:health
npm run smoke:openapi
```

## Testes reais CETESB

```powershell
$env:CETESB_USERNAME = "seu_usuario"
$env:CETESB_PASSWORD = "sua_senha"
node tests/smoke/manifest-real-integration.test.js
```

## Documentação atual

- `docs/legado/autenticacao-cetesb/REAL_TESTING_QUICK_START.md`
- `docs/TESTING.md`
- `README.md`
