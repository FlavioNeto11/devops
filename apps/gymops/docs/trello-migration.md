# Importador Trello — Estratégia e Implementação

## Objetivo

Migrar ~300 boards Trello para o modelo Organização → Unidade → Área → Atividade com rastreabilidade completa, wizard de revisão antes do commit e suporte a dois modos de importação.

---

## Dois modos de importação

| Modo | Quando usar | Implementação |
|---|---|---|
| **API direta** | Admin quer importar vários boards de uma vez | OAuth Trello → API REST → batch de até 10 GETs por chamada |
| **Upload JSON** | Cliente prefere não autorizar OAuth ou importar boards específicos | Exportação manual do Trello → upload de arquivo `.json` no importador |

Ambos os modos devem resultar no mesmo pipeline de processamento interno.

---

## Fluxo completo de importação

```
Etapa 1: Configurar fonte
  └─ Modo API: autenticar com Trello OAuth
  └─ Modo JSON: upload do arquivo exportado

Etapa 2: Selecionar boards a importar
  └─ Lista de boards disponíveis
  └─ Usuário marca quais importar

Etapa 3: Dry-run (preview)
  └─ Worker processa boards sem persistir
  └─ Gera mapeamento sugerido:
      Board → Unidade
      List → Área (por nome + heurística)
  └─ Retorna summary: X unidades, Y áreas, Z atividades

Etapa 4: Wizard de revisão
  └─ Para cada lista do Trello, usuário define:
      type: "area" | "status" | "period" | "ignore"
      value: nome da área OU status correspondente
  └─ Usuário pode criar novas unidades/áreas na hora

Etapa 5: Commit (atômico)
  └─ Executar mapeamento revisado
  └─ Criar todas as entidades em uma transaction
  └─ Registrar import_items para rastreabilidade
  └─ Retornar summary: criados, ignorados, falhas

Etapa 6: Revisão pós-importação
  └─ Relatório de importação acessível em /imports/:id
  └─ Itens com status "failed" exibidos para correção manual
```

---

## Mapeamento de entidades

### Regra padrão (automática)

| Trello | GymOps | Regra |
|---|---|---|
| Board | Unidade | Nome do board → nome da unidade |
| List | Área | Nome da lista → mapear por similaridade para áreas padrão |
| Card | Atividade | Título + descrição migrados integralmente |
| Card members | Assignees | Mapear por email (se email existir no GymOps) |
| Comments | Comentários + eventos | Preservar autor, timestamp e corpo |
| Checklist / checkItems | ActivityChecklist + items | Manter ordem e estado `done` |
| Attachments | ActivityAttachment | Migrar metadados; re-hospedar binário no R2 |
| Labels | metadata.tags | Configurável (prioridade, tipo ou tag livre) |
| Due date | due_at | Migração direta (ISO 8601) |
| Archived cards | status = cancelado | Não perder histórico |
| Archived lists | UnitArea.enabled = false | Preservar com área desativada |

### Heurística de mapeamento de listas para áreas

```typescript
// apps/api/src/imports/trello/area-matcher.ts

const AREA_KEYWORDS: Record<string, string[]> = {
  administrativo: ['admin', 'administrativ', 'documento', 'contrato', 'juridico'],
  marketing: ['marketing', 'campanha', 'redes sociais', 'comunicacao', 'mkt'],
  coordenacao: ['coordena', 'escala', 'turma', 'professor', 'treinamento'],
  manutencao: ['manutencao', 'estrutura', 'equipamento', 'chamado', 'reparo', 'obra'],
  lider: ['lider', 'gestao', 'reuniao', 'estrategia', 'diretoria'],
  financeiro: ['financeiro', 'financ', 'pagar', 'receber', 'caixa', 'conta'],
};

export function matchAreaByListName(listName: string): string | null {
  const normalized = listName.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  for (const [areaKey, keywords] of Object.entries(AREA_KEYWORDS)) {
    if (keywords.some(kw => normalized.includes(kw))) return areaKey;
  }
  return null; // não encontrou → wizard de revisão obrigatório para esta lista
}
```

---

## Estrutura do wizard de revisão

O wizard é exibido no frontend após o dry-run. Para cada lista Trello sem match automático (ou com match de baixa confiança), o usuário escolhe:

```typescript
interface ListMappingDecision {
  trelloListId: string;
  trelloListName: string;
  suggestedType: 'area' | 'status' | 'period' | 'ignore';
  suggestedValue: string;
  // Usuário pode sobrescrever:
  type: 'area' | 'status' | 'period' | 'ignore';
  value: string;
  // Para type = 'area': nome ou key da área no GymOps
  // Para type = 'status': 'novo'|'em_andamento'|'concluido'|etc.
  // Para type = 'period': string de período (informativo, vira metadata)
  // Para type = 'ignore': não importar cards desta lista
}
```

**Regra**: Nenhuma lista pode ficar sem decisão antes do commit.

---

## Tratamento de dados problemáticos

| Problema | Tratamento |
|---|---|
| Card sem due_date | `due_at = null` (válido) |
| Card member sem email no GymOps | Registrar em `import_item.error_message`, atividade criada sem assignee |
| Attachment > 10MB | Registrar link externo ao invés de re-hospedar |
| Board com >500 cards | Processar em chunks de 50 para não estourar memória |
| Trello rate limit (100 req/10s) | Implementar retry com exponential backoff |
| JSON inválido ou incompleto | Retornar erro na etapa de dry-run, antes de criar qualquer entidade |
| Boards duplicados | Detectar por `source_id` em `import_items` — impedir re-importação sem confirmação |

---

## Trello API — endpoints utilizados

```
GET /1/members/me/boards      → listar boards do usuário
GET /1/boards/:id             → detalhes do board
GET /1/boards/:id/lists       → listas do board
GET /1/boards/:id/cards/all   → todos os cards (incluindo arquivados)
GET /1/cards/:id/checklists   → checklists do card
GET /1/cards/:id/actions      → comentários e histórico
GET /1/cards/:id/attachments  → anexos

Batch: POST /1/batch?urls=url1,url2,...  (máx 10 por chamada)
```

**Rate limit Trello**: 100 req / 10 segundos por token. Implementar controle no worker.

---

## Rastreabilidade

Cada entidade criada pelo importador gera um `ImportItem`:

```typescript
{
  importJobId: string,
  sourceType: 'board' | 'list' | 'card' | 'checklist' | 'comment' | 'attachment',
  sourceId: string,   // ID original no Trello
  targetType: 'unit' | 'area' | 'activity' | ...,
  targetId: string,   // ID criado no GymOps
  status: 'mapped' | 'skipped' | 'failed',
}
```

Isso permite:
- Relatório pós-importação com o que foi criado
- Desfazer importação (listar todos `targetId` e deletar)
- Consultar origem de qualquer entidade migrada

---

## Implementação do worker (BullMQ)

```typescript
// apps/api/src/workers/import.worker.ts

importQueue.process('trello-import', async (job) => {
  const { importJobId } = job.data;

  const importJob = await db.importJob.findUnique({ where: { id: importJobId } });

  // Etapa 1: buscar dados do Trello (ou ler JSON)
  const trelloData = await fetchTrelloData(importJob);

  // Etapa 2: dry-run — gerar mapeamento sem persistir
  const preview = await generatePreview(trelloData, importJob.mapping);
  await db.importJob.update({
    where: { id: importJobId },
    data: { status: 'awaiting_review', summary: preview },
  });

  // Worker para aqui — usuário revisa o wizard
  // Quando usuário fizer PATCH /imports/:id/mapping + POST /imports/:id/commit:

  // Etapa 3: commit atômico
  await db.$transaction(async (tx) => {
    for (const board of trelloData.boards) {
      await importBoard(tx, board, importJob);
    }
  });

  await db.importJob.update({
    where: { id: importJobId },
    data: { status: 'committed' },
  });
});
```
