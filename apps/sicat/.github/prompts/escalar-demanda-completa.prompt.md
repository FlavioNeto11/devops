---
name: escalar-demanda-completa
description: 'Orquestra uma demanda completa com escalonamento automático por especialidade, usando agentes, skills e instruções do repositório.'
agent: orquestrador-mtr
argument-hint: 'Descreva o objetivo, escopo, restrições e definição de pronto.'
---

# Escalar Demanda Completa

**Contexto:** orquestrar demanda de ponta a ponta com escalonamento automático por especialidade.

**Agente:** `orquestrador-mtr`

## Demanda solicitada

${input:demanda:Descreva objetivo, escopo, restrições e definição de pronto}

Fluxo obrigatório:

1. Ler contexto em `docs/copilot/` e mapear impacto em contrato, banco, worker, integração e docs.
2. Selecionar skills aplicáveis:
   - `contract-first-openapi`
   - `cetesb-gateway-real`
   - `postgres-job-queue`
   - `qa-smoke-flows`
3. Escalar subagentes por necessidade:
   - código: `programador-backend-mtr`
   - integração CETESB: `integrador-cetesb-mtr`
   - persistência/fila: `postgres-queue-mtr`
   - testes/QA: `tester-qa-mtr`
   - documentação: `documentador-mtr`
4. Consolidar somente a cadeia de ownership e o próximo handoff; não implementar diretamente as fases no `orquestrador-mtr`.

Regras críticas:

- Se a demanda combinar `validar`, `corrigir`, `documentar`, `commitar` ou `pushar`, trate como sequência multi-owner.
- `tester-qa-mtr` é owner de validações e regressão.
- `ci-cd-github-mtr` é owner de prontidão de workflow e operações finais de git, quando aplicável.
- Se o runtime não puder continuar, retornar `next_agent_required` para o próximo owner em vez de absorver a execução.

Saída esperada:

- resumo do problema e solução
- arquivos alterados por área
- testes/smokes/validações executados
- riscos, pendências e próximos passos
