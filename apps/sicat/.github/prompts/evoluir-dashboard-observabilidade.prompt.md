```prompt
---
name: evoluir-dashboard-observabilidade
description: 'Evolui o dashboard de observabilidade do SICAT com métricas consolidadas (backend + frontend + contrato + docs).'
agent: orquestrador-mtr
argument-hint: descreva a melhoria desejada no dashboard (métricas, visualização, alertas, tendências)
---

# Evoluir Dashboard de Observabilidade

**Contexto:** aprimorar o dashboard operacional do SICAT com visão unificada de métricas e foco em tomada de decisão.

**Agente principal:** `orquestrador-mtr` (com escalonamento para `dashboard-observability-mtr` quando apropriado)

## Demanda

${input:objetivo_dashboard:Descreva a evolução desejada (ex.: novos KPIs, ranking de latência, janela temporal, alertas)}

**Critérios de aceite (opcional):**
${input:criterios_aceite:Descreva critérios de aceite objetivos ou deixe em branco}

## Fluxo esperado

1. Analisar impacto em backend, frontend, contrato e docs.
2. Delegar para `dashboard-observability-mtr` para proposta/implementação do dashboard consolidado.
3. Sincronizar OpenAPI/examples e regenerar operações quando houver mudança de contrato.
4. Validar build e smoke de saúde.
5. Atualizar decision-log, roadmap e estrutura Copilot.

## Resultado esperado

- Dashboard com payload unificado e UX consistente.
- Métricas acionáveis em bloco único (sem fragmentação desnecessária).
- Evidência de validação técnica e documentação atualizada.

## Exemplo de uso

No VS Code Copilot Chat, execute o prompt `evoluir-dashboard-observabilidade`.

Objetivo: “Adicionar visão de tendência de erro por operação com comparação 24h vs 7d e destaque de endpoints CETESB com p95 crítico.”
```
