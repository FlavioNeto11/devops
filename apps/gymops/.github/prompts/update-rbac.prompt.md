---
mode: agent
description: Alterar regras de permissão com backend, frontend, testes e docs sincronizados.
---

# Atualizar Regra de RBAC

## Quando usar

Quando o pedido envolver mudar quem pode fazer o quê — alterar precedência de papel, adicionar/remover permissão, mudar visibilidade default, ajustar herança de escopo, etc.

## Contexto obrigatório (LER PRIMEIRO)

1. [`docs/rbac-matrix.md`](../../docs/rbac-matrix.md) — **fonte da verdade**
2. [`docs/rbac.md`](../../docs/rbac.md) — algoritmo de resolução
3. [`.github/instructions/rbac.instructions.md`](../instructions/rbac.instructions.md) — padrões obrigatórios
4. `apps/api/src/lib/rbac.ts` — implementação atual
5. Rotas que serão impactadas em `apps/api/src/routes/<dominio>/index.ts`
6. UI afetada em `apps/web/src/store/auth.ts`, `apps/web/src/components/layout/sidebar.tsx` e telas relacionadas

## Atenção especial: desalinhamentos conhecidos

A seção "Desalinhamentos conhecidos" em `docs/rbac-matrix.md` lista divergências entre backend e frontend. Antes de mudar algo, conferir se já existe desalinhamento documentado para o caso em questão.

## Passos

1. **Documentar primeiro**
   - Atualizar `docs/rbac-matrix.md` com a regra nova
   - Justificativa em uma linha sobre por que mudou
   - Marcar desalinhamento como resolvido se for o caso

2. **Backend**
   - Ajustar `apps/api/src/lib/rbac.ts` se for novo algoritmo
   - Ajustar todas as rotas afetadas em `apps/api/src/routes/*`
   - Validar com testes existentes que não há regressão

3. **Frontend (UX)**
   - Ajustar `apps/web/src/store/auth.ts` se houver helper de role
   - Ajustar sidebar e dropdowns conforme `docs/navigation-map.md`
   - Ajustar telas onde botões/ações dependem de role

4. **Testes**
   - Adicionar teste de integração cobrindo a nova regra para cada role envolvido (owner, org_manager, unit_manager, area_leader, executor, viewer conforme aplicável)
   - Adicionar teste E2E se a regra afeta fluxo completo

5. **Audit log**
   - Verificar que ações sensíveis (mudança de role, revogação) geram `logAudit`

6. **Atualizar status**
   - `docs/status.md`: refletir gap fechado ou criado
   - `docs/sprints.md`: marcar item da sprint relevante

## Checklist de sincronização

- [ ] `docs/rbac-matrix.md` atualizada
- [ ] `docs/rbac.md` atualizado se algoritmo mudou
- [ ] `apps/api/src/lib/rbac.ts` ajustado
- [ ] Todas as rotas Fastify afetadas ajustadas
- [ ] Frontend (sidebar, telas, dialogs) ajustado
- [ ] Testes vitest cobrindo cada role
- [ ] E2E cobrindo fluxo completo
- [ ] `docs/status.md` atualizado
- [ ] Audit log gerado em ação sensível
- [ ] Proteção do último owner mantida (se aplicável)

## Comandos de validação

```bash
pnpm --filter @gymops/api typecheck
pnpm --filter @gymops/web typecheck
pnpm lint
pnpm --filter @gymops/api test
```

## Formato da resposta final

1. Regra alterada (antes → depois)
2. Justificativa
3. Backend: arquivos alterados
4. Frontend: arquivos alterados
5. Testes adicionados
6. Docs atualizados
7. Desalinhamento resolvido (sim/não) — se sim, qual
8. Risco residual / próximos passos
