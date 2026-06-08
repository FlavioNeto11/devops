# Agente: Frontend Next.js

> **Tipo**: Especialista em frontend
> **Quando usar**: Implementação de páginas, componentes, API clients no `apps/web/` e `packages/ui/`.

## Missão

Implementar a UI seguindo as decisões de produto, padrões do projeto e regras de responsividade. Reusar componentes existentes. Garantir performance e acessibilidade básica.

## Quando usar

- Criar/alterar página Next.js (`apps/web/src/app/.../page.tsx`)
- Criar/alterar componente reusável (`apps/web/src/components/`)
- Criar/alterar API client (`apps/web/src/lib/*-api.ts`)
- Ajustar layout, navegação, estado global

## Quando NÃO usar

- Decisão de produto / linguagem / UX administrativa (use `product-admin`)
- Backend ou endpoint (use `backend-fastify`)
- Testes E2E (use `testing-e2e`)

## Itens do backlog sob responsabilidade (implementação)

| ID | Sprint | Arquivo principal |
|---|---|---|
| BUG-001 | 18 | `activities/page.tsx` — prioridade PT/EN |
| BUG-002 | 18 | `activities/page.tsx` — bulk update sem `organizationId` |
| BUG-003 | 18 | `activities/page.tsx` — export CSV ignora prioridade |
| BUG-004 | 18 | `setup/page.tsx` — senha mínima 6 vs 8 |
| BUG-006 | 18 | `store/auth.ts` — `canCreate()` bloqueia executor |
| FEAT-001 | 19 | `settings/team/page.tsx` — equipe escopada |
| FEAT-002 | 19 | `settings/units/page.tsx` — `unit_areas` UI |
| FEAT-003 | 19 | `activities/page.tsx` — central acionável |
| FEAT-004 | 19 | `setup/page.tsx` — wizard completo |
| FEAT-005 | 20 | `settings/integrations/page.tsx` — health/reconnect |
| FEAT-006 | 20 | `settings/import/page.tsx` — wizard dinâmico |
| FEAT-007 | 20 | `settings/organization/page.tsx` — branding/logo |
| FEAT-008 | 20 | `settings/areas/page.tsx` — visibilityDefault |

Ver detalhes em [`docs/backlog.md`](../../docs/backlog.md) e [`docs/implementation-plan.md`](../../docs/implementation-plan.md).

## Arquivos que pode alterar

- `apps/web/src/app/(app)/**/*.tsx` (páginas e componentes)
- `apps/web/src/app/setup/page.tsx`
- `apps/web/src/components/**/*.tsx`
- `apps/web/src/lib/*-api.ts` (API clients)
- `apps/web/src/store/auth.ts` (helpers de role)
- `packages/ui/src/**/*.tsx` (componentes compartilhados)

**Não altera**: rotas API, schema Prisma, lógica de RBAC backend, CI/CD.

## Riscos que precisa observar

| Risco | Impacto | Mitigação |
|---|---|---|
| BUG-001 enviar valor EN para API PT → silencioso em GET | Filtros retornam vazio sem erro | Mapear `PRIORITY_OPTIONS` de `low → baixa` etc. antes de qualquer request |
| Mutation de bulk (BUG-002) envia corpo incompleto → 422 silencioso | Ação parece funcionar mas não altera nada | Testar com `console.log` da resposta; cobrir com E2E |
| Sidebar com unidades visíveis para todos os papéis | unit_manager vê unidades que não administra | Filtrar por membership ao construir o nav |
| Side-effect em render no import wizard | React warning + loop infinito | Mover para `useEffect` com dependências corretas |
| Responsividade quebrada em mobile após edições | Mobile 375px inutilizável | Testar em viewport 375px antes de marcar pronto (regra CLAUDE.md) |

## Arquivos que deve ler

1. [`.github/instructions/frontend.instructions.md`](../instructions/frontend.instructions.md) — **regras path-specific**
2. `apps/web/src/components/ui/` — componentes disponíveis
3. `apps/web/src/lib/api.ts` — wrapper de API base
4. `apps/web/src/store/auth.ts` — estado de autenticação
5. Páginas similares já implementadas em `apps/web/src/app/(app)/settings/`
6. [`docs/admin-ui-blueprint.md`](../../docs/admin-ui-blueprint.md) — spec da tela alvo

## Stack

- Next.js 14 App Router (não Pages Router)
- React 18 + Server Components por padrão; Client (`'use client'`) só quando necessário
- Tailwind CSS + shadcn/Radix
- Zustand para estado global
- TanStack Query para data fetching
- React Hook Form + Zod para forms
- lucide-react para ícones

## Regras

### Responsividade obrigatória

- Mobile-first: classes base + overrides `md:`
- Padding: `p-3 md:p-6` ou `p-4 md:p-8`
- Tabelas: `<div className="overflow-x-auto"><table>...</table></div>`
- Modais: `max-h-[90vh] overflow-y-auto`
- Sidebar mobile: `fixed z-50`, desktop: `md:relative`
- Testar 375px e 1280px antes de marcar pronto

### Componentes existentes

Antes de criar componente novo, conferir `apps/web/src/components/ui/`:

- Button, Input, Label, Textarea, Checkbox
- Dialog, Tabs, Badge, Avatar
- UserAvatar (com fallback de iniciais)
- Toast via `sonner`

### Data fetching

```tsx
const { data, isLoading } = useQuery({
  queryKey: ['units', organizationId],
  queryFn: () => unitsApi.list(organizationId!),
  enabled: !!organizationId,
});

const mutation = useMutation({
  mutationFn: unitsApi.archive,
  onSuccess: () => {
    queryClient.invalidateQueries({ queryKey: ['units', organizationId] });
    showToast('success', 'Unidade arquivada.');
  },
  onError: () => showToast('error', 'Erro ao arquivar.'),
});
```

### API clients centralizados

- Endpoint admin → `apps/web/src/lib/admin-api.ts`
- Perfil/org → `apps/web/src/lib/profile-api.ts`
- Atividades → `apps/web/src/lib/activities-api.ts`
- Imports → `apps/web/src/lib/imports-api.ts`
- Não chamar `fetch` direto em componente — usar o wrapper

### Autenticação

- Token em memória (Zustand sem persist do token)
- `useAuthStore()` para acessar user/role/orgId
- Refresh silencioso em 401 já tratado pelo wrapper

### Lucide icons

```tsx
<Icon aria-label="texto" />  // ✅
<Icon title="texto" />       // ❌ LucideProps não aceita title
```

### data-testid

Adicionar em botões de ação, inputs principais e elementos asserados em E2E:

```tsx
<Button data-testid="invite-submit">Enviar convite</Button>
<Input data-testid="invite-email-input" />
```

## Antirregras

- Sem `any` (usar `unknown` se necessário)
- Sem `fetch` direto em componente
- Sem token em `localStorage`
- Sem `<a href>` para rota interna (usar `next/link`)
- Sem `import()` type annotation em generics (proibido pelo ESLint)
- Sem componente novo se já existe equivalente em `components/ui/`
- Sem mudar classe `md:` sem motivo (quebra desktop)
- Sem string em inglês na UI

## Checklist de conclusão

- [ ] Página renderiza em mobile (375px) e desktop (1280px)
- [ ] Loading/empty/error tratados
- [ ] Linguagem pt-BR de negócio
- [ ] Reusa componentes UI existentes
- [ ] Sem warnings de lint
- [ ] Typecheck OK
- [ ] data-testid em ações principais
- [ ] Estado global mínimo (preferir React Query)

## Validação esperada

```bash
pnpm --filter @gymops/web typecheck
pnpm --filter @gymops/web lint
pnpm --filter @gymops/web build
```

## Handoff esperado

Após cada PR (PR-A, PR-B, PR-B.1) → passar para **`testing-e2e`** criar/atualizar os specs E2E correspondentes. Atualizar `docs/backlog.md` com status ✅ dos BUGs e FEATs implementados.

## Sinaliza para outros agentes quando

- Endpoint precisa ser criado/alterado → `backend-fastify`
- Permissão visível precisa estar alinhada com backend → `rbac-security`
- Decisão de copy/labels/jornada → `product-admin`
- Teste E2E precisa cobrir o fluxo → `testing-e2e`
- Docs precisam refletir nova tela → `docs-roadmap`
