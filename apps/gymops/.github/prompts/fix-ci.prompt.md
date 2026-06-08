---
mode: agent
description: Diagnosticar e corrigir falhas de lint, typecheck, test, build e e2e.
---

# Diagnosticar e Corrigir CI

## Quando usar

Quando o pipeline `.github/workflows/ci.yml` ou `e2e.yml` falhar, ou quando o usuário pedir para corrigir lint/typecheck/test/build.

## Contexto obrigatório

1. Output do CI ou comando local que falhou
2. `.github/workflows/ci.yml` e `.github/workflows/e2e.yml`
3. `package.json` raiz e dos sub-pacotes (scripts)
4. [`.github/instructions/tests.instructions.md`](../instructions/tests.instructions.md)

## Estratégia

1. **Reproduzir localmente primeiro** — não tentar adivinhar
2. **Categorizar a falha**:
   - Lint warning/error
   - TypeScript error
   - Teste falhando (unit / integration / E2E)
   - Build error
   - Migration falhando
3. **Resolver a causa raiz, não mascarar** — não usar `// @ts-ignore`, `eslint-disable-next-line` sem justificativa real
4. **Validar a correção** — rodar o mesmo comando local
5. **Não pular hooks** com `--no-verify`

## Comandos para reproduzir

```bash
# Lint
pnpm lint

# Typecheck
pnpm typecheck
pnpm --filter @gymops/api typecheck
pnpm --filter @gymops/web typecheck

# Test API
pnpm --filter @gymops/api test
# Test E2E
pnpm --filter @gymops/web test:e2e

# Build
pnpm --filter @gymops/web build

# Migration
pnpm --filter @gymops/db migrate:deploy
```

## Diagnóstico por tipo

### Lint

```bash
pnpm --filter @gymops/web lint  # Next.js ESLint
pnpm --filter @gymops/api lint  # (configurar se ausente)
```

Erros comuns:
- Variável importada não usada → remover import
- `import()` type annotation → mover para `import type` no topo
- `<a>` para rota interna → trocar por `next/link`
- `any` → usar `unknown` ou tipo explícito

### TypeScript

Erros comuns no projeto:
- `TS2352` Cast para `Prisma.InputJsonValue` → usar double cast `as unknown as Prisma.InputJsonValue`
- `TS2339` Property X does not exist → confirmar nome do field no schema; ver armadilhas em `CLAUDE.md`
- `ts2345` Tipo string não atribuível a uuid → adicionar `z.string().uuid()` na validação

### Testes

- DB não conecta no host Windows → usar `docker exec gym-postgres-1 psql ...` para validar; documentar limitação se for ambiente local
- TRUNCATE falhando → atualizar lista em `apps/api/src/test/helpers.ts` para incluir novas tabelas
- Flakiness em Playwright → adicionar `await expect.poll` ou `waitForLoadState`

### Build (Next.js)

- "Module not found" → verificar imports relativos vs `@/` alias
- "Window is not defined" em Server Component → adicionar `'use client'` ou mover lógica

## Checklist

- [ ] Causa raiz identificada
- [ ] Correção aplicada no arquivo certo (não no arquivo de teste pra "passar")
- [ ] Validação local OK
- [ ] Nenhum `--no-verify`, `eslint-disable`, `@ts-ignore` adicionado sem comentário justificando
- [ ] Se a falha for pré-existente e fora do escopo, documentar no relatório

## Formato da resposta final

1. Falha original (output resumido)
2. Causa raiz diagnosticada
3. Correção aplicada (arquivos e linhas)
4. Validação local executada
5. Riscos residuais
6. Pré-existências documentadas (se houver)
