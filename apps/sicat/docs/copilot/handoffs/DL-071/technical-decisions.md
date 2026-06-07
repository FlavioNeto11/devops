# Technical Decisions - DL-071

## Fatos
- Composição do dashboard por múltiplas chamadas elevava acoplamento no frontend.
- Não havia visão temporal padronizada para análise operacional de curto prazo.
- Latência CETESB por endpoint não estava disponível em formato consumível para priorização de troubleshooting.

## Decisão 1: endpoint consolidado para dashboard
- **Escolha:** expor `GET /v1/dashboard/overview` como payload canônico do dashboard.
- **Motivo:** reduzir acoplamento da UI e centralizar agregação no backend.
- **Impacto:** simplificação do cliente frontend e menor risco de inconsistência entre widgets.

## Decisão 2: snapshots persistidos com namespace `dashboard.*`
- **Escolha:** gravar snapshots de métricas resumidas em `performance_snapshots`.
- **Motivo:** habilitar leitura de tendência operacional sem depender apenas de cálculos em tempo real.
- **Impacto:** base para alertas futuros e comparação histórica.

## Decisão 3: manter compatibilidade no endpoint de performance
- **Escolha:** preservar formato legado em `GET /v1/health/metrics/performance` junto ao formato novo.
- **Motivo:** evitar quebra de smoke scripts e consumidores existentes.
- **Impacto:** transição segura enquanto o overview consolidado é adotado.

## Pendências
- Definir thresholds operacionais para alertas automáticos (DLQ alto, p95 degradado, aumento de erro por janela).
- Evoluir drill-down por operação/job para diagnóstico assistido.
