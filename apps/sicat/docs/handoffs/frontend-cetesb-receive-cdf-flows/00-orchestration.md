# 00 - Orchestration

## Demanda original (resumo)

Pegar o que foi desenvolvido no workstream `cetesb-mtr-real-receive-cdf-flows` e implementar no frontend do SICAT para que as funcionalidades de recebimento de MTR, geracao de CDF e download de CDF fiquem disponiveis ao usuario final.

## Dependencia de origem

- Workstream de referencia: `docs/handoffs/cetesb-mtr-real-receive-cdf-flows/`
- Base funcional ja implementada no backend:
  - `POST /v1/manifestos/receive`
  - `POST /v1/cdf/generate`
  - `POST /v1/cdf/download`
  - `GET /v1/cdf/certificates`
  - `GET /v1/cdf/documents/{documentId}`

## Classificacao obrigatoria

```yaml
orchestration:
  work_id: "frontend-cetesb-receive-cdf-flows"
  intent: "implement"
  complexity: "complex"
  domains:
    - "frontend-ux"
    - "qa"
    - "docs"
    - "ci"
  first_agent: "frontend-vue-ux-mtr"
  phase_sequence:
    - phase: "06-frontend-ux"
      agent: "frontend-vue-ux-mtr"
      required: true
      reason: "A demanda principal e expor ao usuario, no frontend do SICAT, os fluxos ja disponiveis no backend para recebimento de MTR, geracao de CDF e download de CDF."
    - phase: "09-qa-validation"
      agent: "tester-qa-mtr"
      required: true
      reason: "A interface precisa ser validada nos fluxos de loading, erro, sucesso e integracao com os endpoints internos existentes."
    - phase: "10-documentation-final"
      agent: "documentador-mtr"
      required: true
      reason: "Consolidar o handoff final com telas, fluxos disponiveis, contratos consumidos e validacoes executadas."
    - phase: "11-release-readiness"
      agent: "ci-cd-github-mtr"
      required: true
      reason: "A continuidade desta frente inclui refinamento final de UX e publicacao no repositorio pelo owner operacional apropriado."
```

## Critérios de pronto

- o frontend do SICAT expõe ao usuario os fluxos de recebimento de MTR, geracao de CDF e download de CDF;
- a interface consome os endpoints internos existentes sem espalhar chamadas HTTP diretamente nos componentes; 
- estados de loading, erro, vazio e sucesso ficam tratados de forma explicita;
- a navegacao e a experiencia estao consistentes com o padrao atual do frontend;
- se surgirem gaps reais de contrato/backend durante a implementacao, o frontend deve emitir handoff explicito para o owner correto, sem absorver cross-domain silenciosamente;
- resultado documentado neste work_id;
- entrega refinada e publicada pelo owner operacional apropriado.

## Checkpoints esperados

- `docs/handoffs/frontend-cetesb-receive-cdf-flows/00-orchestration.md`
- `docs/handoffs/frontend-cetesb-receive-cdf-flows/06-frontend-ux.md`
- `docs/handoffs/frontend-cetesb-receive-cdf-flows/09-qa-validation.md`
- `docs/handoffs/frontend-cetesb-receive-cdf-flows/10-documentation-final.md`
- `docs/handoffs/frontend-cetesb-receive-cdf-flows/11-release-readiness.md`

## Handoff imediato

Proximo agente obrigatorio: `frontend-vue-ux-mtr`.

Objetivo da fase 06: mapear a estrutura atual do frontend do SICAT, localizar onde esses fluxos devem aparecer para o usuario, implementar a UX e integrar com os endpoints internos do backend ja entregues pelo workstream de origem.