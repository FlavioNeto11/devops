# Decisões Técnicas - DL-052

## 1) Falha terminal deve atualizar a entidade de negócio
**Decisão:** aplicar side-effect explícito no manifesto quando `manifest.submit` termina em `failed|dlq|cancelled`.

**Racional:** estado final da entidade não pode depender apenas de caminho de sucesso ou de atualização manual posterior.

## 2) Reconciliação defensiva em leitura de detalhe
**Decisão:** `getManifest` executa reconciliação para manifestos transitórios sem job (`órfão`) ou com job terminal de falha.

**Racional:** protege contra interrupções/restarts e evita estados transitórios eternos.

## 3) Stream resiliente sem polling no frontend
**Decisão:** manter stream NDJSON e incluir fallback de drift por heartbeat (`job.sync`).

**Racional:** em perda de `NOTIFY`, o consumidor ainda converge para o estado real do job sem reintroduzir polling periódico no frontend.

## 4) Mensagens operacionais orientadas a ação
**Decisão:** em erro terminal, persistir `externalStatus` com instrução de revisão/reenvio e causa técnica resumida quando disponível.

**Racional:** melhora diagnóstico operacional e reduz ambiguidade para o usuário final.
