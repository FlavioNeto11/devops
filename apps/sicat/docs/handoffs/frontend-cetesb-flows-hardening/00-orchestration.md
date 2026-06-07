# 00 - Orchestration

## Demanda original (resumo)

Mitigar os riscos residuais ainda abertos na entrega frontend dos fluxos CETESB de recebimento de manifesto, geracao de CDF e consulta/download de certificados, elevar a cobertura para o nivel mais completo viavel no ambiente atual e publicar o resultado no repositorio.

## Dependencia de origem

- Workstream frontend ja publicado: `docs/handoffs/frontend-cetesb-receive-cdf-flows/`
- Workstream backend/origem funcional: `docs/handoffs/cetesb-mtr-real-receive-cdf-flows/`

## Classificacao obrigatoria

```yaml
orchestration:
  work_id: "frontend-cetesb-flows-hardening"
  intent: "validate"
  complexity: "complex"
  domains:
    - "qa"
    - "frontend-ux"
    - "external-integration"
    - "docs"
    - "ci"
  first_agent: "tester-qa-mtr"
  phase_sequence:
    - phase: "09-qa-validation"
      agent: "tester-qa-mtr"
      required: true
      reason: "A primeira necessidade e transformar os riscos residuais documentados em cobertura concreta e findings acionaveis no ambiente atual, inclusive com tentativa de validacao mais realista."
    - phase: "06-frontend-ux"
      agent: "frontend-vue-ux-mtr"
      required: false
      reason: "Caso QA identifique lacunas mitigaveis na interface ou nos testes frontend, a correcao deve voltar ao owner de frontend."
    - phase: "02-integration"
      agent: "integrador-cetesb-mtr"
      required: false
      reason: "Caso a mitigacao dependa de comportamento real de sessao, stream ou download remoto fora do frontend, o owner de integracao deve assumir."
    - phase: "10-documentation-final"
      agent: "documentador-mtr"
      required: true
      reason: "Consolidar cobertura executada, riscos efetivamente mitigados, limites remanescentes e status final do hardening."
    - phase: "11-release-readiness"
      agent: "ci-cd-github-mtr"
      required: true
      reason: "Publicar somente apos a cadeia de mitigacao e validacao estar consolidada pelo owner operacional apropriado."
```

## Critérios de pronto

- riscos residuais do workstream frontend anterior sao reavaliados de forma objetiva;
- toda mitigacao viavel no ambiente atual e implementada pelo owner correto;
- cobertura automatizada e/ou smoke relevante e ampliada quando houver espaco real para isso;
- limites que dependam de ambiente real externo ficam explicitamente comprovados, nao apenas assumidos;
- resultado consolidado e publicado neste novo work_id.

## Checkpoints esperados

- `docs/handoffs/frontend-cetesb-flows-hardening/00-orchestration.md`
- `docs/handoffs/frontend-cetesb-flows-hardening/09-qa-validation.md`
- `docs/handoffs/frontend-cetesb-flows-hardening/06-frontend-ux.md` (se necessario)
- `docs/handoffs/frontend-cetesb-flows-hardening/02-integration.md` (se necessario)
- `docs/handoffs/frontend-cetesb-flows-hardening/10-documentation-final.md`
- `docs/handoffs/frontend-cetesb-flows-hardening/11-release-readiness.md`

## Handoff imediato

Proximo agente obrigatorio: `tester-qa-mtr`.

Objetivo da fase 09: reexecutar a cobertura do fluxo com foco nos riscos ainda abertos do workstream frontend anterior, tentar elevar a validacao para o nivel mais completo viavel nesta maquina e devolver findings priorizados com owner explicito quando houver necessidade de correcao.