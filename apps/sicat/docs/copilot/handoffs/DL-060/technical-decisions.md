# Technical Decisions — DL-060

## 1) Fix no backend + fallback no frontend
**Decisão:** aplicar correção no backend como fonte principal e fallback no frontend para cobrir documentos legados.

**Motivo:**
- Backend define o `Content-Disposition` oficial.
- Frontend protege o usuário quando metadados antigos ainda retornarem nome desatualizado.

## 2) Padrão de nomenclatura explícito
**Decisão:** consolidar padrão `mtr_<numeroMTR>.pdf` (underscore), conforme requisito funcional.

**Motivo:**
- Alinhamento direto com expectativa operacional reportada.

## 3) Prioridade para número externo resolvido
**Decisão:** nome baseado em `manNumero` sempre que disponível.

**Motivo:**
- Evita nome com ID interno/código transitório após finalização da integração.
