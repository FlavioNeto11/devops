# Skill: Agent Orchestration MTR

## Quando usar

Use esta skill para demandas que exigem entrega completa com escalonamento entre especialistas.

## Objetivo

Padronizar como o `orquestrador-mtr` decide delegação por necessidade, evitando lacunas entre código, teste, contrato e documentação.

O `orquestrador-mtr` usa esta skill para decompor e delegar. Ele não executa diretamente implementação, validação ampla nem operações finais de git quando existir especialista aplicável.

## Matriz de escalonamento

- **Backend/rotas/services/repositories** → `programador-backend-mtr`
- **Integração CETESB real** → `integrador-cetesb-mtr`
- **Postgres, migrations, fila, worker, retry** → `postgres-queue-mtr`
- **Testes/smoke/contrato** → `tester-qa-mtr`
- **Frontend Vue.js, CSS avançado, UX e navegação** → `frontend-vue-ux-mtr`
- **Documentação/roadmap/decision-log** → `documentador-mtr`
- **Evolução de agents/prompts/skills/instructions/workflows** → `meta-evolution-copilot`

## Skills complementares

- `contract-first-openapi`
- `cetesb-gateway-real`
- `postgres-job-queue`
- `qa-smoke-flows`
- `frontend-vue-ux-orchestration`
- `mempalace-memory-orchestration` (quando o runtime expuser mempalace e houver valor real em memória durável da cadeia)

## Regras críticas

- Se a solicitação combinar múltiplos verbos operacionais ou múltiplos owners, a resposta obrigatória é uma cadeia de especialistas.
- `tester-qa-mtr` é owner de validação, smoke e regressão.
- `documentador-mtr` é owner da documentação final.
- `ci-cd-github-mtr` é owner de pre-merge, workflow e operações finais de git quando aplicável.
- Se mempalace estiver disponível, consulte primeiro os checkpoints versionados e só depois use mempalace para continuidade por `work_id` e memória de repositório/workspace.
- Se o runtime não puder continuar, retorne `next_agent_required` para o próximo owner em vez de absorver a fase.

## Checklist de completude

1. código implementado
2. contrato alinhado (se aplicável)
3. testes e smoke executados
4. documentação atualizada
5. riscos/pêndencias registrados
