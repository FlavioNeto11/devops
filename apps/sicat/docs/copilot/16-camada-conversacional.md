# Camada conversacional operacional do SICAT

## Visao geral

Esta trilha define a camada conversacional operacional do SICAT como um dominio transversal do produto.

Ela nao deve ser tratada como chatbot generico.
Ela deve ser tratada como:
- assistente operacional
- copiloto de execucao
- guia de navegacao
- interface simplificada para usuarios com baixa familiaridade com sistemas complexos

## Primeira onda

A primeira onda de entrega desta capacidade cobre:

1. backend conversacional reutilizavel
2. popup interno dentro da plataforma principal
3. homepage comunicando o diferencial conversacional
4. app light tipo chat dentro do ecossistema SICAT
5. hardening, telemetria, testes e readiness da experiencia nativa

## Segunda onda

A segunda onda cobre:

1. canal WhatsApp operacional
2. identidade de canal e vinculacao telefone ↔ usuario SICAT
3. politicas e limites especificos de mensageria externa
4. fallback de canal externo
5. readiness de operacao em canal terceirizado

## Regra de arquitetura

A camada conversacional deve respeitar a arquitetura atual do projeto:

`routes -> services -> validators -> repositories / gateways / lib`

A IA nao deve acessar diretamente:
- banco
- gateway CETESB
- payloads externos sem policy layer
- acoes sensiveis sem autorizacao

## Pilares

- canal
- contexto
- policy layer
- tools
- orquestracao
- auditoria
- memoria
- observabilidade

## Uso de IA

O uso de modelo generativo deve ficar concentrado no backend conversacional.

O frontend deve:
- coletar contexto
- exibir thread
- exibir cards de acao
- permitir confirmacoes
- consumir API conversacional

## Arquitetura de IA — estado atual

Todo acesso ao modelo de IA passa pelo módulo centralizado `src/services/conversation/ai-config.ts`.
Nenhum serviço, worker ou rota instancia LLM diretamente fora deste módulo.

### Stack de IA

| Camada | Tecnologia |
|---|---|
| Modelo | OpenAI (via `@langchain/openai`) |
| Abstração | LangChain (`ChatOpenAI`) |
| Orquestração | LangGraph (`StateGraph(MessagesAnnotation)`) |
| Tracing | LangSmith (auto-instrumentado via env vars) |
| Configuração | `ai-config.ts` (lê env vars; lança `AppError 503` se `OPENAI_API_KEY` ausente) |

### Fluxo interno

```
conversation-service.ts
  → llm-provider.ts
    → ai-config.ts  (lê env, propaga LANGSMITH_* → LANGCHAIN_*)
    → ChatOpenAI + StateGraph
    → LlmPlan { provider: 'langchain', outputText, toolCall, confidence }
```

### Env vars obrigatórias

```dotenv
# Obrigatória
OPENAI_API_KEY=sk-...

# Opcional — default: gpt-4o-mini
OPENAI_MODEL=gpt-4o-mini

# Opcionais — tracing LangSmith
LANGSMITH_API_KEY=ls__...
LANGSMITH_PROJECT=sicat-conversacional
LANGSMITH_TRACING=true
```

### Ferramentas registradas (function calling)

`navigateDashboard` · `createManifest` · `listManifests` · `viewManifest` ·
`printManifest` · `listActiveJobs` · `getJobStatus` · `navigateHelp`

### Erros esperados

| Situação | HTTP |
|---|---|
| `OPENAI_API_KEY` ausente | `503` |
| Falha na chamada LLM | `502` |

## Superfícies da primeira onda

| Superfície | Arquivo | Status |
|---|---|---|
| Popup interno | `frontend/src/components/conversation/InAppCopilotAssistant.vue` | ✅ |
| App light | `frontend/src/views/ConversationalChatAppView.vue` | ✅ |
| WhatsApp | — | 🔲 Segunda onda |

O app light está integrado no shell autenticado (`hideShell`/`fullBleed` removidos do router).
O popup exibe uma linha de contexto compacta; sem metadados de debug nas mensagens.

## Trilha complementar

Leia tambem:
- `docs/copilot/conversacional/01-visao-geral.md`
- `docs/copilot/conversacional/02-canais-e-experiencia.md`
- `docs/copilot/conversacional/03-arquitetura-conversacional.md`
- `docs/copilot/conversacional/04-intencoes-e-acoes.md`
- `docs/copilot/conversacional/05-seguranca-e-autorizacao.md`
- `docs/copilot/conversacional/06-memoria-e-contexto.md`
- `docs/copilot/conversacional/07-fallback-e-handoff.md`
- `docs/copilot/conversacional/08-telemetria-auditoria.md`
- `docs/copilot/conversacional/09-homepage-e-posicionamento.md`
- `docs/copilot/conversacional/13-inapp-popup-experience.md`
- `docs/copilot/conversacional/14-light-app-experience.md`
