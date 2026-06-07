# AI Control Center — 02 · Runtime Dinâmico (registry + policy + llm-provider)

> Work ID: `ai-control-center` · Branch: `feature/ai-control-center-langfuse`
> FASE 2 · Depende de: migration 017, `ai-tool-admin-repo` · Habilita: tools/agents API, policy governada

## 1. Objetivo

Tornar o catálogo de tools/agents **dinâmico** (defaults de código + overrides do banco) **sem
quebrar** o fluxo conversacional. Princípio inegociável: **sem linhas em `ai_tools`/`ai_agents`, o
comportamento é byte-a-byte idêntico ao atual** (`getActiveToolSchemas` retorna a mesma referência;
`resolveEffectiveToolPolicy` retorna o `codeDefault`). `/v1/conversations/turns` e
`/v1/conversations/tools` permanecem intactos.

## 2. Runtime registry — `ai-runtime-registry-service.ts`

Fonte unificada do catálogo em runtime. Combina (a) defaults de `tool-registry.ts` + schemas de
function-calling, com (b) overrides de `ai_tools` (`enabled`, policy, schema, versão ativa).
**Não importa o `llm-provider`** (evita ciclo): recebe os defaults por parâmetro.

### 2.1 Snapshot stale-while-revalidate

Estado em memória: `RegistrySnapshot { overridesByName, disabledToolNames, version, loadedAt }`.
`STALE_MS = 30_000`. Helpers síncronos (`isRuntimeToolEnabled`, `resolveEffectiveToolPolicy`,
`getActiveToolSchemas`) chamam `ensureFreshness()`, que dispara um `refreshRuntimeRegistry()`
**assíncrono e fire-and-forget** quando o snapshot está velho — nunca bloqueia a chamada corrente.

### 2.2 Fail-safe

`refreshRuntimeRegistry()` **nunca lança**. Em erro de DB ele mantém o último snapshot bom e apenas
atualiza `loadedAt` (para não martelar o banco). Em boot, o snapshot inicial está vazio
(`disabledToolNames` vazio) → tudo habilitado → comportamento default.

### 2.3 Versão e invalidação do cache de grafos

- `getRuntimeToolsVersion(): number` — versão atual do snapshot.
- `bumpRuntimeToolsVersion(): void` — incrementa a versão; chamado após mutação administrativa.
- `refreshRuntimeRegistry()` também incrementa a versão ao recarregar.

O planner do `llm-provider` cacheia um grafo **por especialista** com chave
`${specialist.id}:${getRuntimeToolsVersion()}` (`llm-provider.ts:1898`). Quando a versão muda, a
chave muda e o grafo é reconstruído com o conjunto de tools atualizado — sem reinício do processo.

### 2.4 API exportada

| Símbolo | Tipo | Uso |
|---|---|---|
| `getRuntimeToolsVersion()` | sync | chave de cache do grafo |
| `bumpRuntimeToolsVersion()` | sync | invalida grafos pós-mutação |
| `refreshRuntimeRegistry()` | async, never-throws | recarrega overrides do DB |
| `isRuntimeToolEnabled(toolName)` | sync | gate `TOOL_DISABLED` na policy |
| `getActiveToolSchemas(defaults)` | sync | filtra schemas desabilitados (mesma ref. se nada desabilitado) |
| `resolveEffectiveToolPolicy(toolName, codeDefault)` | sync | overlay de policy (default + override) |
| `getRuntimeToolDefinitions()` | async (refresh síncrono) | visão mesclada p/ a API admin |

`normalizePolicyOverride()` faz merge campo-a-campo (`riskLevel`, `allowChannels` só se não-vazio,
`requiresConfirmation`, `isAction`); campos ausentes no override caem no `codeDefault`.

## 3. Consumo no `llm-provider.ts` (aditivo, compat total)

- `export const CONVERSATION_TOOLS: FunctionTool[]` (`:200`) — schemas default exportados (passaram a
  ser reutilizados pela administração de tools).
- `getRuntimeConversationToolSchemas()` (`:653`) — `return getActiveToolSchemas(CONVERSATION_TOOLS)`.
  Comentário do código: *"Sem overrides no banco, retorna exatamente `CONVERSATION_TOOLS` (compat total)."*
- `createEscalationGraph` (`:1826`): `llm.bindTools(getRuntimeConversationToolSchemas() ...)`.
- `conversationToolsForSpecialist` (`:1886`): filtra `getRuntimeConversationToolSchemas()` pelo
  subconjunto do especialista (`specialistToolNames`); se o filtro esvaziar, faz fallback para a
  lista completa.
- `getOrCreatePlanningGraph` (`:1897`): cache por `${specialist.id}:${getRuntimeToolsVersion()}`.

Resultado: a única mudança observável quando há overrides é a ausência dos tools desabilitados na
lista de function-calling e a policy efetiva ajustada. Sem overrides → idêntico.

## 4. Policy engine — `conversation-policy-service.ts` (3 ganchos aditivos)

| Gancho | Local | Comportamento |
|---|---|---|
| Overlay de policy | `toToolPolicy()` (`:64`) | `resolveEffectiveToolPolicy(toolName, codePolicy)` sobrepõe o default de código com o override de `ai_tools`. Sem override → `codePolicy`. |
| Bloqueio `TOOL_DISABLED` | `evaluateConversationPolicy` (`:565`) | Se `!isRuntimeToolEnabled(toolName)` → `buildPolicyBlockedDecision({ reasonCode: 'TOOL_DISABLED' })`. Avaliado **antes** dos demais gates. |
| Bloqueio `AI_CONTROL_READONLY` | `evaluateConversationPolicy` (`:612`) | Se `effectivePolicy.isAction && isAiControlReadOnly()` → `buildPolicyBlockedDecision({ reasonCode: 'AI_CONTROL_READONLY' })`. Bloqueia **toda ação operacional** no modo somente-leitura. |

Ambos os bloqueios são decisões de policy normais (mesmo caminho de `CHANNEL_BLOCKED`,
`PERMISSION_DENIED` etc.), então fluem para telemetria/SSE como `status: 'blocked'` com o respectivo
`reasonCode`. Tools de leitura (`isAction:false`) **não** são afetados por `AI_CONTROL_READONLY`.

## 5. Serviços admin de tools/agents

### 5.1 `ai-tool-admin-service.ts`

Mescla `getRuntimeToolDefinitions()` (código+banco) + schema (de `CONVERSATION_TOOLS`) + stats
operacionais (de `getConversationTelemetrySnapshot().operations.tools[toolName]`).

| Função | Notas |
|---|---|
| `listRuntimeTools()` → `AiRuntimeTool[]` | inclui `hasSchema`, `schema`, `policy`, `stats {total,responded,executed,blocked,failed}`. |
| `getRuntimeTool(toolName)` | filtra a lista. |
| `patchRuntimeTool(toolName, patch, actorUserId)` | normaliza `riskLevel` (`R1..R4`) e `allowChannels` (`whatsapp\|native_chat\|inapp`); faz `upsertAiToolOverride` (source `db`) + `insertAiToolVersion` (snapshot da policy, `createdBy`); depois `refreshRuntimeRegistry()` **e** `bumpRuntimeToolsVersion()` → invalida grafos. |
| `listRuntimeToolVersions(toolName)` | histórico via `ai_tool_versions`. |

### 5.2 `ai-agent-admin-service.ts`

Defaults de `listConversationSpecialists()`; overrides de `ai_agents`.

| Função | Notas |
|---|---|
| `listRuntimeAgents()` → `AiRuntimeAgent[]` | une especialistas de código (source `code`) e agents só-DB (source `db`); `config` cai para `{focus,intents,knowledgeTopics}` do especialista quando não há override. |
| `getRuntimeAgent(agentName)` | filtra a lista. |
| `patchRuntimeAgent(agentName, patch, _actor)` | `upsertAiAgentOverride` (description/toolNames/promptName/enabled/config). Não faz bump de versão de tools (agente não altera schemas de function-calling). |

## 6. Garantias de compatibilidade (resumo)

- Contratos públicos preservados: `getConversationToolInventory`, `listConversationTools`,
  `dispatchConversationTool`, `evaluateConversationPolicy` mantêm assinatura.
- Endpoints `/v1/conversations/turns` e `/v1/conversations/tools` **inalterados**.
- Sem linhas de override → mesma lista de tools, mesma policy, mesmo grafo.
- Erro de DB no registry → fail-safe (último snapshot bom; nunca derruba um turn).

## 7. Pendências conhecidas

- `patchRuntimeTool` usa `new Date().toISOString()` como `version` (carimbo temporal), não SemVer.
- A edição de schema de tool pela API ainda não é exposta (o `schema_json` é propagado a partir do
  schema de código atual); a tela edita policy/enabled. Ver handoff 08.
