# Skill: Create Prisma Migration

## Objetivo

Alterar schema Prisma e aplicar migration segura, com regeneração do client e atualização de docs/helpers.

## Quando usar

- Adicionar/alterar/remover entidade Prisma
- Adicionar/ajustar índice composto
- Modelar campo JSONB
- Alterar enum

## Quando NÃO usar

- Mudança apenas no client (sem schema) — não é migration

## Entradas esperadas

- Descrição da mudança no schema
- Justificativa (por que precisa)
- Se NOT NULL: estratégia de backfill

## Arquivos de contexto

1. [`.github/instructions/database.instructions.md`](../../.github/instructions/database.instructions.md)
2. `packages/db/prisma/schema.prisma`
3. `packages/db/prisma/migrations/` — migrations existentes para padrão
4. `apps/api/src/test/helpers.ts` — atualizar TRUNCATE se nova tabela
5. [`docs/data-model.md`](../data-model.md)

## Passos

1. **Alterar `schema.prisma`** — adicionar/modificar model, enum, index
2. **Validar sintaxe** — `pnpm --filter @gymops/db exec prisma validate` (se disponível)
3. **Gerar migration**:
   - Dev local: `pnpm --filter @gymops/db migrate:dev --name <nome>`
   - Se não conecta (Windows + Docker): `docker exec gym-postgres-1 psql -U gymops -d gymops -c "<DDL>"` + `pnpm --filter @gymops/db generate` no host
4. **Regenerar client** — `pnpm --filter @gymops/db generate`
5. **Atualizar TRUNCATE** em `apps/api/src/test/helpers.ts` se nova tabela (em ordem de dependência)
6. **Atualizar seed** se aplicável (`packages/db/prisma/seed.ts`)
7. **Atualizar `docs/data-model.md`**
8. **Typecheck do api** — `pnpm --filter @gymops/api typecheck` (garantir client reflete)

## Saída esperada

- Schema atualizado
- Migration aplicada (arquivo em `migrations/` ou DDL aplicado via psql)
- Client regenerado
- `helpers.ts` atualizado
- `docs/data-model.md` atualizado

## Estratégias por tipo de mudança

### Adicionar coluna NOT NULL

- Com default: OK
- Sem default em tabela grande: 1) criar nullable, 2) backfill, 3) enforce NOT NULL em migration separada

### Renomear coluna

1. Adicionar coluna nova (nullable)
2. Backfill
3. Atualizar app para usar nova
4. Migration removendo a antiga
5. Deploy em 2 etapas

### Drop tabela/coluna

- Planejar com tempo (não em hot patch)
- Avisar consumidores externos se houver

### Adicionar enum value

- OK no Prisma (`ALTER TYPE ... ADD VALUE`)
- Atualizar código que faz `switch` exaustivo

### Remover enum value

- Planejar — backfill antes
- Backwards-incompatible

## Workaround Windows + Docker

`localhost:5432` pode não estar acessível do host Windows mesmo com port mapping. Workaround:

```bash
docker exec gym-postgres-1 psql -U gymops -d gymops -c "
  ALTER TABLE example ADD COLUMN new_field TEXT;
  CREATE INDEX example_new_field_idx ON example(new_field);
"
pnpm --filter @gymops/db generate
```

Documentar no PR que a migração foi aplicada via `psql` direto.

## Erros comuns

- Esquecer `pnpm --filter @gymops/db generate` após mudar schema (client desatualizado)
- Esquecer de atualizar `helpers.ts` (testes falham por tabela órfã no TRUNCATE)
- Mudança breaking sem coordenação (rodar em ordem errada)
- Migration sem testar local antes de subir

## Checklist

- [ ] Schema válido (`prisma validate`)
- [ ] Migration aplicada
- [ ] Client regenerado
- [ ] `helpers.ts` (TRUNCATE) atualizado se nova tabela
- [ ] Seed ainda funciona
- [ ] `docs/data-model.md` atualizado
- [ ] Typecheck do api OK
