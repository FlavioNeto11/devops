# Sprint 11 — Equipe e Permissões + Convites Reais

**Objetivo**: Owner convida, gerencia e revoga acessos sem depender de suporte técnico. Alinhar RBAC frontend/backend.  
**Resultado de negócio**: Onboarding de novos usuários 100% self-service; owner revoga acesso com efeito imediato.  
**Duração**: 2 semanas

---

## Pré-requisito: fechar matriz RBAC canônica

Antes de implementar qualquer código desta sprint, revisar [`docs/rbac-matrix.md`](../docs/rbac-matrix.md) e decidir:
- [ ] Executor pode criar atividades? (backend permite; frontend bloqueia) → definir e alinhar
- [ ] `canCreate()` no frontend atualizar para refletir decisão
- [ ] Documentar decisão no `rbac-matrix.md`

---

## Backend — API (apps/api)

### Modelo Invitation (novo)

- [ ] Adicionar migration para tabela `invitations`:
  ```prisma
  model Invitation {
    id             String    @id @default(uuid())
    organizationId String
    email          String
    role           String
    scopeType      String    // organization | unit | area
    scopeId        String?
    tokenHash      String    @unique
    invitedBy      String
    status         String    @default("pending") // pending | accepted | cancelled | expired
    expiresAt      DateTime
    acceptedAt     DateTime?
    createdAt      DateTime  @default(now())
    organization   Organization @relation(fields: [organizationId], references: [id])
    inviter        User         @relation(fields: [invitedBy], references: [id])
  }
  ```

### Endpoints de convite

- [ ] `POST /invitations`
  - Validar: sem convite pendente ativo para o mesmo e-mail+org+escopo
  - Gerar token criptograficamente seguro (`crypto.randomBytes(32).toString('hex')`)
  - Salvar `tokenHash = sha256(token)`
  - Disparar e-mail transacional com link `${FRONTEND_URL}/invite/${token}`
  - Retornar convite sem o token real
- [ ] `GET /invitations`
  - Query: `organizationId`, `status`, `page`
  - RBAC: `owner` e `org_manager` veem tudo; `unit_manager` só convites do seu escopo
- [ ] `POST /invitations/:id/resend`
  - Gerar novo token; atualizar `tokenHash`; reenviar e-mail
  - Resetar `expiresAt` para +7 dias
- [ ] `DELETE /invitations/:id` — cancelar convite (status = cancelled)
- [ ] `POST /invitations/:token/accept` (público — sem auth)
  - Buscar invitation por `sha256(token)`
  - Validar: não expirado, não aceito, não cancelado
  - Body: `{ name: string, password: string }` (para novo usuário)
  - Criar usuário + membership(s) em transaction
  - Marcar convite como `accepted`
  - Retornar JWT de acesso para login automático

### Proteção do último owner

- [ ] Em `DELETE /memberships/:id`: verificar se é o último owner → retornar 422 com mensagem clara
- [ ] Em `PATCH` de papel (se existir): mesma proteção

### Alinhamento RBAC

- [ ] `canCreate()` no frontend: atualizar conforme decisão acima

---

## Frontend — Web (apps/web)

### Gestão de Equipe (`/settings/team`)

- [ ] Criar rota `/settings/team`
- [ ] Componente `TeamAdminPage`:
  - Tabs: "Membros ativos" | "Convites pendentes"
  - Busca por nome/e-mail
  - Filtro por papel e escopo (unidade/área)
- [ ] Tab "Membros ativos":
  - Colunas: Nome, E-mail, Telefone, Papel, Escopo, Status, Ações
  - Ação "Editar papel": drawer com seleção de papel e escopo
  - Ação "Revogar": confirmação + `DELETE /memberships/:id`
  - Proteger: desabilitar revogar do último owner com tooltip explicativo
- [ ] Tab "Convites pendentes":
  - Colunas: E-mail, Papel, Escopo, Expira em, Status, Ações
  - Ação "Reenviar": `POST /invitations/:id/resend`
  - Ação "Cancelar": `DELETE /invitations/:id`
- [ ] Botão "Convidar pessoa" → drawer `InviteDrawer`:
  - Campos: E-mail, Tipo de acesso (Organização / Unidade / Área), Escopo, Papel
  - `POST /invitations`
  - Toast de sucesso com e-mail enviado
- [ ] Adicionar link "Equipe" em Settings (owner, org_manager, unit_manager*)
- [ ] unit_manager: sidebar `?unit=:primaryUnitId` → filtrar membros/convites da unidade

### Página de aceite de convite

- [ ] Criar rota pública `/invite/:token`
- [ ] Componente `InviteAcceptPage`:
  - Exibir: organização que convidou, papel e escopo
  - Campos: Nome completo, Senha, Confirmar senha
  - `POST /invitations/:token/accept`
  - Em sucesso: login automático com JWT retornado → redirect para rota padrão do papel
  - Tratar erros: expirado, já aceito, cancelado

### Visualização da matriz de permissões

- [ ] Em `/settings/team`, botão "Ver permissões" → modal com tabela simplificada
  - Linhas: papéis; Colunas: ações principais
  - Link para `docs/rbac-matrix.md` (se houver portal de docs)

---

## Template de e-mail — Convite

- [ ] Criar template `invite.html` (ou React Email) em `apps/api/src/emails/`
  - Exibir: nome da organização que convida, papel, escopo, botão CTA com link
  - Expiração do convite
  - Footer com link para ignorar

---

## Testes

- [ ] `POST /invitations` — convite duplicado ativo → 422
- [ ] `POST /invitations/:token/accept` — token expirado → 422; aceite correto → usuário + membership criados
- [ ] `DELETE /memberships/:id` — último owner → 422
- [ ] RBAC: `unit_manager` não acessa convites de outras unidades

---

## Critérios de aceite

- [ ] Owner convida pessoa que não existe → recebe e-mail com link → abre link → preenche nome+senha → loga com papel correto
- [ ] Membership revogado → usuário perde acesso no próximo request
- [ ] unit_manager vê equipe restrita à sua unidade
- [ ] Convite expirado exibe mensagem clara na tela de aceite
- [ ] Toda tela responsiva em 375px e 1280px

---

## Pitfalls conhecidos

- Token de convite: nunca salvar o token em texto plano — apenas `sha256(token)` no banco
- `POST /invitations/:token/accept` é pública (sem `authenticate` middleware) — não vazar dados do convite antes de validar o token
- E-mail de convite: usar `SMTP_FROM` configurado; tratar falha no envio (não bloquear criação do convite)
- Frontend: `expiresAt` vem como string UTC — converter para localtime na exibição
