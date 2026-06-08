# Skill: Create Admin UI

## Objetivo

Criar uma tela administrativa nova seguindo padrões do projeto, responsividade e RBAC.

## Quando usar

- Pedido para criar página em `/settings/*`, `/profile`, `/activities`, `/setup`, `/invite/*`

## Quando NÃO usar

- Tela operacional do dia a dia (cards de atividade, dashboards)
- Componente sem rota dedicada

## Entradas esperadas

- Nome da rota
- Persona-alvo (role)
- Endpoints disponíveis ou a criar

## Arquivos de contexto

1. [`docs/admin-ui-blueprint.md`](../admin-ui-blueprint.md) — spec da tela
2. [`docs/navigation-map.md`](../navigation-map.md) — navegação por role
3. [`docs/rbac-matrix.md`](../rbac-matrix.md) — permissões
4. [`.github/instructions/frontend.instructions.md`](../../.github/instructions/frontend.instructions.md)
5. Tela existente similar em `apps/web/src/app/(app)/settings/`

## Passos

1. **Conferir endpoints** — existem em `docs/api-spec.md`? Se não, criar primeiro (use `skill-create-fastify-endpoint`)
2. **API client** — adicionar funções em `apps/web/src/lib/admin-api.ts` (ou arquivo dedicado)
3. **Criar página** — `apps/web/src/app/(app)/settings/<feature>/page.tsx`
4. **Componentes auxiliares** — Dialog, Form, Row se necessário
5. **Estados UX** — loading, empty, error, success
6. **Responsividade** — `p-4 md:p-8`, `overflow-x-auto` em tabela, modais com `max-h-[90vh]`
7. **Linguagem pt-BR** de negócio
8. **RBAC visível** — esconder ações para roles sem permissão (UX)
9. **Navegação** — adicionar em `apps/web/src/app/(app)/settings/layout.tsx` por role
10. **data-testid** em ações principais
11. **Testar visualmente** em 375px e 1280px

## Saída esperada

- Arquivo `page.tsx` da rota criado
- API client atualizado
- Navegação atualizada
- Sem warnings de lint/typecheck

## Padrão de página

```tsx
'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { xxxApi } from '@/lib/admin-api';
import { useAuthStore } from '@/store/auth';
import { Button } from '@/components/ui/button';
import { Loader2, Plus } from 'lucide-react';

export default function XxxPage() {
  const { organizationId, userRole } = useAuthStore();
  const queryClient = useQueryClient();
  const [toast, setToast] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ['xxx', organizationId],
    queryFn: () => xxxApi.list(organizationId!),
    enabled: !!organizationId,
  });

  // ... mutation, dialogs, etc.

  return (
    <div className="p-4 md:p-8 max-w-3xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold">Título</h1>
          <p className="text-sm text-muted-foreground mt-1">Descrição curta.</p>
        </div>
        <Button onClick={...} className="gap-2"><Plus className="h-4 w-4" />Nova...</Button>
      </div>

      {isLoading ? <Loader2 className="animate-spin" /> : ...}
    </div>
  );
}
```

## Erros comuns

- Esquecer responsividade (testar mobile)
- Usar `localStorage` para token
- Inglês na UI
- Botão sem ação real
- Esquecer estado vazio com CTA
- Esquecer de adicionar à navegação

## Checklist

- [ ] Rota criada
- [ ] API client atualizado
- [ ] Estados UX (loading/empty/error/success)
- [ ] Responsividade (375 e 1280)
- [ ] Linguagem pt-BR de negócio
- [ ] Navegação atualizada por role
- [ ] data-testid em ações principais
- [ ] Lint + typecheck OK
- [ ] `docs/navigation-map.md` atualizado se aplicável
