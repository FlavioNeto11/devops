# Smoke test do Chat SICAT com IA real

Este pacote adiciona um smoke test conversacional para o SICAT.

Ele faz três coisas:

1. lê o catálogo `docs/ai-chat/intents/sicat-chat-intent-catalog.jsonl`;
2. envia cada pergunta para o backend real `/v1/conversations/turns`;
3. usa um LLM juiz, via OpenAI, para avaliar se a resposta foi satisfatória.

## Instalação

Extrair o ZIP na raiz do workspace SICAT.

Depois executar:

```bash
node scripts/ai-smoke/setup-package-scripts.mjs
cp scripts/ai-smoke/.env.example scripts/ai-smoke/.env
```

Preencher o `.env` com token/sessão válidos.

## Execução rápida

```bash
npm run smoke:ai-chat:sample
```

## Execução completa

```bash
npm run smoke:ai-chat
```

## Fail-fast padrao

Por padrao, o runner usa fail-fast para interromper cedo quando a qualidade parcial
fica abaixo do esperado.

Comandos padrao (fail-fast ativo):

```bash
npm run smoke:ai-chat:sample
npm run smoke:ai-chat
npm run smoke:ai-chat:category -- <categoria>
```

Comandos full (sem parada antecipada por regras de qualidade):

```bash
npm run smoke:ai-chat:sample:full
npm run smoke:ai-chat:full
npm run smoke:ai-chat:category:full -- <categoria>
```

Também é possivel desativar fail-fast manualmente com `--no-fail-fast`.

## Execução sem OpenAI

Sem `OPENAI_API_KEY`, o runner cai em uma avaliação heurística fraca. Para testar de verdade, configure `OPENAI_API_KEY`.

## Segurança

Por padrão:

```bash
SICAT_AI_SMOKE_ALLOW_MUTATIONS=false
```

Isso força cenários de ação a rodarem como prévia/simulação. Não habilite mutações contra ambiente produtivo.
