# Modo Tutorial Guiado

> **Status**: implementado (Sprint 17). Cobre onboarding, tours contextuais e Central de Ajuda.

## Objetivo

Ensinar usuários a operar o GymOps **dentro das próprias telas**, sem mover ninguém para documentação externa. O sistema apresenta destaques visuais sobre elementos reais (cards, filtros, botões) e guia o usuário com explicações curtas, controle de passos e respeito a permissões.

Três formatos coexistem:

1. **Onboarding inicial** — convite leve no canto inferior direito após login, propondo o tour de Primeiros Passos.
2. **Tours contextuais** — botão "Ver tutorial" no cabeçalho das telas principais, abrindo o overlay sobre os elementos daquela tela.
3. **Central de Ajuda** — rota `/help` com todos os tutoriais permitidos para o papel, com busca, filtros, progresso e reiniciar.

---

## Tutoriais incluídos

Cada tutorial vive em [`apps/web/src/features/tutorial/tutorial.registry.ts`](../apps/web/src/features/tutorial/tutorial.registry.ts).

| ID                    | Título                       | Categoria         | Papéis                                  |
| --------------------- | ---------------------------- | ----------------- | --------------------------------------- |
| `first-steps`         | Primeiros passos             | first-steps       | todos                                   |
| `dashboard-overview`  | Painel Geral                 | daily-operation   | owner, org_manager, unit_manager        |
| `my-activities`       | Minhas Atividades            | daily-operation   | todos                                   |
| `activities-center`   | Central de Atividades        | daily-operation   | owner, org_manager, unit_manager        |
| `unit-operation`      | Operar uma unidade           | daily-operation   | owner → executor                        |
| `activity-detail`     | Trabalhando em uma atividade | daily-operation   | todos                                   |
| `templates`           | Templates                    | administration    | owner, org_manager, unit_manager        |
| `profile-whatsapp`    | Perfil e WhatsApp            | first-steps       | todos                                   |
| `organization-admin`  | Administrar a organização    | administration    | owner                                   |
| `units-areas-admin`   | Unidades e Áreas             | administration    | owner, org_manager                      |
| `team-permissions`    | Equipe e Permissões          | administration    | owner, org_manager                      |
| `integrations`        | Integrações                  | integrations      | owner, org_manager                      |
| `trello-import`       | Importar do Trello           | import            | owner, org_manager                      |
| `notifications-logs`  | Notificações e logs          | notifications     | todos                                   |
| `recurrences`         | Recorrências                 | administration    | owner, org_manager, unit_manager        |
| `audit`               | Auditoria                    | audit             | owner                                   |

---

## Arquitetura

```
apps/web/src/features/tutorial/
├── index.ts                      # barril de exports
├── tutorial.types.ts             # TutorialDefinition, TutorialStep, TutorialProgress, status
├── tutorial.registry.ts          # registry estático dos tutoriais (fonte da verdade)
├── tutorial-progress-api.ts      # cliente HTTP (GET/PATCH/restart)
├── tutorial-store.ts             # Zustand: run state + pendingStart + cache de progresso
├── useTutorial.ts                # hook principal (start/next/prev/skip/finish + fallback)
├── useTutorialTarget.ts          # helper para data-tutorial
├── tutorial-highlight.tsx        # 4 retângulos escuros + anel pulsante + posicionamento
├── tutorial-step-card.tsx        # cartão do passo (título, corpo, contador, botões, fallback)
├── tutorial-overlay.tsx          # raiz do overlay (highlight + step-card)
├── tutorial-trigger.tsx          # botão "Ver tutorial" reutilizável
├── tutorial-provider.tsx         # carrega progresso + onboarding + pendingStart watcher
├── tutorial-help-center.tsx      # Central de Ajuda (busca + filtros + grid + navegação)
└── onboarding-prompt.tsx         # convite inicial canto inferior direito
```

`TutorialProvider` é montado no [`apps/web/src/app/(app)/layout.tsx`](../apps/web/src/app/(app)/layout.tsx) — abrange toda a área autenticada, mas não as páginas públicas (`/login`, `/setup`, `/invite/[token]`).

---

## Persistência

Tabela `tutorial_progress` (Postgres):

| Coluna                | Tipo                  | Observação                                 |
| --------------------- | --------------------- | ------------------------------------------ |
| `id`                  | text PK               |                                            |
| `user_id`             | text FK → users.id    | `ON DELETE CASCADE`                        |
| `tutorial_id`         | text                  | id do registry                             |
| `status`              | enum `TutorialStatus` | `not_started`/`in_progress`/`completed`/`skipped`/`deferred` |
| `current_step_id`     | text \| null          |                                            |
| `completed_steps_json`| jsonb                 | array de step ids                          |
| `started_at`          | timestamp             |                                            |
| `completed_at`        | timestamp             |                                            |
| `skipped_at`          | timestamp             |                                            |
| `updated_at`          | timestamp             | auto                                       |

Restrição única `(user_id, tutorial_id)` + índice em `user_id`.

Migração aplicada via `docker exec gym-postgres-1 psql` (workaround conhecido — ver [`CLAUDE.md`](../CLAUDE.md)).

---

## Endpoints

Documentados em [`docs/api-spec.md`](api-spec.md), na seção "Tutorial Progress".

| Método  | Rota                                          | Descrição                                  |
| ------- | --------------------------------------------- | ------------------------------------------ |
| `GET`   | `/me/tutorial-progress`                       | Lista progresso do usuário                 |
| `PATCH` | `/me/tutorial-progress/:tutorialId`           | Upsert de progresso (status/step/completedSteps) |
| `POST`  | `/me/tutorial-progress/:tutorialId/restart`   | Reinicia progresso (zera completed_steps)  |

Validações:
- `tutorialId` deve casar com `^[a-z0-9-]{1,64}$` (mesmo formato do registry).
- `status` ∈ `{not_started, in_progress, completed, skipped, deferred}`.
- `completedSteps`: array ≤ 200 ids, cada ≤ 64 chars `[a-z0-9-]`.
- RBAC: usuário só lê/altera o **próprio** progresso. Nenhum endpoint admin cruzado.

---

## RBAC dos tutoriais

Cada `TutorialDefinition` tem `rolesAllowed: NonNullable<UserRole>[]`. Cada `TutorialStep` pode opcionalmente sobrescrever com `rolesAllowed`.

- `viewer` enxerga apenas tutoriais de leitura (Painel, Minhas Atividades, Atividade detalhe, Perfil, Notificações).
- `executor` vê os mesmos + Operação de Unidade.
- `area_leader` o mesmo.
- `unit_manager` vê tudo acima + Painel, Templates, Recorrências.
- `org_manager` vê quase tudo, exceto Organização e Auditoria.
- `owner` vê todos.

A Central de Ajuda esconde automaticamente cards de tutoriais cujo papel atual não está em `rolesAllowed`.

O `TutorialTrigger` retorna `null` se o papel atual não tem acesso — assim a tela não exibe botão "Ver tutorial" sem ação.

---

## Como adicionar um novo tutorial

1. Abra [`tutorial.registry.ts`](../apps/web/src/features/tutorial/tutorial.registry.ts).
2. Acrescente um `TutorialDefinition`:
   ```ts
   {
     id: 'meu-tutorial',
     title: 'Meu tutorial',
     description: 'O que ele ensina, em uma frase.',
     category: 'daily-operation',
     rolesAllowed: ['owner', 'unit_manager'],
     startRoute: '/minha-rota',    // rota canônica para a Central de Ajuda navegar
     estimatedMinutes: 2,
     steps: [
       { id: 'intro', title: '...', body: '...', placement: 'center' },
       // Passo importante — target esperado, exibe fallback se ausente:
       {
         id: 'lista',
         title: '...',
         body: '...',
         target: 'meu-target',
         placement: 'bottom',
         required: true,
         fallbackTitle: 'Título alternativo',
         fallbackBody: 'Explicação quando o elemento não está visível.',
       },
       // Passo opcional — pula silenciosamente se target ausente:
       { id: 'opcional', title: '...', body: '...', target: 'algo-condicional', placement: 'top', skipIfTargetMissing: true },
     ],
   }
   ```
3. Garanta que cada `target` tem um `data-tutorial="..."` na UI (passo 4 abaixo).
4. (Opcional) adicione um `<TutorialTrigger tutorialId="meu-tutorial" />` no header da tela.

---

## Modo demo / dados demonstrativos

Quando um tutorial está ativo, telas com possibilidade de lista vazia devem exibir conteúdo demonstrativo para garantir que o elemento alvo (`data-tutorial`) exista no DOM e o usuário veja o recurso em ação.

**Padrão recomendado:**

```tsx
// No componente da tela (ex: me/page.tsx)
const run = useTutorialStore((s) => s.run);
const isTutorialActive = run?.tutorialId === 'meu-tutorial';

const showDemoData = isTutorialActive && !isLoading && realList.length === 0;
const displayList = showDemoData ? DEMO_ITEMS : realList;
```

```tsx
{showDemoData && (
  <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700">
    Exemplo de tutorial — seus dados aparecerão aqui
  </div>
)}
{displayList.map((item) => (
  <ItemCard key={item.id} item={item} onClick={showDemoData ? undefined : () => select(item.id)} />
))}
```

Regras obrigatórias para dados demo:
- IDs prefixados com `_demo_` para jamais conflitarem com dados reais.
- Nenhum dado demo é enviado ao backend (somente exibição local).
- Click em itens demo é desabilitado (`onClick={undefined}` ou `pointer-events-none`).
- Banner "Exemplo de tutorial" visível acima da lista.

**Telas que já implementam isso:** `apps/web/src/app/(app)/me/page.tsx` (tutorial `my-activities`).

---

## Navegação pela Central de Ajuda

Quando o usuário clica "Começar" ou "Reiniciar" em `/help`, o tutorial deve iniciar **na tela correta**, não em `/help`.

**Como funciona:**

1. `TutorialHelpCenter` verifica o `startRoute` do tutorial (ou a rota do primeiro passo).
2. Se o `pathname` atual não coincide, armazena `pendingStart` no store e navega com `router.push(startRoute)`.
3. O `TutorialProvider` monitora `pendingStart` + `pathname`. Quando chegamos à rota correta, chama `startTutorial(pendingStart)` e limpa o estado.
4. O overlay aparece já na tela certa.

**Como definir a rota inicial:**

```ts
{
  id: 'meu-tutorial',
  startRoute: '/minha-rota',   // ← campo obrigatório para tutoriais com tela fixa
  // ...
}
```

Se `startRoute` não estiver definido, o tutorial inicia no local atual (comportamento anterior — adequado para tutoriais sem tela específica, ex: `first-steps`).

---

## Quando usar cada estratégia de target ausente

| Situação | Estratégia | Campo |
|----------|-----------|-------|
| Elemento condicionalmente visível (ex: filtro que só aparece com dados) e o passo é **opcional** | Auto-skip silencioso | `skipIfTargetMissing: true` |
| Elemento central do passo, usuário **precisa entender o recurso** mesmo sem dados | Fallback central com explicação | `required: true` + `fallbackTitle` + `fallbackBody` |
| Tela pode estar vazia, mas o passo é **crítico** e o layout sempre renderiza o container | Dados demonstrativos na tela | `required: true` + lógica demo na página |
| Elemento sempre existe quando a rota está carregada | Nenhuma flag — timeout padrão de 600ms | — |

**Nunca use `skipIfTargetMissing` em passos que ensinam o recurso principal de um tutorial.** Reserve para passos de detalhe ou filtros avançados.

---

## Como adicionar `data-tutorial` a um elemento

Em qualquer JSX:

```tsx
<section data-tutorial="meu-id">...</section>
```

Convenção: `kebab-case`, prefixado pelo contexto. Ex:
- Globais: `app-sidebar`, `app-help-button`
- Tela: `dashboard-kpis`, `unit-area-board`, `activity-drawer-checklist`

Para passos opcionais (elementos condicionais, filtros avançados), marque `skipIfTargetMissing: true`. Para passos críticos que o usuário precisa entender, marque `required: true` com `fallbackTitle`/`fallbackBody` — o tutorial exibe um card explicativo central em vez de pular silenciosamente.

---

## Testes

### Backend (Vitest)

[`apps/api/src/test/me-tutorial-progress.test.ts`](../apps/api/src/test/me-tutorial-progress.test.ts) cobre:

- GET inicial retorna `[]`.
- PATCH cria com `status=in_progress` automaticamente.
- PATCH atualiza `currentStepId` e `completedSteps`.
- PATCH com `status=completed` preenche `completedAt`.
- POST `/restart` zera `completedSteps` e marca `in_progress`.
- Não retorna progresso de outro usuário.
- `tutorialId` inválido → 422.

### Frontend (Playwright)

[`apps/web/e2e/tutorial.spec.ts`](../apps/web/e2e/tutorial.spec.ts) cobre os smoke flows:

- Convite de onboarding aparece para usuário novo.
- Pular convite o esconde para sessão.
- Iniciar tutorial → overlay aparece com primeiro passo.
- Avançar e voltar entre passos.
- Concluir o tutorial.
- Central de Ajuda lista cards e abre tutoriais.

Os testes E2E pesados (visibilidade por papel, mobile específico) ficam como **manual** — descritos abaixo.

---

## Validação manual

Para validar visualmente:

1. **Onboarding**
   - Logar com usuário sem progresso → convite aparece em ~800 ms.
   - Clicar "Começar agora" → overlay de Primeiros Passos.
   - Clicar "Depois" → some, mas reaparece em nova sessão.
   - Clicar "Não mostrar mais" → não aparece mais.

2. **Tour contextual**
   - Em `/dashboard`, clicar "Ver tutorial" no header → destaques sobre KPIs e tabela.
   - Pressionar `Esc` → fecha.

3. **Central de Ajuda**
   - Acessar `/help` ou ícone de ajuda no sidebar.
   - Buscar por "checklist" → mostra tutorial da Atividade.
   - Reiniciar e iniciar de novo qualquer tutorial.

4. **RBAC**
   - Logar como `viewer` → não deve ver botão Tutorial em `/settings/units`, `/settings/team`, `/settings/audit`.
   - A Central de Ajuda exibe apenas tutoriais permitidos.

5. **Mobile**
   - Abrir DevTools no viewport 375x667.
   - O overlay deve recalcular posição sem cortar o cartão.
   - O cartão central tem `max-h-[40vh]` com scroll interno.

---

## Boas práticas de texto

- Português brasileiro, direto, sem jargão técnico.
- Frase curta no `body` (1–2 linhas no desktop).
- Use `actionHint` para CTAs sutis ("Clique no botão para criar a primeira").
- Não duplique o que o título já diz.
- Não cite limitações futuras ("em breve…"). Se não existe, omita.

---

## Erros comuns

| Sintoma | Causa | Correção |
| --- | --- | --- |
| Tutorial pula passo silenciosamente | Passo importante tem `skipIfTargetMissing: true` | Trocar por `required: true` com fallback, ou implementar dados demo |
| Tutorial inicia em `/help` em vez da tela certa | `startRoute` não definido no registry | Adicionar `startRoute: '/minha-rota'` ao tutorial |
| Tutorial trava em um passo | `target` aponta para elemento que não existe e nem `required` nem `skipIfTargetMissing` foram definidos | Definir uma das duas estratégias |
| Cartão fora da tela em mobile | `placement` força um lado sem espaço | Trocar para `placement: 'center'` ou deixar o autoposicionamento agir |
| Step duplicado para o usuário | Step `rolesAllowed` não inclui o papel atual | Adicionar o papel ou remover o filtro |
| 422 ao salvar progresso | `tutorialId` no registry tem caracteres fora de `[a-z0-9-]` | Renomear o id |
| Convite não aparece | Já existe `tutorial_progress.status` em `completed` ou `skipped` | Reiniciar pela Central de Ajuda |
| Dados demo aparecem em produção real | IDs demo não prefixados com `_demo_` ou lógica de showDemoData incorreta | Verificar condição `run?.tutorialId === 'meu-tutorial' && lista.length === 0` |

---

## Referências cruzadas

- [`docs/admin-ui-blueprint.md`](admin-ui-blueprint.md) — todas as telas administrativas que recebem `data-tutorial`.
- [`docs/navigation-map.md`](navigation-map.md) — link `/help` por papel.
- [`docs/api-spec.md`](api-spec.md) — contrato HTTP completo.
- [`docs/status.md`](status.md) — status do módulo de tutorial.
