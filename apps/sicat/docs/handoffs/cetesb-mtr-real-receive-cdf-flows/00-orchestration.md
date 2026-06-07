# 00 - Orchestration

## Demanda original (resumo)
Implementar 3 fluxos reais CETESB/SIGOR MTR baseados em HARs como fonte de verdade:
- recebimento de MTR
- geração de CDF
- download de CDF

Com alinhamento ponta a ponta em OpenAPI, operações geradas, rotas, services, repositórios/jobs/worker, gateway CETESB, persistência/documentos e testes.

## Classificação obrigatória

```yaml
orchestration:
  work_id: "cetesb-mtr-real-receive-cdf-flows"
  intent: "implement"
  complexity: "complex"
  domains:
    - "source-validation"
    - "external-integration"
    - "backend-contract"
    - "persistence-worker"
    - "domain-rules"
    - "qa"
    - "docs"
  first_agent: "validador-cetesb-mtr"
  phase_sequence:
    - phase: "01-source-validation"
      agent: "validador-cetesb-mtr"
      required: true
      reason: "HARs CETESB/SIGOR são fonte de verdade para chamadas, payloads, headers funcionais, datas, códigos e respostas."
    - phase: "02-integration"
      agent: "integrador-cetesb-mtr"
      required: true
      reason: "Implementar/ajustar métodos no gateway centralizando as chamadas remotas com sessão, sanitização e auditoria."
    - phase: "03-backend-contracts"
      agent: "programador-backend-mtr"
      required: true
      reason: "Atualizar OpenAPI, operations geradas, rotas e serviços para comandos assíncronos 202 e consultas internas."
    - phase: "04-persistence-worker"
      agent: "postgres-queue-mtr"
      required: true
      reason: "Implementar operações de job, handlers de worker, persistência documental/metadata e outcomes com retry/DLQ."
    - phase: "05-domain-rules"
      agent: "manifestos-operacional-mtr"
      required: true
      reason: "Assegurar regras operacionais de seleção de manifesto/certificado e montagem de payload CETESB fiel aos HARs."
    - phase: "09-qa-validation"
      agent: "tester-qa-mtr"
      required: true
      reason: "Cobrir testes unitários, gateway com mocks HAR, worker, API 202 e validações de contrato."
    - phase: "10-documentation-final"
      agent: "documentador-mtr"
      required: true
      reason: "Consolidar handoff final com arquivos alterados, mapeamento CETESB e guia de validação manual."
```

## Critérios de pronto
- HARs citados explicitamente como fonte de verdade no handoff técnico.
- Fluxo `manifest.receive` completo incluindo impressão/armazenamento de comprovante PDF.
- Fluxo `cdf.generate` completo com busca de responsáveis/parceiro/manifestos e criação do certificado.
- Fluxo `cdf.download` completo com pesquisa de certificados e download PDF por `cerHashCode`.
- Sem hardcode/exposição de credenciais sensíveis dos HARs.
- Consistência entre OpenAPI, operations, rotas, serviços, worker e gateway.
- Validações: typecheck, testes e validações de contrato/openapi/cetesb-source/har-gateway executadas (ou falhas justificadas).

## Checkpoints esperados
- `docs/handoffs/cetesb-mtr-real-receive-cdf-flows/01-source-validation.md`
- `docs/handoffs/cetesb-mtr-real-receive-cdf-flows/02-integration.md`
- `docs/handoffs/cetesb-mtr-real-receive-cdf-flows/03-backend-contracts.md`
- `docs/handoffs/cetesb-mtr-real-receive-cdf-flows/04-persistence-worker.md`
- `docs/handoffs/cetesb-mtr-real-receive-cdf-flows/05-domain-rules.md`
- `docs/handoffs/cetesb-mtr-real-receive-cdf-flows/09-qa-validation.md`
- `docs/handoffs/cetesb-mtr-real-receive-cdf-flows/10-documentation-final.md`

## Handoff imediato
Próximo agente obrigatório: `validador-cetesb-mtr`.
Objetivo da fase 01: extrair contratos e sequência real dos 3 HARs, produzir mapeamento objetivo para implementação sem invenções de endpoint.
