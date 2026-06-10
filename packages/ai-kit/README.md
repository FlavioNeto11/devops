# @flavioneto11/ai-kit

> **Para agentes:** leia [`AGENTS.md`](./AGENTS.md) (escopo, exports, versionamento, fronteiras).

Contrato compartilhado de IA (gpt-5/reasoning) da plataforma. **Zero dependências de runtime**:
o cliente OpenAI é injetado por quem chama; para LangChain devolvemos os _args_ do construtor.

Por quê: modelos de reasoning (`gpt-5*`, `o*`) rejeitam `temperature != 1` → este pacote centraliza
"omitir temperature + usar `reasoning_effort`" e o timeout/fallback gracioso, hoje duplicados em
SICAT (LangChain) e GymOps (SDK nativo).

## SDK nativo (GymOps)
```js
import OpenAI from 'openai';
import { chatJSON, chatText, callWithFallback } from '@flavioneto11/ai-kit';

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const draft = await callWithFallback(
  (c) => chatJSON(c, prompt, { model: process.env.OPENAI_MODEL || 'gpt-5-nano',
                               reasoningEffort: process.env.OPENAI_REASONING_EFFORT || 'low' }),
  fallback, 20_000, client,
);
```

## LangChain (SICAT)
```js
import { ChatOpenAI } from '@langchain/openai';
import { buildChatOpenAIArgs, isReasoningModel } from '@flavioneto11/ai-kit';

const model = new ChatOpenAI(
  buildChatOpenAIArgs('gpt-5', apiKey, { reasoningEffort: process.env.OPENAI_REASONING_EFFORT || 'minimal' }),
);
```

## API
- `isReasoningModel(model)` · `resolveReasoningEffort(fallback)`
- `buildChatParams(model, { reasoningEffort, temperature, jsonMode })` — params do SDK nativo
- `buildChatOpenAIArgs(model, apiKey, { reasoningEffort, temperature })` — args do ChatOpenAI
- `withTimeout(promise, ms)` · `callWithFallback(fn, fallback, ms, client)`
- `chatJSON(client, prompt, opts)` · `chatText(client, messages, opts)`

`peerDependencies` opcionais: `openai` (para `chatJSON/chatText`), `@langchain/openai` (para construir o ChatOpenAI).

## Testes
```
npm test   # node --test (zero deps)
```
Ver [`docs/standards/shared-libraries-and-versioning.md`](../../docs/standards/shared-libraries-and-versioning.md).
