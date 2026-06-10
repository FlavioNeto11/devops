# @flavioneto11/ai-core

Núcleo compartilhado da **plataforma de IA** (re-engenharia F0+). Padroniza TODOS os acessos a IA
dos apps (SICAT, GymOps, ...) em uma estrutura única:

| Módulo | O que dá |
|---|---|
| `provider` | preço por modelo (env-overridável) e custo estimado por tokens (`estimateCostUsd`, `extractTokenUsage`) |
| `tools` | contrato **AiTool** (Zod-like, `authorize` por **identidade** — nunca por canal, `dry-run`, confirmação p/ mutação/R4), registry e `dispatchTool` |
| `observability` | métricas Prometheus canônicas `ai_*` (`createAiMetrics`) e tracer plugável (`createAiTracer`) — **Langfuse default**, LangSmith via env do LangChain |
| `kpi` | catálogo canônico de KPIs (groundedness, tool-call accuracy, custo/conversa, p95, ...) |
| `eval` | harness de golden sets JSONL: assertions determinísticas + LLM-as-judge (gpt-5-nano) |

O contrato de modelo (gpt-5/reasoning_effort/timeout/fallback) segue no
[`@flavioneto11/ai-kit`](../ai-kit/README.md), **re-exportado** aqui.

## Princípios
- **Zero dependências de runtime** — `prom-client`/`langfuse`/`openai` são peers opcionais e os
  clientes são **estruturais** (injetados pelo app). Sem eles, telemetria vira no-op e o caminho de
  IA nunca quebra por causa de observabilidade.
- **A IA nunca tem mais permissão que o usuário** — `AiTool.authorize(ctx)` recebe a identidade
  (OIDC/sessão do app) e decide por escopo.
- **Mutação sempre passa por dry-run → preview → confirmação** (`confirmedToolCallId`); risco `R4`
  (destrutivo) exige confirmação sempre.

## Uso (app)
```js
import {
  createToolRegistry, dispatchTool,
  createAiMetrics, createAiTracer,
  estimateCostUsd, extractTokenUsage,
  parseGoldenSetJsonl, runEval,
} from '@flavioneto11/ai-core';
import promClient from 'prom-client';

const metrics = createAiMetrics({ promClient, app: 'gymops' });
const tracer = createAiTracer({ metrics, app: 'gymops' /*, langfuse */ });

const registry = createToolRegistry([{
  name: 'query_overdue', description: 'Lista atividades atrasadas da unidade',
  specialist: 'ops', risk: 'R1', mutates: false,
  inputSchema: zodSchema, // qualquer objeto com .parse()
  authorize: async ({ identity }) => ({ allowed: canReadUnit(identity) }),
  execute: async (input) => db.listOverdue(input),
}]);

const t = tracer.traceFor({ name: 'chat-turn', sessionId });
const r = await t.span('tools', { input }, () => dispatchTool(registry.get('query_overdue'), input, { identity }));
```

## Tracing
- **Langfuse (default)**: passe a instância (`new Langfuse({...})`) em `createAiTracer({ langfuse })`.
- **LangSmith (opcional)**: nada a fazer aqui — exporte `LANGCHAIN_TRACING_V2=true` +
  `LANGCHAIN_API_KEY` e o LangChain/LangGraph traceia sozinho (chaves só no backend).

## Eval / golden sets
Arquivo JSONL (1 caso por linha, `#` comenta):
```json
{"id":"gym-chat-001","input":{"q":"o que está atrasado?"},"expected":{"toolName":"query_overdue","contains":["atrasad"]},"judge":["groundedness"]}
```
`runEval(cases, { runner, judgeClient, sample })` → `{ total, passed, toolCallAccuracy, judgeAverages, byCase }`;
`summarizeEvalKpis(results)` compara com as metas do catálogo. Em PR use `sample` (subset) com
gpt-5-nano; o set completo roda no nightly.

## Testes
`npm test` (node:test, sem rede). Publicação/vendoring: ver
[`shared-libraries-and-versioning.md`](../../docs/standards/shared-libraries-and-versioning.md)
(`scripts/vendor-packages.ps1` gera os `.tgz` por app).
