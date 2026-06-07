# Orchestration - chat-copiloto-operacional

## Demanda resumida
Refatoracao completa da camada conversacional do SICAT para operar manifestos, CDF/CDR, jobs, auditoria e documentos (PDF/ZIP) de ponta a ponta no chat, com seguranca, confirmacao, memoria operacional, artifacts clicaveis, frontend rico, testes e documentacao.

## Classificacao

```yaml
orchestration:
  work_id: "chat-copiloto-operacional"
  intent: "refactor"
  complexity: "complex"
  domains:
    - "backend-contract"
    - "domain-rules"
    - "frontend-ux"
    - "persistence-worker"
    - "observability-admin"
    - "qa"
    - "docs"
  first_agent: "programador-backend-mtr"
  phase_sequence:
    - phase: "03-backend-contracts"
      agent: "programador-backend-mtr"
      required: true
      reason: "refatorar camada conversacional backend, contrato /v1/conversations/turns, tool registry, planner/dispatcher, policy e normalizacao"
    - phase: "05-domain-rules"
      agent: "manifestos-operacional-mtr"
      required: true
      reason: "garantir regras operacionais de manifestos/CDF/jobs/auditoria, confirmacoes e batch actions"
    - phase: "04-persistence-worker"
      agent: "postgres-queue-mtr"
      required: true
      reason: "adequar memoria conversacional, artifacts backend (incluindo ZIP), tracking de jobs e integracao com worker"
    - phase: "07-observability-admin"
      agent: "dashboard-observability-mtr"
      required: true
      reason: "telemetria, auditoria e rastreabilidade de turnos/tools/artifacts sem dados sensiveis"
    - phase: "06-frontend-ux"
      agent: "frontend-vue-ux-mtr"
      required: true
      reason: "renderizacao rica no chat (cards, listas, artifacts, confirmacoes, progresso e erros amigaveis)"
    - phase: "localhost-availability"
      agent: "estrutura-vscode-mtr"
      required: false
      reason: "subir stack local para validacoes manuais ou smoke operacional quando necessario"
    - phase: "09-qa-validation"
      agent: "tester-qa-mtr"
      required: true
      reason: "cobertura de testes backend/frontend e execucao de typecheck e suites alvo"
    - phase: "10-documentation-final"
      agent: "documentador-mtr"
      required: true
      reason: "consolidar arquitetura final, contratos, riscos remanescentes e handoff de entrega"
```

## Criterios de pronto da cadeia
- Chat operacional com consulta e acao ponta a ponta para manifestos, CDF/CDR, jobs e auditoria.
- Resolucao de referencias contextuais (ex.: ultimo, esse, os listados) com memoria conversacional operacional.
- Confirmacao obrigatoria para acoes sensiveis e bloqueio deterministico sem confirmacao.
- Artifacts clicaveis no chat para PDF e ZIP com fluxo robusto de erro/progresso.
- Contrato conversacional padronizado e compativel para renderizacao frontend por result.type.
- Observabilidade completa por turno/ferramenta/policy/resultado sem vazamento de segredo.
- Suites alvo de validacao executadas e documentadas com status (passou/falhou) e causa.

## Checkpoints esperados
- docs/handoffs/chat-copiloto-operacional/03-backend-contracts.md
- docs/handoffs/chat-copiloto-operacional/05-domain-rules.md
- docs/handoffs/chat-copiloto-operacional/04-persistence-worker.md
- docs/handoffs/chat-copiloto-operacional/07-observability-admin.md
- docs/handoffs/chat-copiloto-operacional/06-frontend-ux.md
- docs/handoffs/chat-copiloto-operacional/09-qa-validation.md
- docs/handoffs/chat-copiloto-operacional/10-documentation-final.md

## Handoff imediato
Proximo owner: programador-backend-mtr

Objetivo da proxima fase:
1. Entregar diagnostico inicial curto exigido pela demanda (estado atual, tools, lacunas, APIs disponiveis, acoplamentos, riscos, plano).
2. Implementar Fase 1 e Fase 2 solicitadas pelo usuario (inventario + nova arquitetura de tools) com base nos arquivos obrigatorios.
3. Iniciar Fase 3 (manifestos) no backend conversacional sem quebrar contrato vigente.
4. Registrar checkpoint de fase com arquivos alterados, validacoes executadas e pendencias para proximo owner.

## Andamento da cadeia
- 2026-04-25: fase 03-backend-contracts concluida por programador-backend-mtr.
- Evidencia: docs/handoffs/chat-copiloto-operacional/03-backend-contracts.md.
- Resultado: arquitetura modular de tools implementada no backend conversacional, com validacao deterministica, normalizacao de resposta e inicio da fase de manifestos.
- 2026-04-25: fase 05-domain-rules concluida por manifestos-operacional-mtr.
- Evidencia: docs/handoffs/chat-copiloto-operacional/05-domain-rules.md.
- Resultado: regras operacionais de manifestos/CDF no chat com guardrails de confirmacao, lote seguro e erros operacionais amigaveis.
- 2026-04-25: fase 04-persistence-worker concluida por postgres-queue-mtr.
- Evidencia: docs/handoffs/chat-copiloto-operacional/04-persistence-worker.md.
- Resultado: memoria operacional persistida, artifacts rastreaveis e ZIP backend via worker para documentos multiplo.
- 2026-04-25: fase 07-observability-admin concluida por dashboard-observability-mtr.
- Evidencia: docs/handoffs/chat-copiloto-operacional/07-observability-admin.md.
- Resultado: trilha estruturada por turno/tool, sanitizacao de dados sensiveis e metricas operacionais ampliadas.
- 2026-04-25: fase 06-frontend-ux concluida por frontend-vue-ux-mtr.
- Evidencia: docs/handoffs/chat-copiloto-operacional/06-frontend-ux.md.
- Resultado: renderer rico por result.type com cards, artifacts, downloads, acoes e confirmacoes no chat.
- Proximo owner em cadeia: tester-qa-mtr (fase 09-qa-validation).
