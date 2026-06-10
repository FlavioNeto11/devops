# Pacote SICAT — Agentes + Smoke Test Conversacional com IA

Este ZIP foi criado para ser extraído na raiz do workspace do projeto SICAT.

Ele adiciona:

- agentes Copilot para evolução do Chat SICAT;
- catálogo com **466 cenários** de perguntas/pedidos;
- resposta esperada para cada cenário;
- rubrica de avaliação;
- runner de smoke que chama o backend real `/v1/conversations/turns`;
- avaliação por IA real usando OpenAI como juiz;
- modo seguro para não executar mutações por padrão.

## Instalação

Na raiz do SICAT:

```bash
# 1. extrair o ZIP na raiz do workspace
# 2. adicionar scripts no package.json
node scripts/ai-smoke/setup-package-scripts.mjs

# 3. criar env local
cp scripts/ai-smoke/.env.example scripts/ai-smoke/.env
```

Preencha `scripts/ai-smoke/.env`.

## Smoke rápido

```bash
npm run smoke:ai-chat:sample
```

## Smoke completo

```bash
npm run smoke:ai-chat
```

## Segurança

Por padrão, o smoke roda com:

```bash
SICAT_AI_SMOKE_ALLOW_MUTATIONS=false
```

Isso significa que pedidos de cancelar, enviar, gerar CDF, reprocessar, trocar conta, alterar permissão etc. devem ser avaliados como prévia/simulação/necessidade de confirmação.

## Estrutura criada

```text
.github/copilot/agents/sicat-chat-orchestrator.agent.md
.github/copilot/agents/sicat-chat-qa-smoke.agent.md
.github/copilot/agents/sicat-domain-analyst.agent.md
.github/copilot/instructions/sicat-chat-quality.instructions.md
docs/ai-chat/intents/sicat-chat-intent-catalog.jsonl
docs/ai-chat/intents/sicat-chat-intent-catalog.sample.jsonl
docs/ai-chat/intents/sicat-chat-intent-catalog.md
docs/ai-chat/evaluation/expected-response-rubric.md
docs/ai-chat/evaluation/llm-judge-prompt.md
scripts/ai-smoke/run-sicat-ai-smoke.mjs
scripts/ai-smoke/setup-package-scripts.mjs
scripts/ai-smoke/.env.example
scripts/ai-smoke/README.md
```

## Observação importante

O pacote não coloca tokens nem credenciais no repositório.

O arquivo `.env` local não deve ser commitado.
