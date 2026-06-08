# Sprint 16 — Hardening Final e Preparação Comercial

**Objetivo**: Produto pronto para expansão além do piloto SkyFit. Segundo cliente pode entrar sem intervenção técnica.  
**Resultado de negócio**: Onboarding self-service; dados exportáveis para compliance; trilha de auditoria administrativa.  
**Duração**: 2 semanas

---

## Onboarding de nova organização

### Backend

- [ ] `POST /organizations` (se não existir)
  - Criar organização + membership de owner + áreas padrão + seed de templates em transaction
  - Body: `{ name, slug, ownerEmail, ownerName, ownerPassword }`
  - Rate limit: 1 organização por IP por hora
- [ ] `GET /organizations/slug-available?slug=`
  - Retornar `{ available: boolean }` para feedback em tempo real no wizard

### Frontend

- [ ] Wizard de setup de nova organização (`/setup`):
  - Step 1: Nome e slug da organização (com verificação de disponibilidade)
  - Step 2: Dados do owner (nome, senha)
  - Step 3: Selecionar áreas padrão (pre-selecionadas; personalizável)
  - Step 4: Convidar primeiros membros (opcional, pode pular)
  - Step 5: Resumo e confirmação
- [ ] Rota `/setup` acessível sem auth; redirecionar usuário autenticado para dashboard
- [ ] Responsivo em mobile

---

## Exportação básica

### Backend

- [ ] `GET /activities/export?format=csv&organizationId=&unitId?&areaId?&status?`
  - RBAC: filtrar conforme papel do usuário
  - Retornar: `Content-Type: text/csv`, `Content-Disposition: attachment; filename=atividades.csv`
  - Colunas: ID, Título, Unidade, Área, Status, Prioridade, Prazo, Responsável, Criado em, Concluído em
  - Limite: 10.000 registros por export; retornar 422 se exceder com instrução para filtrar

### Frontend

- [ ] Botão "Exportar CSV" na Central Global de Atividades com filtros atuais aplicados
- [ ] Toast informando início do download

---

## Auditoria trail administrativa

### Backend

- [ ] Migration para `AuditLog`:
  ```prisma
  model AuditLog {
    id             String   @id @default(uuid())
    organizationId String
    userId         String
    action         String   // membership.created | membership.deleted | invitation.sent | org.updated | unit.created | unit.archived | area.created | template.archived
    resourceType   String
    resourceId     String
    metadata       Json?    // dados relevantes da ação
    ipAddress      String?
    createdAt      DateTime @default(now())
    organization   Organization @relation(fields: [organizationId], references: [id])
    user           User         @relation(fields: [userId], references: [id])
  }
  ```
- [ ] Gravar `AuditLog` nas ações administrativas críticas:
  - Membership criado/excluído
  - Convite enviado/aceito/cancelado
  - Organização atualizada
  - Unidade criada/arquivada
  - Template arquivado
- [ ] `GET /audit-logs?organizationId=&page=` (owner only)

### Frontend

- [ ] Seção "Auditoria" em `/settings/organization` (owner only):
  - Tabela: Data, Usuário, Ação, Recurso afetado
  - Filtro por tipo de ação e período
  - Exportar como CSV

---

## Preparação de billing (modelo de dados — sem Stripe)

- [ ] Migration para `OrganizationPlan`:
  ```prisma
  model OrganizationPlan {
    id             String   @id @default(uuid())
    organizationId String   @unique
    plan           String   @default("starter") // starter | pro | enterprise
    maxUnits       Int      @default(3)
    trialEndsAt    DateTime?
    createdAt      DateTime @default(now())
    updatedAt      DateTime @updatedAt
    organization   Organization @relation(fields: [organizationId], references: [id])
  }
  ```
- [ ] Criar `OrganizationPlan` ao criar nova organização (sprint 16 ou via seed)
- [ ] Não implementar enforcement ainda — apenas modelo de dados para sprint futura

---

## Rotação de credenciais de integração

### Backend

- [ ] `POST /integrations/trello/rotate-token`
  - Retornar nova URL de autorização (igual ao reconnect)
  - Após nova auth, o frontend chama `/connect` normalmente

### Frontend

- [ ] Em `/settings/integrations`, botão "Rotacionar credenciais Trello" (com confirmação)
- [ ] Documentar procedimento de rotação no runbook

---

## Documentação de usuário

- [ ] Criar `docs/user-guide.md`:
  - Primeiros passos (login, visão pessoal, criar atividade)
  - Gestão de equipe (convidar, alterar papel, revogar)
  - Importar do Trello (passo a passo)
  - Configurar notificações
  - Perguntas frequentes
- [ ] Adicionar link "Documentação" no footer ou menu de ajuda da sidebar

---

## Testes

- [ ] `POST /organizations` — slug duplicado → 422; criação completa → org + owner + áreas padrão
- [ ] `GET /audit-logs` — owner vê tudo; org_manager não acessa; filtros funcionam
- [ ] `GET /activities/export` — RBAC automático por papel; limite de 10k registros
- [ ] AuditLog gravado nas ações de membership e org

---

## Critérios de aceite

- [ ] Novo cliente cria conta no wizard → chega ao dashboard com estrutura básica pronta em <5 min
- [ ] Owner exporta CSV de atividades de uma unidade e abre no Excel sem problemas de encoding (UTF-8 BOM)
- [ ] Auditoria exibe quem revogou acesso de quem e quando
- [ ] Wizard de setup funciona em mobile (375px)

---

## Pitfalls conhecidos

- CSV encoding: usar UTF-8 BOM (`﻿`) no início do arquivo para Excel abrir corretamente
- `POST /organizations` público: rate limit rigoroso para evitar criação abusiva de orgs
- AuditLog: não gravar dados sensíveis em `metadata` (senhas, tokens, valores financeiros)
- Wizard de setup: slug deve ser validado em tempo real (debounce 300ms) para evitar muitas chamadas
- `OrganizationPlan.maxUnits`: não fazer enforcement de limite de unidades nesta sprint — apenas armazenar o modelo
