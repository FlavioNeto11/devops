# Sprint 13 — Centro de Importações + Trello Admin

**Objetivo**: Transformar o importador Trello em processo administrável, auditável e repetível.  
**Resultado de negócio**: Migração de 300 boards SkyFit auditável e sem suporte manual; falhas reprocessáveis sem reiniciar do zero.  
**Duração**: 2 semanas

---

## Backend — API (apps/api)

### Itens de import detalhados

- [ ] `GET /imports/:id/items`
  - Query: `status` (created | ignored | failed), `page`, `limit`
  - Retornar `ImportItem` com: cardName, trelloBoardName, status, areaKey, errorMessage
  - RBAC: `assertImportAccess` já aplicado
  - Ordenar por: failed primeiro, depois created, depois ignored

### Retry e cancel

- [ ] `POST /imports/:id/retry`
  - Validar: job em status `failed`
  - Resetar `status = 'pending'`, limpar `result.errors`
  - `enqueueImport(jobId)` — reenfileirar (com fallback setImmediate se Redis indisponível)
  - Retornar `{ data: { jobId, status: 'pending' } }`
- [ ] `POST /imports/:id/cancel`
  - Validar: job em status `pending` ou `processing`
  - Atualizar `status = 'cancelled'`
  - Retornar `{ data: { jobId, status: 'cancelled' } }`

### Health check e reconnect da integração Trello

- [ ] `GET /integrations/trello/health`
  - Descriptografar token → GET `https://api.trello.com/1/members/me?key=...&token=...`
  - Se 200: `{ status: 'ok', username: string }`
  - Se 401: `{ status: 'invalid_token' }`
  - Se sem integração: 404
- [ ] `POST /integrations/trello/reconnect`
  - Alias/helper: retornar nova URL de autorização (igual ao `/start`)
  - Após nova autorização, o frontend chama `/connect` normalmente

### Listagem de imports com filtros

- [ ] Ampliar `GET /imports`:
  - Adicionar filtros: `status`, `dateFrom`, `dateTo`
  - Retornar campos adicionais: `boardCount`, `createdCount`, `failedCount`, `source`
  - Ordenar por `createdAt DESC`

---

## Frontend — Web (apps/web)

### Centro de Importações (`/settings/imports`)

- [ ] Criar rota `/settings/imports`
- [ ] Componente `ImportsAdminPage`:
  - **Cabeçalho**: "Centro de Importações" + botão "Nova importação" (→ wizard existente)
  - **Filtros**: Status (multi-select), Período (de/até)
  - **Tabela de jobs**:
    - Colunas: Origem (JSON/API), Data, Boards, Criados, Ignorados, Falhas, Status, Ações
    - Status badge: pending (amarelo) | processing (azul pulsante) | done (verde) | failed (vermelho) | cancelled (cinza)
    - Ações: Detalhes | Retry (se failed) | Cancelar (se pending/processing)
  - **Polling automático**: enquanto existir job `pending` ou `processing` na lista, fazer poll a cada 3s
- [ ] Drawer de detalhe do job:
  - Tabs: "Resumo" | "Itens"
  - Tab Resumo: boards importados, criados/ignorados/falhas, tempo de processamento, logs de erro
  - Tab Itens: lista paginada de `ImportItem` com filtro por status
  - Botão "Baixar relatório CSV" dos itens
- [ ] Botão Retry → `POST /imports/:id/retry` → toast + atualizar status na tabela
- [ ] Botão Cancelar → confirmação modal → `POST /imports/:id/cancel`

### Status da integração Trello

- [ ] Adicionar seção "Saúde da integração" em `/settings/integrations`:
  - Exibir resultado de `GET /integrations/trello/health`
  - Status: ✅ Conectado como @username | ❌ Token inválido (botão Reconectar)
  - Botão "Reconectar" → `POST /integrations/trello/reconnect` → nova URL de auth → abrir fluxo OAuth

### Renomear wizard existente

- [ ] O wizard atual em `/settings/import` (singular) passa a ser acessível como subfluxo do centro
- [ ] Botão "Nova importação" no centro de importações → `/settings/import` (manter rota existente para não quebrar)

---

## Testes

- [ ] `POST /imports/:id/retry` — job não-failed → 422; job failed → status muda para pending
- [ ] `POST /imports/:id/cancel` — job done → 422; job pending → status muda para cancelled
- [ ] `GET /imports/:id/items` — filtros por status; paginação; RBAC (só membro da org)
- [ ] `GET /integrations/trello/health` — token válido → 200 OK; sem integração → 404

---

## Critérios de aceite

- [ ] Gestor vê histórico de jobs com status atualizado em tempo real (polling)
- [ ] Job falho pode ser reenfileirado com 1 clique sem reconfigurar mapeamento
- [ ] Job em processamento pode ser cancelado e status reflete imediatamente
- [ ] Drawer de detalhe exibe itens falhos com mensagem de erro útil
- [ ] Health check da integração Trello exibe estado real (não cacheado)

---

## Pitfalls conhecidos

- `GET /integrations/trello/health`: fazer chamada à API Trello diretamente — não cachear para este endpoint (usuário quer saber estado real)
- Retry de job: o job já tem preview e mapping salvos — não re-executar dry-run; ir direto para commit
- Polling no frontend: usar `setInterval` com cleanup no `useEffect`; pausar poll quando aba não estiver visível (`document.visibilityState`)
- Importar página com muitos jobs: paginação cursor obrigatória
- `GET /imports/:id/items` pode retornar muitos itens (boards com 300+ cards) — sempre paginar
