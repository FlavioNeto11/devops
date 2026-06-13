---
title: "Drift report — sicat × cetesb (2026-06-12)"
status: reference
applies_to: [sicat]
updated: 2026-06-13
language: pt-BR
---

# Drift report — sicat × cetesb (contrato 2026-06-12)

> Gerado em 2026-06-13T00:42:56.963Z. Comparador read-only: o contrato é a verdade do portal real;
> o mapa declarativo (`apps/sicat/backend/docs/portal-contracts/sicat-cetesb-endpoint-map.jsonl`) descreve como o sicat acessa cada endpoint hoje.
> Os `anchors` do mapa são validados contra `apps/sicat/backend/src/gateways/cetesb-gateway.js`.

## Resumo

| severidade | qtd |
|---|---|
| critical | 0 |
| error | 0 |
| high | 0 |
| warning | 0 |
| info | 17 |

## Achados

### info (17)

- **cetesb-mtr-login** `LOW_CONFIDENCE_BASELINE` — endpoint inferido de 1 amostra(s); achados de alta severidade foram rebaixados.  
  ↳ Capturar mais amostras reais para elevar a confiança.
- **cetesb-mtr-manifesto-submit** `LOW_CONFIDENCE_BASELINE` — endpoint inferido de 1 amostra(s); achados de alta severidade foram rebaixados.  
  ↳ Capturar mais amostras reais para elevar a confiança.
- **cetesb-mtr-manifesto-cancel** `LOW_CONFIDENCE_BASELINE` — endpoint inferido de 1 amostra(s); achados de alta severidade foram rebaixados.  
  ↳ Capturar mais amostras reais para elevar a confiança.
- **cetesb-mtr-manifesto-print** `LOW_CONFIDENCE_BASELINE` — endpoint inferido de 1 amostra(s); achados de alta severidade foram rebaixados.  
  ↳ Capturar mais amostras reais para elevar a confiança.
- **cetesb-mtr-manifesto-detalhe** `LOW_CONFIDENCE_BASELINE` — endpoint inferido de 1 amostra(s); achados de alta severidade foram rebaixados.  
  ↳ Capturar mais amostras reais para elevar a confiança.
- **cetesb-mtr-manifesto-receber** `LOW_CONFIDENCE_BASELINE` — endpoint inferido de 2 amostra(s); achados de alta severidade foram rebaixados.  
  ↳ Capturar mais amostras reais para elevar a confiança.
- **cetesb-mtr-manifesto-search-recebimento-numero** `LOW_CONFIDENCE_BASELINE` — endpoint inferido de 2 amostra(s); achados de alta severidade foram rebaixados.  
  ↳ Capturar mais amostras reais para elevar a confiança.
- **cetesb-mtr-manifesto-search** `LOW_CONFIDENCE_BASELINE` — endpoint inferido de 1 amostra(s); achados de alta severidade foram rebaixados.  
  ↳ Capturar mais amostras reais para elevar a confiança.
- **cetesb-mtr-responsavel-recebimento** `LOW_CONFIDENCE_BASELINE` — endpoint inferido de 1 amostra(s); achados de alta severidade foram rebaixados.  
  ↳ Capturar mais amostras reais para elevar a confiança.
- **cetesb-mtr-cdf-generate** `LOW_CONFIDENCE_BASELINE` — endpoint inferido de 1 amostra(s); achados de alta severidade foram rebaixados.  
  ↳ Capturar mais amostras reais para elevar a confiança.
- **cetesb-mtr-cdf-print** `LOW_CONFIDENCE_BASELINE` — endpoint inferido de 1 amostra(s); achados de alta severidade foram rebaixados.  
  ↳ Capturar mais amostras reais para elevar a confiança.
- **cetesb-mtr-parceiro-by-codigo** `LOW_CONFIDENCE_BASELINE` — endpoint inferido de 1 amostra(s); achados de alta severidade foram rebaixados.  
  ↳ Capturar mais amostras reais para elevar a confiança.
- **cetesb-cadastro-salvar-acesso** `LOW_CONFIDENCE_BASELINE` — endpoint inferido de 1 amostra(s); achados de alta severidade foram rebaixados.  
  ↳ Capturar mais amostras reais para elevar a confiança.
- **cetesb-catalogo-estados** `LOW_CONFIDENCE_BASELINE` — endpoint inferido de 1 amostra(s); achados de alta severidade foram rebaixados.  
  ↳ Capturar mais amostras reais para elevar a confiança.
- **cetesb-catalogo-cidades** `LOW_CONFIDENCE_BASELINE` — endpoint inferido de 1 amostra(s); achados de alta severidade foram rebaixados.  
  ↳ Capturar mais amostras reais para elevar a confiança.
- **cetesb-catalogo-unidades** `LOW_CONFIDENCE_BASELINE` — endpoint inferido de 1 amostra(s); achados de alta severidade foram rebaixados.  
  ↳ Capturar mais amostras reais para elevar a confiança.
- **cetesb-catalogo-residuo-tratamento** `LOW_CONFIDENCE_BASELINE` — endpoint inferido de 1 amostra(s); achados de alta severidade foram rebaixados.  
  ↳ Capturar mais amostras reais para elevar a confiança.

## Nota sobre o baseline

Enquanto o contrato for um **seed derivado do gateway** (`generated_by: seed-from-gateway`), ele está
alinhado ao SICAT por construção — drifts reais só aparecem quando uma **captura real** do
`portal-recorder` substituir o seed e revelar como a CETESB de fato responde. Achados `info`/
`low_confidence` aqui refletem isso.
