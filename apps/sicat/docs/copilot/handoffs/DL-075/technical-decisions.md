# Technical Decisions - DL-075

## Fatos
- A CETESB pode retornar erro por data específica (ex.: alguns dias com `404`/`5xx`) enquanto dias vizinhos estão saudáveis.
- A abordagem anterior (consulta única por range) descartava resultados válidos ao encontrar erro no período.

## Decisão 1: segmentação diária para ranges
- **Escolha:** dividir a busca em janelas de 1 dia para ranges maiores que 1 dia.
- **Motivo:** isolar falha por data e preservar dados de dias saudáveis.
- **Impacto:** maior resiliência de consulta com cobertura mais fiel do período solicitado.

## Decisão 2: tolerância a erro parcial por janela
- **Escolha:** não abortar o range completo em erro CETESB por dia (`404/5xx`), registrando janela ignorada.
- **Motivo:** evitar “resultado vazio” quando parte do período é válida.
- **Impacto:** retorno parcial consistente e auditável.

## Decisão 3: deduplicação no merge final
- **Escolha:** consolidar resultados por `manHashCode` e fallback por `manCodigo/manNumero`.
- **Motivo:** prevenir duplicidade entre janelas diárias.
- **Impacto:** payload final estável para upsert local e paginação.

## Pendências
- Evoluir monitoramento para métricas específicas de falha por janela de busca (`skippedWindows`) em observabilidade operacional.
