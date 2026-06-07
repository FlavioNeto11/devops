# Preenchimento automático do `.env` do smoke

Este complemento evita preencher manualmente:

```env
SICAT_ACCESS_TOKEN=
SICAT_INTEGRATION_ACCOUNT_ID=
SICAT_SESSION_CONTEXT_ID=
SICAT_ACCOUNT_ID=
SICAT_USER_ID=
SICAT_REQUESTED_BY=
```

O script faz:

1. login em `/v1/sicat/auth/login`;
2. lista contas em `/v1/sicat/cetesb-accounts`;
3. ativa a conta CETESB ativa ou a primeira disponível;
4. sincroniza `/v1/sicat/session`;
5. grava `scripts/ai-smoke/.env`.

## Windows PowerShell, recomendado

```powershell
.\scriptsi-smokeootstrap-sicat-smoke-env.ps1
```

O usuário padrão já está configurado como:

```text
flavio_padilha_neto@msn.com
```

A senha é pedida no terminal e não é gravada no arquivo.

## Node direto

```bash
node scripts/ai-smoke/bootstrap-sicat-smoke-env.mjs --email flavio_padilha_neto@msn.com
```

## Rodar com accountId específico

```powershell
.\scriptsi-smokeootstrap-sicat-smoke-env.ps1 -AccountId "ID_DA_CONTA"
```

## Depois rode

```bash
npm run smoke:ai-chat:sample
```

## Segurança

Não commitar:

- `scripts/ai-smoke/.env`
- senha do usuário
- access token
- refresh token
- qualquer arquivo `.env.login`
