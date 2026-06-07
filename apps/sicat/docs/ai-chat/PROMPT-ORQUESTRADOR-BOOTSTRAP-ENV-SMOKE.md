# Prompt para Orquestrador — Facilitar preenchimento do .env do Smoke SICAT

Atue como Orchestrador principal do projeto SICAT.

Objetivo:
Instalar o bootstrap automático do ambiente de smoke conversacional, evitando preenchimento manual de access token, integrationAccountId, sessionContextId e accountId.

Arquivos adicionados:

- `scripts/ai-smoke/bootstrap-sicat-smoke-env.mjs`
- `scripts/ai-smoke/bootstrap-sicat-smoke-env.ps1`
- `scripts/ai-smoke/.env.login.example`
- `scripts/ai-smoke/README-BOOTSTRAP-ENV.md`

Fluxo esperado:

1. Rodar o bootstrap PowerShell no Windows:

```powershell
.\scriptsi-smokeootstrap-sicat-smoke-env.ps1
```

2. Informar a senha no prompt local.
3. O script deve autenticar em `/v1/sicat/auth/login`.
4. O script deve listar contas CETESB.
5. O script deve ativar a conta CETESB ativa ou a primeira disponível.
6. O script deve sincronizar `/v1/sicat/session`.
7. O script deve gerar `scripts/ai-smoke/.env`.
8. Rodar:

```bash
npm run smoke:ai-chat:sample
```

Critérios de aceite:

- não gravar senha em arquivo;
- não commitar `.env`;
- gerar `SICAT_ACCESS_TOKEN`;
- gerar `SICAT_INTEGRATION_ACCOUNT_ID`;
- gerar `SICAT_SESSION_CONTEXT_ID`;
- gerar `SICAT_ACCOUNT_ID`;
- preencher `SICAT_USER_ID`;
- preencher `SICAT_REQUESTED_BY`;
- preservar `OPENAI_API_KEY` se já existir no `.env`;
- falhar com mensagem clara se não houver conta CETESB ativa/cadastrada.
