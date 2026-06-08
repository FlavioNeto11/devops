# Sprint 14 — Centro de Recorrências + Notificações/Logs + WhatsApp

**Objetivo**: Fechar operação contínua e dar visibilidade de troubleshooting ao time sem acesso a logs de servidor.  
**Resultado de negócio**: Falhas de notificação visíveis e diagnosticáveis; WhatsApp testável e validável pela UI.  
**Duração**: 2 semanas

---

## Backend — API (apps/api)

### Centro de Recorrências

- [ ] `GET /recurrences`
  - Query: `organizationId`, `unitId?`, `areaId?`, `status?` (active/paused)
  - Retornar: id, atividade de origem (título, unidade, área), frequência, próxima execução (`nextRunAt`), última execução (`lastRunAt`), status
  - RBAC: `org_manager` vê tudo; `unit_manager` filtra por suas unidades automaticamente
- [ ] `PATCH /recurrences/:id`
  - Aceitar: `{ status: 'paused' | 'active' }` — pausar/retomar regra
  - Aceitar: `{ frequency, interval, dayOfWeek, dayOfMonth }` — alterar frequência
  - Recalcular `nextRunAt` ao alterar frequência
- [ ] `DELETE /recurrences/:id` — excluir regra com confirmação (soft delete ou hard delete com check)

### Delivery Log de notificações

- [ ] Migration para `NotificationDelivery`:
  ```prisma
  model NotificationDelivery {
    id                String   @id @default(uuid())
    userId            String
    organizationId    String
    channel           String   // email | push | whatsapp
    type              String   // activity_assigned | due_reminder | overdue | daily_summary | test
    status            String   // sent | failed | pending
    providerMessageId String?
    errorMessage      String?
    requestPayloadJson Json?
    createdAt         DateTime @default(now())
    user              User         @relation(fields: [userId], references: [id])
    organization      Organization @relation(fields: [organizationId], references: [id])
  }
  ```
- [ ] Integrar gravação de `NotificationDelivery` no `notification-worker.ts` para cada envio (sucesso e falha)
- [ ] `GET /notifications/deliveries`
  - Query: `organizationId?`, `channel?`, `status?`, `dateFrom?`, `dateTo?`, `page`
  - RBAC: usuário vê próprias entregas; `org_manager`/`owner` veem tudo da org
- [ ] Ampliar `POST /notifications/test` com `channel: 'whatsapp'`
  - Verificar que usuário tem `phone` no perfil → se não: retornar 422 com mensagem "Cadastre seu telefone no perfil"
  - Enviar mensagem de teste via `sendWhatsApp`
  - Gravar `NotificationDelivery` com resultado

### WhatsApp status

- [ ] `GET /integrations/whatsapp/status`
  - Retornar: `{ configured: boolean, sandbox: boolean, from: string, lastErrors: string[] }`
  - `sandbox`: true se `TWILIO_WHATSAPP_FROM === '+14155238886'` (número padrão do sandbox)
  - `lastErrors`: últimas 5 falhas de entrega de WhatsApp da org (da tabela `NotificationDelivery`)

### Validação de telefone no perfil

- [ ] Antes de habilitar WhatsApp em `PATCH /notifications/preferences`:
  - Verificar que `user.phone` está preenchido
  - Se não: retornar 422 com `{ error: { code: 'PHONE_REQUIRED', message: '...' } }`

---

## Frontend — Web (apps/web)

### Centro de Recorrências (`/settings/recurrences`)

- [ ] Criar rota `/settings/recurrences`
- [ ] Componente `RecurrencesAdminPage`:
  - **Filtros**: Unidade, Área, Status (ativa/pausada)
  - **Tabela**:
    - Colunas: Atividade, Unidade, Área, Frequência, Próxima execução, Última execução, Status, Ações
    - Ações: Pausar/Retomar | Editar frequência | Excluir
  - **Status badge**: Ativa (verde) | Pausada (amarelo)
- [ ] Drawer "Editar frequência":
  - Select: Diária, Semanal, Mensal, Intervalo customizado
  - Campos condicionais por frequência
  - Preview "Próxima execução: ..."
  - Salvar → `PATCH /recurrences/:id`
- [ ] Confirmação ao excluir regra
- [ ] Adicionar link "Recorrências" em Settings (owner, org_manager, unit_manager*)

### Centro de Notificações e Logs (melhorar `/settings/notifications`)

- [ ] Adicionar tab "Histórico de entregas":
  - Tabela: Canal, Tipo, Data, Status, Erro (se houver)
  - Filtros: Canal, Status, Período
  - Ícones de canal: envelope, sino, WhatsApp
- [ ] Ampliar seção de teste de canal:
  - Botões: "Testar e-mail" | "Testar push" | "Testar WhatsApp"
  - WhatsApp desabilitado se perfil sem telefone (tooltip explicativo com link para `/profile`)
  - Feedback em tempo real: spinner → ✅ Enviado / ❌ Falha + mensagem de erro

### Status do WhatsApp em Integrações

- [ ] Em `/settings/integrations`, seção WhatsApp:
  - Exibir resultado de `GET /integrations/whatsapp/status`
  - Badge: "Sandbox" (laranja) ou "Produção" (verde)
  - Número configurado: `from`
  - Lista de erros recentes
  - Link para "Centro de notificações" para ver histórico completo

---

## Testes

- [ ] `GET /notifications/deliveries` — isolamento por org; RBAC para usuário comum vs org_manager
- [ ] `POST /notifications/test` com `channel: 'whatsapp'` sem telefone → 422
- [ ] `PATCH /recurrences/:id` — pausar/retomar altera `status` e não altera `nextRunAt`
- [ ] Gravar `NotificationDelivery` em falhas de envio no worker

---

## Critérios de aceite

- [ ] Gestor vê lista de recorrências ativas e pode pausar/retomar sem acessar banco
- [ ] Delivery log exibe últimas entregas com status e erro legível
- [ ] Botão "Testar WhatsApp" sem telefone no perfil → mostra orientação clara com link para `/profile`
- [ ] Com telefone no perfil e WhatsApp habilitado → teste envia mensagem e exibe confirmação
- [ ] Badge Sandbox/Produção é exibido corretamente em integrações

---

## Pitfalls conhecidos

- `NotificationDelivery`: gravar falhas é tão importante quanto gravar sucessos — sempre gravar em try/catch do worker
- Não expor `requestPayloadJson` no GET de delivery log para `executor/viewer` — pode conter dados sensíveis
- WhatsApp sandbox: mensagens de teste só chegam se o número de destino entrou no sandbox
- Ao pausar recorrência: não excluir `nextRunAt` — manter para retomar no mesmo ponto
- `GET /recurrences` pode ser confundido com endpoint de regras ou de ocorrências — retornar regras (RecurrenceRule), não ocorrências individuais
