# PRD — Product Requirements Document

**Versão**: 2.0 — pós-Sprint 8  
**Última atualização**: 2026-05-15

---

## Visão do produto

**GymOps** é um sistema operacional web/PWA para redes com múltiplas unidades físicas. Substitui o Trello como ferramenta de gestão de rotina operacional, corrigindo a inadequação de uma modelagem board-cêntrica para redes com permissões granulares e hierarquia organizacional.

**Problema central**: O Trello foi concebido para boards/lists/cards de equipes planas. O caso real exige controlar unidades operacionais distintas, áreas funcionais por unidade, donos de execução, pendências recorrentes, visões consolidadas de rede e acessos recortados por papel. A versão gratuita limita a 10 colaboradores/workspace.

**Proposta de valor**: Sistema com modelo próprio (`Org → Unidade → Área → Atividade`), visões separadas por perfil (gestor local, liderança de rede, colaborador), permissões por escopo, importador de legado Trello e camada administrativa completa — sem precisar de suporte técnico para administrar a plataforma.

---

## Personas

| Persona | Papel no sistema | Dor principal |
|---------|-----------------|---------------|
| **Dono/franqueador** | `owner` | Não enxerga o que acontece nas unidades sem ligar para cada gestor |
| **Gestor de rede** | `org_manager` | Perde tempo consolidando relatórios de status por unidade |
| **Gestor de unidade** | `unit_manager` | Mistura atividades de áreas diferentes, perde controle de prazo |
| **Líder de área** | `area_leader` | Não tem visão do que o time está executando na área dela |
| **Colaborador** | `executor` | Não sabe o que deve fazer hoje sem perguntar para alguém |
| **Convidado/fornecedor** | `viewer` | Recebe acessos desnecessariamente amplos para ver um único item |

---

## Entidades de domínio

| Entidade | Papel | Exemplo |
|---|---|---|
| **Organização** | Locatário do SaaS, dona do conjunto de unidades | "SkyFit" |
| **Unidade** | Local operacional com rotina própria | "Vila Xavier", "Centro", "Shopping" |
| **Área** | Recorte funcional padrão dentro da unidade | Administrativo, Marketing, Coordenação, Estrutura/Manutenção, Líder, Financeiro |
| **Atividade** | Item executável, acompanhável e permissionável | "Solicitar orçamento da esteira 4" |
| **Template** | Modelo padronizado por área com checklist e SLA | "Chamado de Manutenção" com 4 etapas |
| **ImportJob** | Job de migração Trello com dry-run → revisão → commit | |
| **RecurrenceRule** | Regra de geração automática de atividades periódicas | |

---

## Módulos funcionais

### Módulo 1 — Operação diária (implementado)

Fluxo transacional principal que os colaboradores usam todo dia:

- **Visão pessoal** (`/me`): Hoje, Atrasadas, Esta semana, Aguardando retorno
- **Visão por unidade** (`/units/:id`): Cards por área, filtros, indicadores
- **Drawer da atividade**: Checklist, comentários, anexos, histórico, recorrência, compartilhamento
- **Criação de atividade**: Com template, prioridade, prazo, área
- **Painel geral** (`/dashboard`): KPIs e tabela por unidade para gestão

### Módulo 2 — Administração da organização (em construção — Sprints 9–11)

Telas para que gestores administrem a plataforma sem intervenção técnica:

- **Perfil do usuário**: Nome, avatar, telefone (WhatsApp), timezone
- **Gestão da organização**: Branding, slug, políticas operacionais
- **Gestão de unidades**: Criar, editar, ativar/inativar unidades
- **Gestão de áreas**: Criar, vincular por unidade, reordenar
- **Gestão de templates**: CRUD completo com preview no formulário de nova atividade
- **Gestão de equipe e RBAC**: Convidar usuários, atribuir papéis, revogar acesso

### Módulo 3 — Visão transversal e operação em lote (planejado — Sprint 12)

- **Central global de atividades**: Busca, filtros avançados, ações em lote, filtros salvos
- **Fila de aprovações**: Atividades em `aguardando_aprovacao` pendentes de ação

### Módulo 4 — Importação e integrações (parcialmente implementado)

- **Importador Trello**: Dry-run → wizard de mapeamento → commit atômico → relatório
- **Centro de importações**: Histórico de jobs, retry/cancel, itens detalhados (Sprint 13)
- **Integração Trello OAuth**: Fluxo implícito implementado
- **Integração WhatsApp**: Envio configurado; falta circuito de validação

### Módulo 5 — Automação e notificações (parcialmente implementado)

- **Recorrência de atividades**: Cron horário gera próxima ao concluir ou pré-gera N ocorrências
- **Centro de recorrências**: Listar regras, pausar, editar, ver próxima execução (Sprint 14)
- **Notificações**: E-mail + web push VAPID + WhatsApp — workers funcionais
- **Centro de notificações/logs**: Histórico de entrega, troubleshooting (Sprint 14)

### Módulo 6 — IA estruturada (implementado)

Copiloto de apoio à criação e gestão, não agente autônomo:

| Recurso | Entrada | Saída |
|---------|---------|-------|
| Criação por texto | Texto livre | Rascunho para confirmação |
| Checklist automático | Template + descrição | Itens sugeridos |
| Resumo diário | Agregados da unidade | Texto curto para gestor |
| Detecção de atraso | Query SQL | Flag + explicação da IA |

---

## Atividade — blocos funcionais

### Identificação
- Título (obrigatório), descrição (rich text opcional)
- Unidade e Área (obrigatórios)
- Template (opcional, mas recomendado)

### Execução
- Status: `novo` | `em_andamento` | `aguardando_terceiro` | `aguardando_aprovacao` | `concluido` | `cancelado`
- Atraso: estado **derivado** (prazo vencido + não concluído), nunca manual
- Prioridade: `baixa` | `media` | `alta` | `critica`
- Responsável principal + participantes (N usuários)
- Prazo (`due_at`)

### Controle
- Checklist (múltiplos blocos, N itens cada)
- Comentários (texto; menções @usuário planejadas)
- Anexos (upload próprio via R2 ou link externo)
- Histórico de eventos (imutável, auditável)

### Rotina
- Recorrência: `diaria` | `semanal` | `mensal` | `intervalo_customizado`
- Watchers: notificados sem ser responsáveis

### Acesso
- `visibility_mode`: `inherited` | `restricted` | `shared`
- Compartilhamentos explícitos via `activity_permissions`

---

## Papéis e permissões (RBAC)

Ver [`docs/rbac.md`](rbac.md) para algoritmo e [`docs/rbac-matrix.md`](rbac-matrix.md) para matriz completa.

| Papel | Escopo | Nível de acesso |
|---|---|---|
| `owner` | Organização | Irrestrito |
| `org_manager` | Organização | Leitura e edição total exceto configurações de owner |
| `unit_manager` | Unidade | Total na unidade |
| `area_leader` | Área | Total na área |
| `executor` | Área ou Atividade | O que executa + próprias delegações |
| `viewer` | Atividade | Somente leitura em itens compartilhados |

---

## Templates por área

Cada template pré-define: checklist sugerido, prioridade padrão, visibilidade padrão, SLA sugerido.

| Área | Templates | Campos específicos |
|---|---|---|
| **Administrativo** | Documento, Senha/Acesso, Contrato, Regularização | validade, órgão emissor, confidencialidade |
| **Marketing** | Campanha, Peça, Evento, Parceria | canal, objetivo, período, material necessário |
| **Coordenação** | Escala, Treinamento, Planejamento, Avaliação | professor responsável, turma, data-alvo |
| **Estrutura/Manutenção** | Chamado, Vistoria, Orçamento, Execução | equipamento/local, criticidade, fornecedor |
| **Líder** | Reunião, Ação gerencial, Projeto futuro, Follow-up | participantes, decisão, próximo passo |
| **Financeiro** | Conta a pagar, Comprovante, Fechamento, Pendência fiscal | vencimento, valor, fornecedor, comprovante |

---

## Notificações

| Canal | Implementação | Status |
|---|---|---|
| E-mail (SMTP) | Nodemailer + templates HTML | ✅ Funcional |
| Web Push | web-push VAPID | ✅ Funcional |
| WhatsApp | Twilio API | ⚠️ Envio OK; sem validação do canal |

---

## Importador Trello

**Dois modos de entrada:**
1. Upload de JSON exportado do Trello (funcional)
2. Conexão via Trello API OAuth — fluxo implícito implementado

**Wizard:** dry-run → preview com mapeamento sugerido → revisão → commit atômico

**Mapeamento padrão:**
- Board → Unidade | List → Área | Card → Atividade
- Card members → Assignees | Comments → Comentários | Checklist → Checklist
- Due date → `due_at` | Archived → status `cancelado`

---

## Requisito de responsividade

Todo o produto deve funcionar em desktop (≥768px) e mobile (<768px). Ver regras detalhadas em `CLAUDE.md`.

---

## Estado de implementação (2026-05-15)

MVP readiness: ~97% funcional. Gap principal: camada administrativa frontend.

| Feature | Estado |
|---------|--------|
| Auth email/senha + OAuth Google | ✅ 100% |
| Org/Unit/Area CRUD (API) | ✅ 95% |
| Telas administrativas (frontend) | ❌ 30% — principal gap |
| Activities + Checklists + Comentários | ✅ 90% |
| Notificações (e-mail/push/WA) | ✅ 85% |
| Anexos (R2) | ✅ 85% |
| Templates | ✅ 100% |
| Recorrência | ✅ 90% |
| IA (4 features) | ✅ 90% |
| Trello import (atômico) | ✅ 95% |
| Dashboard + visões | ✅ 85% |
| Mobile responsivo | ✅ 100% |
| CI/CD + E2E | ✅ 90% |

Ver [`docs/status.md`](status.md) para detalhes e plano por sprint.

---

## Métricas de sucesso

### MVP operacional (piloto)
- Migração de ≥10 unidades do Trello sem perda de dados
- Gestor local vê todas as atividades da unidade em <3 cliques
- Liderança vê painel geral da rede em 1 tela
- Colaborador vê suas atividades do dia na visão pessoal
- Atividade recorrente gerada automaticamente sem intervenção manual
- Produto funciona em celular Android/iOS via PWA

### MVP administrável (produto completo)
- Owner cria unidade, vincula áreas e convida equipe sem suporte técnico
- Gestor edita template e vê reflexo no formulário de nova atividade imediatamente
- Owner revoga acesso de um usuário e este perde o acesso em <30 segundos
- Toda atividade da organização é encontrável em <3 interações pela Central Global

---

## Fora do escopo MVP

- App nativo iOS/Android (PWA responsivo substitui)
- Workflow builder visual / automações complexas
- OCR/RAG em anexos
- Billing/Stripe (adiar para pós-MVP)
- Múltiplos provedores IA simultâneos
- WebSockets em tempo real (polling simples no MVP)
- Google Drive / OneDrive (Sprint 15+)
- Relatórios exportáveis PDF/Excel
- Busca full-text com pgvector
- Múltiplos idiomas (i18n)
