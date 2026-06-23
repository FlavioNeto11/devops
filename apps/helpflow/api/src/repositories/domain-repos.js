// repositories/domain-repos.js — instâncias CRUD por entidade de domínio do HelpFlow.
// Mantém o server.js fino: cada rota chama um destes repos. As colunas graváveis
// espelham os fields da concepção (tenant_id/created_at/updated_at ficam fora — o
// repo/migração os gerenciam). O mapa `repos` é indexado pelo segmento de rota.
import { makeCrudRepo } from './crud-repo.js';

// Redação das credenciais na leitura: valores substituídos por ••• redigido •••,
// chaves preservadas. Defesa no backend: segredos nunca chegam ao cliente em plaintext.
function redactIntegration(row) {
  if (!row) return null;
  const creds = row.credentials;
  const redacted =
    creds && typeof creds === 'object' && Object.keys(creds).length > 0
      ? Object.fromEntries(Object.keys(creds).map((k) => [k, '••• redigido •••']))
      : creds;
  return { ...row, credentials: redacted };
}

export const customers = makeCrudRepo({
  table: 'customers',
  columns: ['name', 'email', 'phone', 'organization', 'vip', 'status', 'notes'],
  sortable: ['name', 'email', 'organization', 'status', 'vip'],
  // ?q= no autocomplete de solicitante: casa por nome, e-mail ou organização.
  searchable: ['name', 'email', 'organization'],
});

export const agents = makeCrudRepo({
  table: 'agents',
  columns: ['name', 'email', 'role', 'team_id', 'status', 'last_login_at'],
  sortable: ['name', 'email', 'role', 'team_id', 'status', 'last_login_at'],
});

export const teams = makeCrudRepo({
  table: 'teams',
  columns: ['name', 'description', 'lead_agent_id', 'default_sla_policy_id', 'status'],
  sortable: ['name', 'status'],
});

export const comments = makeCrudRepo({
  table: 'comments',
  columns: ['ticket_id', 'author_id', 'body', 'visibility'],
  sortable: ['ticket_id', 'author_id', 'visibility'],
});

export const slaPolicies = makeCrudRepo({
  table: 'sla_policies',
  columns: ['name', 'priority', 'first_response_mins', 'resolution_mins', 'business_hours_only', 'status'],
  sortable: ['name', 'priority', 'first_response_mins', 'resolution_mins', 'status'],
});

export const kbArticles = makeCrudRepo({
  table: 'kb_articles',
  columns: ['title', 'body', 'category', 'tags', 'status', 'embedding_status', 'author_id'],
  sortable: ['title', 'category', 'status', 'embedding_status', 'author_id'],
  // ?q= na sugestão de artigos do TicketCreateView: busca textual (ILIKE) sobre
  // título, corpo, categoria e tags. NÃO é busca vetorial — o app provisiona o
  // flag embedding_status mas não há coluna pgvector na migração; expor uma rota
  // "semântica" seria fabricar endpoint. A tela usa isto como feed de sugestão
  // com degradação graciosa (loading/empty/error), cumprindo a UX prometida.
  searchable: ['title', 'body', 'category', 'tags'],
});

export const integrations = makeCrudRepo({
  table: 'integrations',
  columns: ['name', 'kind', 'base_url', 'timeout_ms', 'retries', 'credentials', 'mapping', 'status', 'last_check_at'],
  sortable: ['name', 'kind', 'status', 'last_check_at'],
  transform: redactIntegration,
});

// tickets — entidade central do service desk. sla_due_at NÃO é gravável pelo
// cliente: é derivado server-side da política de SLA aplicada (ver server.js,
// recomputeSlaDue). Manter fora de `columns` impede que o front "escolha" o prazo.
export const tickets = makeCrudRepo({
  table: 'tickets',
  columns: ['subject', 'description', 'priority', 'status', 'channel', 'team_id', 'assignee_id', 'sla_policy_id', 'external_ref', 'customer_id', 'sla_due_at'],
  sortable: ['subject', 'priority', 'status', 'channel', 'team_id', 'assignee_id', 'sla_due_at', 'created_at', 'updated_at'],
});

// Indexado pelo segmento de rota REST (/v1/<route>). Inclui os campos obrigatórios
// por entidade para a validação mínima nas rotas POST.
export const repos = {
  customers: { repo: customers, required: ['name', 'email'] },
  // tenant_id é obrigatório na entidade mas vem sempre do header X-Tenant-Id (default 1),
  // gerenciado pelo repo — por isso não está na validação de body.
  agents: { repo: agents, required: ['name', 'email', 'role'] },
  teams: { repo: teams, required: ['name'] },
  comments: { repo: comments, required: ['ticket_id', 'author_id', 'body', 'visibility'] },
  'sla-policies': { repo: slaPolicies, required: ['name', 'priority', 'first_response_mins', 'resolution_mins'] },
  'kb-articles': { repo: kbArticles, required: ['title', 'body', 'status'] },
  integrations: { repo: integrations, required: ['name', 'kind', 'status'] },
  tickets: { repo: tickets, required: ['subject', 'priority', 'status'] },
};
