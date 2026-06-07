# Quick start do fluxo de impressão

## Pré-requisitos

```powershell
docker compose up -d postgres
npm run migrate
npm run dev
npm run worker
```

## Execução rápida

```powershell
.\tests\manual\test-print-flow.ps1
```

## Resultado esperado

- manifesto finalizado com status `printed`
- documento PDF disponível para download
- arquivo persistido em `storage/documents/<manifestId>`

## Troubleshooting rápido

```powershell
curl.exe "http://127.0.0.1:8080/v1/ping" -H "Accept: application/json"
docker exec -i mtr_postgres psql -U postgres -d mtr_automation -c "SELECT job_id, operation, status FROM jobs ORDER BY created_at DESC LIMIT 10;"
```

## Referências

- `docs/DL-023-CORRECAO-FLUXO-IMPRIMIR-MTR.md`
- `docs/copilot/handoffs/DL-023/execution/HANDOFF-4-WORKER-PERSISTENCIA-PRINT.md`
