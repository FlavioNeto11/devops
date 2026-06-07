---
name: evoluir-jobs-logs
description: 'Evolui a operação administrativa global do SICAT (todos os usuários/sessões) e o monitoramento de Jobs/Logs com rastreabilidade e manutenção operacional.'
agent: jobs-monitoramento-logs-mtr
argument-hint: descreva a melhoria desejada para admin global de usuários/sessões e jobs/logs (auditoria por usuário, ações de sessão, senha, filtros, performance)
---

# Evoluir Operação Admin Global + Jobs e Logs

**Contexto:** aprimorar a operação administrativa do SICAT para permitir manutenção de todos os usuários/sessões (ativos e inativos) e monitoramento de jobs/logs com rastreabilidade ponta a ponta.

**Agente principal:** `jobs-monitoramento-logs-mtr`

## Demanda

${input:melhoria_jobs:Descreva a evolução desejada (ex.: log por usuário/sessão, derrubar sessão, resetar senha, filtros por status de sessão, exportar auditoria)}

**Critérios de aceite (opcional):**
${input:criterios_aceite:Descreva critérios objetivos de pronto ou deixe em branco}

## Fluxo esperado

1. Analisar impacto em `frontend/src/views/JobsView.vue`, `frontend/src/views/SessionAccountView.vue` e endpoints de sessão/conta/jobs/auditoria.
2. Propor e implementar visão/administração de todos os usuários e sessões (ativos/inativos), com ações seguras de manutenção.
3. Cobrir estados operacionais de jobs (`queued`, `running`, `retry_wait`, `failed`, `dlq`, `succeeded`) e de sessão (`ativa`, `expirada`, `revogada`, `inativa`).
4. Validar integração com APIs de jobs/health/auditoria e de autenticação/sessão/conta.
5. Escalar para `postgres-queue-mtr` se houver mudança em queries/schema de jobs/sessões; para `integrador-cetesb-mtr` se envolver sessão/contexto CETESB real.
6. Escalar para `tester-qa-mtr` para regressão operacional/segurança e atualizar decision-log/documentação quando comportamento mudar.

## Resultado esperado

- painel/admin com visão global de usuários/sessões e ações de manutenção com trilha auditável
- monitoramento de jobs/logs com comportamento previsível em loading/erro/vazio/sucesso
- filtros/colunas que facilitem diagnóstico por usuário, sessão e correlação
- integração validada com evidência de funcionamento
