---
applyTo: "apps/web/**/*.ts,apps/web/**/*.tsx,packages/ui/**/*.ts,packages/ui/**/*.tsx"
---

# Instruções — Frontend (Next.js + React + Tailwind)

Aplicam-se a todos os arquivos `.ts` e `.tsx` em `apps/web/` e `packages/ui/`.

## Stack

- **Next.js 14 App Router** — `apps/web/src/app/` é a raiz de rotas
- **React 18+** — Server Components por padrão; Client (`'use client'`) só quando precisar de estado, efeito ou evento
- **Tailwind CSS** com tokens em `apps/web/tailwind.config.ts`
- **shadcn/ui** baseado em Radix Primitives (`apps/web/src/components/ui/`)
- **Estado global**: Zustand (`apps/web/src/store/`)
- **Data fetching**: TanStack Query (`useQuery`, `useMutation`)
- **Forms**: React Hook Form + Zod
- **Ícones**: lucide-react

## Responsividade — REGRA CRÍTICA

Toda tela, modal e componente deve funcionar em mobile (≤375px) **e** desktop (≥1280px).

- Mobile-first: classes base sem prefixo + overrides `md:` para desktop
- **Nunca** remover classes sem prefixo `md:` (quebra mobile)
- Padding de páginas: `p-3 md:p-6` ou `p-4 md:p-8`
- Tabelas: envolver em `<div className="overflow-x-auto">`
- Modais/drawers: `max-h-[90vh] overflow-y-auto`
- Tabs com texto longo: `overflow-x-auto` + `whitespace-nowrap` nos botões
- Layouts horizontais: `flex-wrap` ou `overflow-x-auto` no mobile
- Sidebar: `fixed z-50` overlay no mobile, `md:relative` no desktop
- Nunca usar `w-[valor fixo]` sem prefixo `md:` em containers principais

## Componentes existentes — não duplicar

Antes de criar componente novo, conferir:

- `apps/web/src/components/ui/` — Button, Input, Dialog, Badge, Tabs, etc. (shadcn)
- `apps/web/src/components/layout/` — Sidebar, Topbar
- `apps/web/src/components/ui/avatar.tsx` — `UserAvatar` (com fallback de iniciais)

## Estados UX obrigatórios

Toda tela com dados deve tratar:

1. **Loading** — usar `Loader2` da lucide com `animate-spin`
2. **Empty** — ícone neutro + mensagem amigável + CTA quando fizer sentido
3. **Error** — mensagem clara (não stack trace); botão para reenviar quando aplicável
4. **Success** — toast via `sonner` ou banner inline efêmero (3s)

## Data fetching com TanStack Query

- `useQuery({ queryKey, queryFn, enabled })` — sempre incluir todos os filtros na `queryKey`
- `useMutation` com `onSuccess` chamando `queryClient.invalidateQueries({ queryKey })`
- Não chamar `fetch` direto em componentes — usar wrappers em `apps/web/src/lib/`

## API clients centralizados

- `apps/web/src/lib/api.ts` — wrapper base com refresh silencioso em 401
- `apps/web/src/lib/admin-api.ts` — endpoints administrativos
- `apps/web/src/lib/profile-api.ts` — perfil + organização + audit
- `apps/web/src/lib/activities-api.ts` — atividades, templates, notificações
- `apps/web/src/lib/imports-api.ts` — Trello + import jobs

Quando criar nova API client, exportar como objeto nomeado (`xxxApi = { list, get, create, ... }`) e tipar a resposta com `ApiResponse<T>`.

## Autenticação no frontend

- Token JWT **em memória** (Zustand sem persist do token) — nunca no `localStorage`
- `useAuthStore()` expõe `user`, `userRole`, `organizationId`
- Refresh em 401 é silencioso (interceptor em `api.ts`)
- Para checar role na navegação: `userRole === 'owner' || userRole === 'org_manager'`

## RBAC visível na navegação

Sidebar e menus mostram apenas o que o role pode acessar (UX). **A segurança real é no backend.**

```tsx
const { userRole } = useAuthStore();
const isAdmin = userRole === 'owner' || userRole === 'org_manager';
const isOwner = userRole === 'owner';

// Item só visível para owner
...(isOwner ? [{ href: '/settings/organization', label: 'Organização', icon: Building2 }] : [])
```

Para a matriz canônica de permissões, ver [`docs/rbac-matrix.md`](../../docs/rbac-matrix.md).

## Linguagem na UI

- **pt-BR sempre** — sem strings em inglês na UI
- Linguagem de negócio: "Equipe", "Convites", "Auditoria" — não "Memberships", "Invitations List", "Audit Logs"
- Labels de roles em pt-BR: "Owner" → "Owner" (mantém); "org_manager" → "Gestor"; "unit_manager" → "Gerente de Unidade"; etc.
- Datas em formato pt-BR: `new Intl.DateTimeFormat('pt-BR').format(date)`
- Números monetários: `new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' })`

## Não criar tela técnica para usuário final

Evitar:

- Editor de JSON cru
- Lista de filas BullMQ
- Painel de logs de erro do servidor
- Console SQL ou prompt de IA arbitrário

A UI deve representar **conceitos de negócio**, não estrutura técnica.

## data-testid em fluxos E2E

Adicionar `data-testid` em:

- Botões de ação principal (`data-testid="invite-button"`)
- Inputs de formulário crítico (`data-testid="email-input"`)
- Elementos de assertion E2E (`data-testid="activity-row-{id}"`)

Convenção: kebab-case, descritiva, estável (não baseada em texto traduzível).

## Imports e organização de arquivos

- Rotas em `apps/web/src/app/(group)/path/page.tsx`
- Componentes feature-específicos em `apps/web/src/components/<feature>/`
- Componentes reutilizáveis em `apps/web/src/components/ui/`
- Hooks customizados em `apps/web/src/hooks/`
- Helpers puros em `apps/web/src/lib/`

## Lint específico do Next.js

- `next lint` é executado por `pnpm --filter @gymops/web lint`
- Não usar `<a>` para navegação interna — usar `next/link`
- Importar imagens via `next/image` quando vier do storage
- Não usar `import()` type annotations dentro de generics — proibido pelo ESLint; usar `import type` no topo
