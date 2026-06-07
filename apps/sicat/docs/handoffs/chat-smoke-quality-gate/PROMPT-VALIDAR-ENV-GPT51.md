# Prompt para validar env GPT-5.1 no SICAT

Atue como Orchestrator do projeto SICAT.

Objetivo:
Validar que os ambientes locais do backend e do smoke estão configurados para usar GPT-5.1 como agente principal e síntese, mantendo gpt-4o-mini apenas como juiz do smoke.

Verifique:

1. `.env` da raiz contém:
   - OPENAI_AGENT_MODEL=gpt-5.1
   - OPENAI_SYNTHESIS_MODEL=gpt-5.1
   - OPENAI_MODEL=gpt-5.1

2. `scripts/ai-smoke/.env` contém:
   - OPENAI_AGENT_MODEL=gpt-5.1
   - OPENAI_SYNTHESIS_MODEL=gpt-5.1
   - OPENAI_JUDGE_MODEL=gpt-4o-mini
   - OPENAI_MODEL=gpt-5.1
   - SICAT_AI_SMOKE_ALLOW_MUTATIONS=false

3. Não há duplicidade dessas chaves nos arquivos.

4. `.env`, `.env.*`, `scripts/ai-smoke/.env` e `artifacts/ai-smoke/` estão protegidos no `.gitignore`.

5. Depois de validar, orientar reiniciar o backend com:
   npm run dev

Não exiba tokens, senhas ou chaves nos logs.
