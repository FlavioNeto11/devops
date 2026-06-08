# Bootstrap de Nova Organização — Spec Canônica

**Última atualização**: 2026-05-17  
**Backlog**: [FEAT-004](backlog.md#feat-004--setup-com-starter-pack-can%C3%B4nico) (Sprint 19, P0).  
**Donos**: product-admin (líder), backend-fastify, database-prisma.

> **Problema**: hoje o wizard `/setup` cria org + owner + apenas 5 áreas vazias. O seed (`packages/db/prisma/seed.ts`) usado em demo cria 6 áreas + 24 templates + 3 unidades — uma experiência muito mais rica. Cliente novo entra em produto pobre. Esta spec define o **starter pack canônico** que deve ser entregue tanto pelo seed quanto pelo wizard público.

---

## Objetivo

Toda organização criada (seed, `POST /organizations` público, futuras importações de demo) deve nascer com:

1. Owner com membership `scopeType='organization'`
2. Plano (`organization_plans`) default
3. **6 áreas canônicas** (não 5)
4. **24 templates canônicos** distribuídos pelas áreas
5. (Opcional) 1 unidade inicial criada pelo wizard, com todas as 6 áreas vinculadas via `unit_areas`
6. (Opcional) Configurações default em `organizations.settings`

A função `bootstrapOrganization()` deve ser **compartilhada** entre `seed.ts` e `routes/organizations/index.ts` para evitar divergência futura.

---

## Catálogo de áreas

| Key | Nome | Cor | `visibilityDefault` |
|---|---|---|---|
| `administrativo` | Administrativo | `#6366f1` (indigo) | `inherited` |
| `marketing` | Marketing | `#ec4899` (pink) | `inherited` |
| `coordenacao` | Coordenação | `#f59e0b` (amber) | `inherited` |
| `manutencao` | Estrutura/Manutenção | `#10b981` (emerald) | `inherited` |
| `financeiro` | Financeiro | `#3b82f6` (blue) | `restricted` |
| `lider` | Liderança | `#8b5cf6` (violet) | `restricted` |

---

## Catálogo de templates (24 itens)

> Cada template tem `config_jsonb` com `defaultChecklist`, `defaultPriority`, `defaultVisibility`, `suggestedSlaDays`, `specificFields`.

### Administrativo (4)
1. **Conferência mensal de contratos** — prioridade `media`, SLA 5d
2. **Renovação de alvará** — prioridade `alta`, SLA 30d
3. **Atualização cadastral de aluno** — prioridade `baixa`, SLA 3d
4. **Auditoria de processos administrativos** — prioridade `media`, SLA 15d

### Marketing (4)
1. **Planejar campanha de captação** — prioridade `media`, SLA 7d
2. **Pauta de redes sociais (semanal)** — prioridade `baixa`, SLA 2d
3. **Aprovação de orçamento de mídia** — prioridade `alta`, SLA 3d
4. **Relatório de performance mensal** — prioridade `media`, SLA 5d

### Coordenação (4)
1. **Escala semanal de professores** — prioridade `alta`, SLA 1d
2. **Treinamento de novo colaborador** — prioridade `media`, SLA 7d
3. **Reunião de alinhamento operacional** — prioridade `media`, SLA 0d (recorrente)
4. **Revisão de processos de atendimento** — prioridade `baixa`, SLA 15d

### Estrutura/Manutenção (4)
1. **Chamado de manutenção corretiva** — prioridade `critica`, SLA 2d; campos `equipment`, `location`, `supplier`
2. **Inspeção preventiva mensal** — prioridade `alta`, SLA 7d
3. **Limpeza profunda** — prioridade `media`, SLA 2d
4. **Reposição de insumos** — prioridade `media`, SLA 3d

### Financeiro (4)
1. **Fechamento mensal de caixa** — prioridade `alta`, SLA 3d, `restricted`
2. **Pagamento de fornecedores** — prioridade `alta`, SLA 2d, `restricted`
3. **Conciliação bancária** — prioridade `alta`, SLA 5d, `restricted`
4. **Relatório financeiro para liderança** — prioridade `media`, SLA 7d, `restricted`

### Liderança (4)
1. **Reunião de gestão (semanal)** — prioridade `alta`, SLA 0d
2. **Plano de ação trimestral** — prioridade `media`, SLA 30d, `restricted`
3. **Avaliação de desempenho de equipe** — prioridade `media`, SLA 15d, `restricted`
4. **Decisão estratégica registrada** — prioridade `alta`, SLA 7d, `restricted`

> Templates concretos com `defaultChecklist`/`specificFields` devem ser extraídos do seed atual em `packages/db/prisma/seed.ts`. Esta spec valida apenas a **estrutura mínima**.

---

## Interface da função

### Backend — `apps/api/src/lib/bootstrap-organization.ts` (novo)

```ts
export interface BootstrapInput {
  name: string;
  slug: string;
  owner: {
    name: string;
    email: string;
    passwordHash: string;
  };
  /** Opcional: cria 1 unidade inicial com nome dado e vincula todas as 6 áreas. */
  initialUnit?: {
    name: string;
    code?: string;
    address?: string;
  };
  /** Opcional: settings iniciais do tenant. */
  settings?: Record<string, unknown>;
}

export interface BootstrapResult {
  organizationId: string;
  ownerUserId: string;
  areaIds: string[];           // 6
  templateIds: string[];       // 24
  initialUnitId: string | null;
}

export async function bootstrapOrganization(
  input: BootstrapInput,
): Promise<BootstrapResult>;
```

### Comportamento

1. **Transação Prisma** envolvendo todo o bootstrap.
2. Cria `organization` + `organization_plans` (plano `trial`).
3. Cria `user` (owner) + `membership(scope='organization', role='owner')`.
4. Cria 6 áreas via `createMany` (idempotente por `@@unique([organizationId, key])`).
5. Cria 24 templates via `createMany`, com `areaId` mapeado pela `key`.
6. Se `initialUnit` presente:
   - Cria `unit`.
   - Cria 6 `unit_areas` (todas as áreas habilitadas com `order` 0..5).
7. Aplica `settings` no `organization.settings_jsonb`.
8. Registra evento de auditoria `org.bootstrapped`.

### Consumidores

| Consumidor | Como usa |
|---|---|
| `packages/db/prisma/seed.ts` | Chama `bootstrapOrganization()` para criar SkyFit demo (passa `initialUnit` 3x — fora do helper para criar 3 unidades) |
| `apps/api/src/routes/organizations/index.ts` (`POST /organizations`) | Chama `bootstrapOrganization()` com input do wizard |
| (futuro) endpoint de duplicação de tenant | Mesmo helper |

---

## Wizard `/setup` — UI alvo

4 passos (hoje são 3):

1. **Organização** — nome + slug auto-gerado (editável)
2. **Administrador** — nome + e-mail + senha (mínimo **8 caracteres**, BUG-004)
3. **Unidade inicial (opcional)** — nome + código + endereço, ou pular
4. **Confirmar** — resumo do que será criado:
   > "Vamos criar: organização **NomeOrg**, owner **Nome**, 6 áreas operacionais, 24 templates de tarefas e [a unidade **NomeUnidade** | nenhuma unidade]. Você poderá adicionar mais unidades, áreas e personalizar templates depois."

Após confirmar:
- Loading com mensagem "Configurando sua organização…"
- Sucesso → redirect para `/login` com toast "Pronto! Sua organização está configurada. Faça login para começar."

---

## Critérios de aceite

- [ ] Função `bootstrapOrganization()` extraída e testada.
- [ ] Seed (`packages/db/prisma/seed.ts`) consome a função para a SkyFit (mesmo número de áreas/templates).
- [ ] `POST /organizations` consome a função.
- [ ] Wizard `/setup` envia senha mínima de 8 caracteres (BUG-004 fechado).
- [ ] Nova organização criada via wizard tem 6 áreas + 24 templates + (opcionalmente) 1 unidade com 6 vínculos `unit_areas`.
- [ ] Teste de integração vitest: `organizations.bootstrap.test.ts` asserta o resultado.
- [ ] Smoke E2E: `setup.full-flow.spec.ts` cobre o wizard completo.
- [ ] Documentação `docs/status.md` atualizada removendo "starter pack pobre" do bloco de Onboarding.
