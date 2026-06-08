# Sprint 10 — Gestão de Unidades + Gestão de Áreas

**Objetivo**: Gestor cria e administra a estrutura operacional da organização pela interface.  
**Resultado de negócio**: Expansão de novas unidades e áreas feita pela UI; sem seed manual; mapa operacional da rede visível e editável.  
**Duração**: 2 semanas

---

## Backend — API (apps/api)

### Unidades

- [ ] `DELETE /units/:id` (soft archive — opcional)
  - Adicionar `archivedAt DateTime?` ao schema `Unit` se ainda não existir
  - Validar: bloquear se existirem atividades abertas + retornar contagem no erro
  - Alternativa: usar `PATCH /units/:id` com `{ status: 'inactive' }` (já existe campo `status`?)
  - Verificar schema atual antes de implementar

### Áreas

- [ ] `PATCH /units/:id/areas/reorder`
  - Body: `{ items: Array<{ areaId: string, order: number }> }`
  - Validar que todos os `areaId` pertencem à org e estão habilitados na unidade
  - Atualizar `unit_areas.order` em batch (dentro de transaction)
- [ ] Adicionar `deletedAt DateTime?` ao schema `Area` (se não existir) para arquivamento
- [ ] `DELETE /areas/:id` (soft archive)
  - Validar: bloquear se existirem templates ou atividades abertas usando esta área
  - Retornar contagem de impacto no erro para o frontend exibir

---

## Frontend — Web (apps/web)

### Gestão de Unidades (`/settings/units`)

- [ ] Criar rota `/settings/units`
- [ ] Componente `UnitsAdminPage`:
  - Listagem com colunas: Nome, Código, Áreas, Membros, Status, Ações
  - Filtro por status (Ativas/Inativas/Todas)
  - Busca por nome ou código
  - Indicador de contagem: "X unidades | Y ativas | Z inativas"
- [ ] Modal "Nova Unidade":
  - Campos: Nome*, Código* (uppercase automático), Endereço
  - `POST /units`
  - Validação de código único (feedback de erro da API)
- [ ] Drawer "Editar Unidade":
  - Mesmos campos + toggle Ativa/Inativa
  - `PATCH /units/:id`
  - Confirmação ao inativar se houver atividades abertas
- [ ] Botão "Dashboard Administrativo" → `/units/:id` com view admin
- [ ] Botão "Ver operação" → `/units/:id` com view operacional
- [ ] Adicionar link "Unidades" em Settings (owner, org_manager)
- [ ] Responsivo: `overflow-x-auto` na tabela

### Gestão de Áreas (`/settings/areas`)

- [ ] Criar rota `/settings/areas`
- [ ] Componente `AreasAdminPage`:
  - Listagem com: cor (bolinha), Nome, Chave, Unidades habilitadas, Status, Ações
  - Filtrar por unidade (ver quais áreas estão na unidade X)
- [ ] Modal "Nova Área":
  - Campos: Nome*, Chave* (auto-slug do nome; editável; `^[a-z_]+$`), Cor (color picker), Visibilidade padrão
  - `POST /areas`
- [ ] Drawer "Editar Área":
  - Mesmos campos + seção "Vínculos com unidades"
  - Para cada unidade: toggle Habilitada + campo Posição/Ordem
  - `PATCH /areas/:id` + `POST /units/:id/areas` / `DELETE /units/:id/areas/:areaId`
  - `PATCH /units/:id/areas/reorder` ao alterar ordem
- [ ] Botão "Arquivar" com modal de confirmação exibindo impacto (N templates, M atividades)
- [ ] Adicionar link "Áreas" em Settings (owner, org_manager)
- [ ] Responsivo: `overflow-x-auto` + drawer fullscreen mobile

---

## Testes

- [ ] Unit test: `PATCH /units/:id/areas/reorder` — valida propriedade das áreas; transação atômica
- [ ] Unit test: `DELETE /areas/:id` — bloqueia se atividades abertas; retorna contagem
- [ ] Testar RBAC: `unit_manager` não acessa `POST /units` nem `POST /areas`

---

## Critérios de aceite

- [ ] Owner cria nova unidade → aparece na sidebar de navegação em <5 segundos
- [ ] Gestor vincula área a nova unidade → área aparece na visão operacional da unidade
- [ ] Reordenação de áreas reflete na visão `/units/:id` imediatamente
- [ ] Inativação de unidade com atividades abertas exibe alerta com contagem
- [ ] Toda tela responsiva em 375px e 1280px

---

## Pitfalls conhecidos

- Verificar se `Unit` já tem campo `status` antes de adicionar
- `UnitArea` já tem campo `order` no schema — usar, não recriar
- Ao criar área, o campo `key` deve ser único por organização (não por unidade)
- `area.color` pode ser `null` no banco — tratar no frontend com cor padrão
- Ao reordenar: garantir que `order` seja sequencial e sem gaps (ou aceitar gaps e ordenar pelo valor)
