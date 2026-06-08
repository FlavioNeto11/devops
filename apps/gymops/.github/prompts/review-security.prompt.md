---
mode: agent
description: Revisar segurança, auth, RBAC, tokens, integrações e vazamento de segredo.
---

# Revisão de Segurança

## Quando usar

- Antes de cada release (sprint concluída)
- Antes de abrir PR com mudanças sensíveis (auth, RBAC, integrações, criptografia)
- Quando o usuário pedir "revisar segurança", "auditar permissões" ou similar

## Contexto obrigatório

1. [`AGENTS.md`](../../AGENTS.md) seção 5 — Regras de segurança
2. [`docs/rbac-matrix.md`](../../docs/rbac-matrix.md) — permissões canônicas
3. [`docs/rbac.md`](../../docs/rbac.md) — algoritmo
4. [`docs/integrations.md`](../../docs/integrations.md) — segredos e criptografia
5. `apps/api/src/env.ts` — validação de env vars
6. `apps/api/src/lib/crypto.ts` — AES-256-GCM

## Checklist de revisão

### Auth e sessão

- [ ] Token JWT NUNCA está em `localStorage` (verificar `apps/web/src/store/auth.ts`)
- [ ] Refresh token em cookie httpOnly (`apps/api/src/routes/auth/index.ts`)
- [ ] Sessões revogáveis via tabela `sessions`
- [ ] Rate limit em `/auth/login` (10 req/min)
- [ ] Google OAuth sem `?token=` na URL (cookie temporário + `/auth/consume`)
- [ ] Refresh silencioso em 401 não causa loop infinito

### RBAC

- [ ] Toda rota protegida tem `preHandler: [app.authenticate]`
- [ ] Toda rota verifica membership/role antes de executar
- [ ] Atividades restricted exigem `resolveActivityPermission`
- [ ] Endpoints owner-only validam role no início
- [ ] Frontend não é fonte de verdade de RBAC
- [ ] 404 em vez de 403 em casos de risco de enumeração
- [ ] Proteção do último owner em DELETE /memberships e PATCH role

### Validação de entrada

- [ ] Todo endpoint Fastify tem `safeParse` Zod no body/query
- [ ] Upload validados: MIME type + sizeBytes
- [ ] UUIDs validados com `z.string().uuid()`
- [ ] Strings limitadas em tamanho

### Segredos e env

- [ ] Nenhum `.env` real commitado
- [ ] `ENCRYPTION_KEY` validada no boot (regex `^[0-9a-fA-F]{64}$`)
- [ ] `JWT_SECRET` e `JWT_REFRESH_SECRET` com no mínimo 32 chars
- [ ] Tokens de integração criptografados antes de gravar
- [ ] Sem hardcoded credentials no código

### IA

- [ ] `/ai/*` com rate limit 10 req/min por userId
- [ ] Conteúdo de atividade `restricted` NÃO vai para LLM
- [ ] `callAI(fn, fallback, timeoutMs)` usado em chamadas síncronas
- [ ] Resposta IA sempre validada com Zod (`json_object`)

### Integrações

- [ ] Tokens OAuth criptografados em `integration_accounts.auth_jsonb`
- [ ] Health endpoint não vaza configuração (token, secret)
- [ ] Erros traduzidos antes de retornar ao usuário
- [ ] Webhook signature validation quando aplicável (Twilio, futuro Stripe)

### Logs

- [ ] Logs do servidor não vazam senha, token, chave
- [ ] Mensagens de erro para o usuário não vazam detalhes técnicos
- [ ] Audit log gera registro em ações administrativas

### CSP e headers

- [ ] CSP configurada no Next.js (`next.config.mjs` ou middleware)
- [ ] CORS restrito (`apps/api/src/app.ts` — origin lista)
- [ ] Cookies com `httpOnly`, `secure` (em prod), `sameSite`

### Uploads (R2)

- [ ] Validação de MIME type antes do presign
- [ ] Tamanho máximo respeitado (10MB anexo, 5MB avatar/logo)
- [ ] Bucket privado; servir via presigned URL com TTL curto
- [ ] Path do object key não permite path traversal

### Dependências

- [ ] `pnpm audit` sem vulnerabilidades críticas
- [ ] Sem deps abandonadas (sem update há 2+ anos)
- [ ] Sem licenças incompatíveis (GPL em produto comercial)

## Como rodar

1. Ler arquivos críticos relevantes
2. Rodar `pnpm audit`
3. Grep por padrões suspeitos (`localStorage.setItem('token`, `console.log(token`, etc.)
4. Verificar `.env*` no `.gitignore`
5. Conferir helper `crypto.ts` é usado em tokens de integração
6. Conferir `resolveActivityPermission` é usado em todas as rotas `/ai/*` e `/activities/:id`

## Comandos úteis

```bash
pnpm audit
grep -rn "localStorage" apps/web/src --include="*.ts" --include="*.tsx"
grep -rn "console.log" apps/api/src --include="*.ts"
grep -rn "process.env\." apps/ --include="*.ts" | grep -v "env.ts"
```

## Formato da resposta final

1. Resumo executivo (sem achados / com achados)
2. Achados críticos (P0) — bloqueia release
3. Achados sérios (P1) — corrigir antes do próximo deploy
4. Sugestões (P2) — melhorias não urgentes
5. Checklist com resultado (✅/⚠️/❌) por item
6. Arquivos auditados
7. Recomendações de teste adicional
