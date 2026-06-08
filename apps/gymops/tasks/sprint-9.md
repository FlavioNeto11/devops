# Sprint 9 — Perfil + Organização + Templates Admin

**Objetivo**: Self-service básico. Ao fim, gestor edita perfil, configura organização e mantém templates sem intervenção técnica.  
**Resultado de negócio**: Usuário cadastra telefone (desbloqueia WhatsApp); owner edita branding sem seed; templates administráveis sem banco.  
**Duração**: 2 semanas

---

## Backend — API (apps/api)

### Perfil do usuário

- [ ] `PATCH /me/profile` — atualizar nome, telefone (E.164), avatar, timezone, locale
  - Validar telefone com regex `/^\+[1-9]\d{1,14}$/`
  - Validar timezone com lista IANA (usar `Intl.supportedValuesOf('timeZone')` ou lista hardcoded)
  - Retornar usuário atualizado no envelope `{ data: User }`
- [ ] `POST /me/avatar/presign` — presign R2 para upload de avatar
  - Aceitar `{ filename: string, mimeType: string, sizeBytes: number }`
  - Validar `mimeType` em `['image/jpeg', 'image/png', 'image/webp']`
  - Validar `sizeBytes <= 5_000_000`
  - Retornar `{ uploadUrl, objectKey }`
- [ ] `POST /me/avatar` — registrar avatar após upload
  - Aceitar `{ objectKey: string }`
  - Atualizar `users.avatar_url` com URL pública do R2

### Organização

- [ ] Ampliar `PATCH /organizations/:id`:
  - Aceitar `logo` (objectKey R2) e atualizar URL
  - Aceitar `settings` JSONB com campos documentados: `dailySummaryTime`, `defaultDueDays`, `defaultVisibility`
  - Documentar schema do `settings` em comentário no handler
- [ ] `POST /organizations/:id/logo/presign` — presign R2 para logo
  - Mesmas validações do avatar

### Templates

- [ ] `POST /activity-templates/:id/duplicate`
  - Criar cópia com nome `"(Cópia) {nome original}"`
  - `isSystem` = false na cópia
  - Retornar novo template no envelope

---

## Frontend — Web (apps/web)

### Página de Perfil

- [ ] Criar rota `/profile`
- [ ] Componente `ProfileForm`:
  - Campos: nome, telefone, timezone (select), início da semana
  - Upload de avatar: drag & drop + presign + R2 + `POST /me/avatar`
  - Validação client-side de telefone com feedback inline
  - `useMutation` + toast de sucesso/erro
- [ ] Adicionar link "Meu Perfil" na sidebar (todos os papéis) e no avatar dropdown
- [ ] Responsivo: `p-3 md:p-6`, inputs `w-full`

### Página de Gestão da Organização

- [ ] Criar rota `/settings/organization` (acessível apenas a `owner`)
- [ ] Componente `OrgSettingsPage` com tabs:
  - Tab "Identidade": nome, slug (com preview de URL), upload de logo
  - Tab "Políticas": `dailySummaryTime`, `defaultDueDays`, `defaultVisibility`
  - Tab "Ambiente": ID da org, data de criação (somente leitura)
- [ ] Guard de rota: redirecionar `org_manager+` para `/dashboard` se `role !== 'owner'`
- [ ] Adicionar link "Organização" em Settings, visível apenas para `owner`

### Melhoria na Gestão de Templates

- [ ] Adicionar botão "Duplicar" em cada template (chama `POST /activity-templates/:id/duplicate`)
- [ ] Adicionar confirmação antes de arquivar (soft delete)
- [ ] Exibir badge "Sistema" em templates `isSystem` (não-editáveis, não-excluíveis)
- [ ] Filtro por área na listagem de templates
- [ ] Preview: botão "Testar no formulário" → abre `NewActivityDialog` com template pré-selecionado

---

## Testes

- [ ] Unit test backend: `PATCH /me/profile` — validações telefone, timezone, avatar
- [ ] Unit test backend: `POST /activity-templates/:id/duplicate` — campos copiados, isSystem=false
- [ ] Ampliar `rbac.test.ts`: verificar que `unit_manager` não acessa `PATCH /organizations/:id`

---

## Critérios de aceite

- [ ] Usuário cadastra telefone no perfil → toggle WhatsApp em Integrações pode ser habilitado
- [ ] Owner edita nome/logo da organização → reflete no header/sidebar imediatamente
- [ ] Gestores duplicam e arquivam templates sem tocar no banco diretamente
- [ ] Toda tela responsiva em 375px e 1280px

---

## Pitfalls conhecidos

- `users.phone` já existe no schema Prisma — não recriar coluna
- Avatar URL pública do R2: usar `R2_PUBLIC_URL` + objectKey (não signed URL)
- Timezone: usar `Intl.DateTimeFormat().resolvedOptions().timeZone` como valor padrão no frontend
- `PATCH /organizations/:id` já existe — adicionar campos, não recriar o handler
