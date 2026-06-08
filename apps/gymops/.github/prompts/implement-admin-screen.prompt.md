---
mode: agent
description: Criar uma tela administrativa de negócio seguindo docs/admin-ui-blueprint.md, navigation-map e rbac-matrix.
---

# Criar Tela Administrativa

## Quando usar

Quando o pedido for criar uma página em `/settings/*`, `/profile`, `/activities`, `/invite/*` ou `/setup` — qualquer tela administrativa de negócio (não tela operacional do dia a dia).

## Contexto obrigatório

Antes de começar, ler:

1. [`docs/admin-ui-blueprint.md`](../../docs/admin-ui-blueprint.md) — **spec da tela específica**
2. [`docs/navigation-map.md`](../../docs/navigation-map.md) — onde a tela entra na navegação por role
3. [`docs/rbac-matrix.md`](../../docs/rbac-matrix.md) — quais roles podem acessar e o quê
4. [`docs/api-spec.md`](../../docs/api-spec.md) — endpoints existentes que a tela vai consumir
5. [`.github/instructions/frontend.instructions.md`](../instructions/frontend.instructions.md) — regras do frontend
6. Telas existentes similares em `apps/web/src/app/(app)/settings/` para reusar padrões

## Passos

1. **Confirmar o escopo no blueprint**
   - Achar a seção da tela em `docs/admin-ui-blueprint.md`
   - Listar: campos, ações, validações, RBAC, endpoints necessários

2. **Verificar endpoints disponíveis**
   - Endpoints já existem em `docs/api-spec.md`? Listar.
   - Se faltar endpoint, criar primeiro usando `add-api-endpoint.prompt.md`.

3. **API client no frontend**
   - Adicionar funções em `apps/web/src/lib/admin-api.ts` (ou criar arquivo dedicado se for domínio novo)
   - Tipar com `ApiResponse<T>`
   - Padrão: `xxxApi = { list, get, create, update, archive }`

4. **Página Next.js**
   - Criar arquivo em `apps/web/src/app/(app)/settings/<feature>/page.tsx`
   - Usar `'use client'` (telas admin tipicamente interativas)
   - Reusar componentes de `apps/web/src/components/ui/`
   - Linguagem pt-BR; "Equipe" não "Memberships"

5. **Estados UX obrigatórios**
   - Loading: `<Loader2 className="animate-spin" />`
   - Empty: ícone neutro + mensagem + CTA
   - Error: mensagem amigável
   - Success: toast (`sonner`) ou banner inline efêmero

6. **Responsividade**
   - `p-4 md:p-8`, `max-w-3xl mx-auto` ou similar
   - Tabelas em `overflow-x-auto`
   - Modais com `max-h-[90vh] overflow-y-auto`
   - Testar visualmente em 375px e 1280px

7. **Permissões na UI**
   - Esconder ações que o role não pode executar (UX)
   - Backend SEMPRE valida — não confiar no frontend
   - Owner-only screens: guard explícito no início

8. **Navegação**
   - Adicionar item em `apps/web/src/app/(app)/settings/layout.tsx` se for `/settings/*`
   - Filtrar por role conforme `docs/navigation-map.md`

9. **data-testid** em botões e inputs principais para E2E futuro

10. **Atualizar docs**
    - `docs/status.md`: marcar a tela como `✅ Implementado`
    - `docs/navigation-map.md`: atualizar tabela de rotas

## Critérios de aceite

- [ ] Tela renderiza sem erro em mobile (375px) e desktop (1280px)
- [ ] Loading/empty/error tratados
- [ ] Ações funcionam (não mock) e refletem no backend
- [ ] RBAC respeitada no frontend (UX) e no backend (segurança)
- [ ] Linguagem de negócio em pt-BR
- [ ] Sem `any`, sem warnings de lint
- [ ] Documentação atualizada
- [ ] Item adicionado à navegação para os roles certos

## Comandos de validação

```bash
pnpm --filter @gymops/web typecheck
pnpm --filter @gymops/web lint
pnpm --filter @gymops/web build
```

## Formato da resposta final

1. Tela criada (rota + propósito)
2. Arquivos criados/alterados
3. Endpoints consumidos
4. Componentes reusados
5. Decisões de UX (se houve trade-off)
6. Validações executadas
7. Próximos passos (testes E2E, melhorias)
