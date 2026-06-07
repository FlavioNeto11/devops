# Atualizar modelos OpenAI dos ambientes locais

Este pacote adiciona o script:

```powershell
scripts\ai-smoke\corrigir-modelos-env.ps1
```

Ele atualiza, sem duplicar chaves:

- `.env`
- `scripts/ai-smoke/.env`

## O que ele configura

Na `.env` da raiz:

```env
OPENAI_AGENT_MODEL=gpt-5.1
OPENAI_SYNTHESIS_MODEL=gpt-5.1
OPENAI_MODEL=gpt-5.1
```

No `scripts/ai-smoke/.env`:

```env
OPENAI_AGENT_MODEL=gpt-5.1
OPENAI_SYNTHESIS_MODEL=gpt-5.1
OPENAI_JUDGE_MODEL=gpt-4o-mini
OPENAI_MODEL=gpt-5.1
SICAT_AI_SMOKE_ALLOW_MUTATIONS=false
SICAT_AI_SMOKE_FORCE_SAFE_PROMPT_PREFIX=true
```

## Como rodar

Na raiz do SICAT:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\ai-smoke\corrigir-modelos-env.ps1
```

Depois valide:

```powershell
Select-String -Path .env -Pattern "OPENAI_"
Select-String -Path .\scripts\ai-smoke\.env -Pattern "OPENAI_"
```

## Importante

O script não adiciona nem altera sua `OPENAI_API_KEY`.

Ele preserva as chaves já existentes e apenas ajusta os modelos.

Depois de rodar, reinicie o backend:

```powershell
npm run dev
```

Não commite:

- `.env`
- `scripts/ai-smoke/.env`
- `artifacts/ai-smoke`
