# Prompt para o Orchestrador — Implementar Smoke AI Chat SICAT

Atue como Orchestrador principal do projeto SICAT.

Objetivo:
Integrar e validar a camada de qualidade conversacional do Chat SICAT, usando o catálogo de 466 cenários em `docs/ai-chat/intents/sicat-chat-intent-catalog.jsonl`.

Tarefas:

1. Ler os agentes adicionados em `.github/copilot/agents`.
2. Ler o catálogo de cenários e respostas esperadas.
3. Rodar `node scripts/ai-smoke/setup-package-scripts.mjs`.
4. Configurar `scripts/ai-smoke/.env` com credenciais locais, sem versionar segredo.
5. Executar:

```bash
npm run smoke:ai-chat:sample
```

6. Corrigir falhas do backend conversacional, roteamento de intents, prompts, tools ou respostas.
7. Depois executar:

```bash
npm run smoke:ai-chat
```

8. Não aprovar entrega se:
   - o chat inventar dados;
   - ignorar domínio SICAT;
   - executar ação sensível sem confirmação;
   - não reconhecer limitação de ferramenta;
   - falhar em diagnóstico básico;
   - não gerar resposta útil para usuário operacional.

Regra final:
O smoke completo deve ser tratado como contrato de qualidade do Chat SICAT.
