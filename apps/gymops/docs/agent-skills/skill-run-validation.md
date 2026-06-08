# Skill: Run Validation

## Objetivo

Rodar a bateria padrão de validação (lint + typecheck + test + build) e interpretar resultados.

## Quando usar

- Antes de marcar tarefa como concluída
- Antes de abrir PR
- Após mudança não-trivial

## Quando NÃO usar

- Ajuste em doc apenas (lint/typecheck irrelevante)
- Verificação rápida durante desenvolvimento (use comando específico)

## Entradas esperadas

- Que pacote/camada foi alterado (api, web, db, todos)

## Comandos

### Bateria completa

```bash
pnpm lint
pnpm typecheck
pnpm --filter @gymops/api test
pnpm --filter @gymops/web build
```

### Por escopo

```bash
# Só API
pnpm --filter @gymops/api typecheck
pnpm --filter @gymops/api test

# Só Web
pnpm --filter @gymops/web typecheck
pnpm --filter @gymops/web lint
pnpm --filter @gymops/web build

# Só DB
pnpm --filter @gymops/db generate
pnpm --filter @gymops/db exec prisma validate

# E2E (opcional, mais lento)
pnpm --filter @gymops/web test:e2e
```

## Interpretação

### Lint

- Erro novo introduzido → corrigir
- Warning antigo (pré-existente) → documentar no relatório, não corrigir oportunisticamente

### Typecheck

- `TS2352` Cast Prisma JSON → usar double cast `as unknown as Prisma.InputJsonValue`
- `TS2339` Property does not exist → conferir armadilhas em `CLAUDE.md`
- Erro em arquivo não tocado → pré-existente, documentar

### Test

- Falha nova → corrigir (não mascarar com skip)
- Falha pré-existente (Docker isolation, etc.) → documentar no relatório
- Não usar `--no-verify`, `vi.skip`, `it.skip` para passar

### Build

- Erro de import → conferir extensão `.js` (ESM) ou alias `@/`
- Erro de Server Component → adicionar `'use client'` se precisar de browser API

## Saída esperada

Lista de comandos executados com resultado:

```
✅ pnpm typecheck — sem erros
✅ pnpm lint — sem warnings novos
⚠️ pnpm test — 3 falhas pré-existentes (Docker network)
✅ pnpm build — 22 rotas geradas
```

## Erros comuns

- Pular validação para "ganhar tempo"
- Mascarar falha com `--no-verify` ou `eslint-disable`
- Não distinguir falha nova de pré-existente
- Esquecer build em mudança de frontend

## Checklist

- [ ] Lint rodado e interpretado
- [ ] Typecheck rodado e interpretado
- [ ] Test relevante rodado
- [ ] Build rodado (se mexeu em frontend)
- [ ] Falhas pré-existentes documentadas
- [ ] Falhas novas corrigidas (não mascaradas)
