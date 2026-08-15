# Ferramentas do plano comercial — fonte única e geradores

> **Regra de ouro:** os números vivem em [`premissas.json`](./premissas.json) (fonte única).
> Planilha, CSVs e one-pager são GERADOS — nunca edite `plano-comercial-sicat.xlsx` ou o PDF na mão.
> Editou uma premissa? Regenere tudo e rode o golden check.

## Arquivos

| Arquivo | Papel |
|---|---|
| `premissas.json` | Fonte única: preços, planos, custos, cenários (com confiança + fonte por número) |
| `gen_xlsx.py` | Gera `../plano-comercial-sicat.xlsx` (4 abas com fórmulas) + 3 CSVs espelho |
| `gen_pdf.py` | Gera `../one-pager-plano-comercial-sicat.pdf` (lê o MESMO premissas.json) |
| `verify_xlsx.py` | Golden check: recomputa em Python puro e compara com o xlsx recalculado |

## Fluxo de regeneração (PowerShell 7, nesta máquina)

```powershell
cd apps\sicat\docs\20-comercial\tools
python gen_xlsx.py

# openpyxl grava fórmula SEM valor calculado -> recalcular no LibreOffice
# (soffice NÃO está no PATH; recalc.py da skill xlsx não funciona no Windows/AF_UNIX)
& "C:\Program Files\LibreOffice\program\soffice.exe" --headless --convert-to xlsx `
    --outdir "$env:TEMP\sicat-recalc" ..\plano-comercial-sicat.xlsx

# commit sempre o arquivo RECALCULADO (com valores em cache)
Copy-Item "$env:TEMP\sicat-recalc\plano-comercial-sicat.xlsx" ..\plano-comercial-sicat.xlsx -Force

python verify_xlsx.py ..\plano-comercial-sicat.xlsx   # tem que imprimir GOLDEN CHECK OK
python gen_pdf.py                                      # one-pager com os MESMOS números
```

## Como os artefatos se amarram (zero drift por construção)

```
premissas.json ──> gen_xlsx.py ──> xlsx (fórmulas) + 3 CSVs espelho
      │                                │
      │                                └─ soffice recalc ─> verify_xlsx.py (golden check)
      └──────────> gen_pdf.py  ──> one-pager PDF (usa esperado() de verify_xlsx.py)
```

O doc-mãe (`../00-plano-comercial-pricing.md`) cita poucos números absolutos e sempre os
headline dos cenários — que saem desta calculadora. Divergiu? A planilha está certa; conserte o doc.

## Dependências

`python` com `openpyxl` e `reportlab` (já instalados nesta máquina) + LibreOffice
(`C:\Program Files\LibreOffice\program\soffice.exe`).
