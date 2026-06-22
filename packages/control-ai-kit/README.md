# @flavioneto11/control-ai-kit

IA de **controle por app** da plataforma. Uma camada fina que dá a um app:

1. **Prompts versionados** puxados do [`ai-control-plane`](../../apps/ai-control-plane/README.md)
   com **timeout curto + cache + fallback OFFLINE** para um prompt versionado no
   próprio repo do app. O control-plane fica **fora do caminho crítico**: se cair
   (ou não estiver configurado), nada quebra — caímos para o fallback embarcado.
2. Uma **fábrica fina de grafo** sobre [`@flavioneto11/ai-core`](../ai-core), que é
   declarado como **peer dependency** e **não é vendorizado aqui**. O app consumidor
   já vendoriza o `ai-core` via o bloco de capacidade **`ia-grafo`**.

**Fail-closed:** sem um LLM, a control AI **não sobe** (`ControlAiConfigError`) —
nunca degrada para "sem IA" silenciosamente.

> **Distinta do bloco `ia-grafo`:** o bloco `ia-grafo` entrega o **MOTOR** (o
> `ai-core` vendorizado, tools, observabilidade). Esta kit entrega a **IA de
> controle por app**: prompt governado (control-plane + fallback) + o fail-closed.

## Instalação (no app consumidor)

Esta kit tem **zero deps de runtime** e um único **peer**:

```jsonc
// package.json do app
"dependencies": {
  "@flavioneto11/control-ai-kit": "file:../../packages/control-ai-kit",
  "@flavioneto11/ai-core": "file:../../packages/ai-core"  // o peer (via bloco ia-grafo)
}
```

## Uso

```js
import { createControlAi } from '@flavioneto11/control-ai-kit';
import { createOpenAiLlm, createToolRegistry } from '@flavioneto11/ai-core';

const llm = createOpenAiLlm({ apiKey: process.env.OPENAI_API_KEY });
const registry = createToolRegistry([/* tools do dominio */]);

const ai = createControlAi({
  appName: 'myapp',
  llm,                       // OBRIGATORIO — sem ele a kit falha-fechada
  registry,                  // toolRegistry do ai-core (opcional)
  prompts: {                 // FALLBACK versionado no repo
    triage: 'Você é um assistente de triagem do myapp...',
  },
  controlPlaneUrl: process.env.AI_CONTROL_PLANE_URL, // ai-control-plane (opcional)
});

const answer = await ai.ask({ prompt: 'triage', input: 'meu pedido não chegou' });
```

Exemplar executável: [`example/usage.js`](./example/usage.js).

### Produção vs. teste

`ask` importa o `@flavioneto11/ai-core` **lazily** e monta
`createAiGraph({ llm, registry })` (o motor padrão da plataforma — router → deep
ReAct → judge). Se o `ai-core` **não estiver instalado** (ex.: testes), degrada
para chamar o `llm` direto (`.complete` / `.invoke`) com o prompt resolvido como
*system message* — assim os testes rodam com um `llm` mockado, sem o peer.

## Só os prompts

```js
import { createPromptSource } from '@flavioneto11/control-ai-kit/prompt-source';

const source = createPromptSource({
  controlPlaneUrl: process.env.AI_CONTROL_PLANE_URL,
  app: 'myapp',
  fallback: { triage: 'prompt versionado no repo' },
});
const text = await source.resolve('triage'); // GET /v1/prompts/myapp.triage/active | fallback
```

Resolução: **cache (TTL)** → **control-plane** (`GET /v1/prompts/${app}.${name}/active`,
timeout 2s, `AbortController`) → **fallback local**. Só lança `ControlAiConfigError`
quando **não há nem remoto nem fallback**.

## Testes

```powershell
cd packages/control-ai-kit
node --test
```

Os testes injetam `fetchImpl` + `clock` e rodam 100% offline.

## Licença

UNLICENSED — uso interno da plataforma.
