# Technical Decisions - DL-028

## 1) Tratar `pesquisaManifesto` 404 como cenário não bloqueante no E2E
- **Decisão:** No teste E2E real, após retry, mapear 404 de listagem para resultado vazio.
- **Motivo:** O endpoint de listagem pode retornar 404 por variações de disponibilidade/dados sem invalidar fluxos críticos de criação/submit/cancel.
- **Impacto:** Evita falso negativo no pipeline de validação real.

## 2) Janela temporal móvel e `status: 0`
- **Decisão:** Substituir datas fixas por janela móvel (7 dias) com fallback de 30 dias.
- **Motivo:** Reduz flakiness por mudança de período e filtros CETESB.

## 3) Saneamento operacional de jobs legados
- **Decisão:** Mover jobs com `attempts >= max_attempts` para `dlq` antes da execução real.
- **Motivo:** Evitar falha fatal do worker por `chk_job_attempts_integrity` durante processamento de fila antiga.
- **Impacto:** Worker inicia e processa fila sem abortar o fluxo E2E.

## 4) TLS no ambiente de teste real
- **Decisão:** Executar teste com `NODE_TLS_REJECT_UNAUTHORIZED=0` no ambiente local.
- **Motivo:** Certificado remoto não encadeado no host local de execução.
- **Observação:** Uso restrito a validação local; não aplicar em produção.
