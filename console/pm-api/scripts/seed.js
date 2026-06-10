import { query } from '../src/db/pool.js';
import { seedCmsAnarabottini } from './cms-seed-anarabottini.js';
import { seedCmsRmambiental } from './cms-seed-rmambiental.js';

// Base do repositorio para montar git_url/pr_url reais (resolvem no GitHub).
const REPO = 'https://github.com/FlavioNeto11/devops';

// Projetos atuais da plataforma. Fonte: docs/standards/fr/<app>.md (estado pronto/falta).
const PROJECTS = [
  { key: 'sicat', name: 'SICAT', stack: 'Vue 3 / Node+Express / PostgreSQL', repo_url: 'apps/sicat', route: '/sicat', k8s_label_selector: 'sicat', status: 'active', description: 'Gestao ambiental e conformidade (CETESB/MTR/DMR) com IA conversacional.' },
  { key: 'gymops', name: 'GymOps', stack: 'Next.js 14 / Fastify / Postgres+pgvector / Redis', repo_url: 'apps/gymops', route: '/gymops', k8s_label_selector: 'gymops', status: 'active', description: 'Gestao operacional multiunidade com IA assistiva.' },
  { key: 'rmambiental', name: 'RM Ambiental', stack: 'React + Vite (estatico)', repo_url: 'apps/rmambiental', route: '/rmambiental', k8s_label_selector: 'rmambiental', status: 'active', description: 'Portal institucional premium.' },
  { key: 'anarabottini', name: 'Ana Rabottini', stack: 'React + Vite (estatico)', repo_url: 'apps/anarabottini', route: '/anarabottini', k8s_label_selector: 'anarabottini', status: 'active', description: 'Portal de palestrante corporativa — saude mental, neurodiversidade e adequacao a NR-1.' },
];

// Itens por projeto, ja "nos conformes": descricao + git (caminho no repo) + tasks
// (comeco->meio->fim). git_url/pr_url sao derivados de `git`+status no loop.
// tasks[].status: 'todo' | 'in_progress' | 'done'.
const ITEMS = {
  sicat: [
    {
      type: 'feature', title: 'Autenticacao propria + OIDC Keycloak', status: 'done', priority: 'P1',
      git: 'apps/sicat/backend/src/lib/sicat-security.ts',
      description: 'Login proprio do SICAT + SSO ADITIVO via Keycloak (realm nvit): o backend valida o token no /userinfo e emite a sessao do app; o frontend tem botao PKCE. Nao toca nas integracoes SIGOR/CETESB.',
      tasks: [
        { title: 'Cripto de sessao (HMAC-SHA256 + scrypt + AES-256-GCM)', status: 'done' },
        { title: 'Validar token Keycloak no /userinfo', status: 'done' },
        { title: 'Botao de login PKCE no frontend', status: 'done' },
      ],
    },
    {
      type: 'feature', title: 'MTR provisorio (criar/listar/cancelar/imprimir)', status: 'done', priority: 'P1',
      git: 'apps/sicat/backend/src',
      description: 'Manifesto de Transporte de Residuos provisorio: CRUD completo, cancelamento e impressao/visualizacao.',
      tasks: [
        { title: 'Modelagem + migracao do MTR', status: 'done' },
        { title: 'Endpoints CRUD + cancelar', status: 'done' },
        { title: 'Impressao / visualizacao', status: 'done' },
      ],
    },
    {
      type: 'feature', title: 'DMR declaratorio (CRUD + consolidar + submeter)', status: 'done', priority: 'P1',
      git: 'apps/sicat/backend/src',
      description: 'Declaracao de Movimentacao de Residuos: CRUD, consolidacao por periodo e submissao declaratoria.',
      tasks: [
        { title: 'CRUD da DMR', status: 'done' },
        { title: 'Consolidar periodo', status: 'done' },
        { title: 'Submeter declaratorio', status: 'done' },
      ],
    },
    {
      type: 'feature', title: 'IA conversacional (gpt-5-nano) + RAG', status: 'done', priority: 'P2',
      git: 'apps/sicat/backend/src/services/conversation',
      description: 'Assistente conversacional com LangChain + RAG (indice baked via BuildKit secret). Usa o contrato gpt-5 (temperature omitida, reasoning_effort) via @flavioneto11/ai-kit.',
      tasks: [
        { title: 'Adapter ChatOpenAI no contrato gpt-5', status: 'done' },
        { title: 'Indice RAG + retrieval', status: 'done' },
        { title: 'Endpoint de chat', status: 'done' },
      ],
    },
    {
      type: 'evolution', title: 'Centro Operacional SICAT (observabilidade/diagnostico)', status: 'todo', priority: 'P1',
      git: 'apps/sicat',
      description: 'Painel interno de observabilidade/diagnostico do SICAT: saude das integracoes, filas e jobs, com sinais acionaveis.',
      tasks: [
        { title: 'Levantar metricas/sinais relevantes', status: 'todo' },
        { title: 'Tela de diagnostico', status: 'todo' },
        { title: 'Alertas basicos', status: 'todo' },
      ],
    },
    {
      type: 'feature', title: 'Gateway HAR real da CETESB para DMR (hoje stub 503)', status: 'todo', priority: 'P1',
      git: 'apps/sicat/backend/src',
      description: 'Substituir o stub que responde 503 por um gateway HAR real da CETESB para submissao da DMR.',
      tasks: [
        { title: 'Mapear fluxo HAR/CETESB', status: 'in_progress' },
        { title: 'Implementar gateway', status: 'todo' },
        { title: 'Testes de submissao ponta a ponta', status: 'todo' },
      ],
    },
    {
      type: 'feature', title: 'Chat orquestrador (Command Center)', status: 'backlog', priority: 'P2',
      git: 'apps/sicat',
      description: 'Command Center: chat orquestrador que aciona acoes do SICAT (MTR/DMR/relatorios) por linguagem natural, com guardrails.',
      tasks: [
        { title: 'Desenhar intents/acoes', status: 'todo' },
        { title: 'Orquestracao + guardrails', status: 'todo' },
        { title: 'UI do Command Center', status: 'todo' },
      ],
    },
  ],
  gymops: [
    {
      type: 'feature', title: 'IA assistiva (criar atividade/checklist + chat)', status: 'done', priority: 'P1',
      git: 'apps/gymops/apps/api/src/ai',
      description: 'IA assistiva: sugere atividade/checklist e oferece chat. A IA nunca salva direto — sempre retorna rascunho confirmavel; respostas em JSON Schema validado.',
      tasks: [
        { title: 'Servico de IA (chatJSON/chatText + callAI)', status: 'done' },
        { title: 'Sugerir atividade/checklist', status: 'done' },
        { title: 'Chat assistivo', status: 'done' },
      ],
    },
    {
      type: 'bug', title: 'Checklist sugerido pela IA nao vinculava a atividade', status: 'done', priority: 'P1',
      git: 'apps/gymops/apps/api/src',
      description: 'Ao criar tarefa com IA, o checklist sugerido era gerado mas nao era vinculado a atividade criada. Corrigido (commit c841200).',
      tasks: [
        { title: 'Reproduzir o bug', status: 'done' },
        { title: 'Vincular checklist a atividade criada', status: 'done' },
        { title: 'Teste de regressao', status: 'done' },
      ],
    },
    {
      type: 'feature', title: 'Import Trello (dedupe) + WhatsApp', status: 'done', priority: 'P2',
      git: 'apps/gymops/apps/api/src',
      description: 'Pipeline de importacao do Trello (fetch -> dry-run -> commit atomico) com dedupe de cards, e notificacoes via WhatsApp.',
      tasks: [
        { title: 'Pipeline fetch -> dry-run -> commit', status: 'done' },
        { title: 'Dedupe de cards', status: 'done' },
        { title: 'Notificacao WhatsApp', status: 'done' },
      ],
    },
    {
      type: 'feature', title: 'Consome @flavioneto11/ai-kit (contrato gpt-5 compartilhado)', status: 'done', priority: 'P2',
      git: 'packages/ai-kit',
      description: 'ai.service.ts re-exporta do @flavioneto11/ai-kit (assinaturas identicas); o legado fica atras da flag AI_KIT=off por um ciclo.',
      tasks: [
        { title: 'Criar ai-kit + testes (node --test)', status: 'done' },
        { title: 'Re-export drop-in no GymOps', status: 'done' },
        { title: 'Smoke /gymops/api', status: 'done' },
      ],
    },
    {
      type: 'bug', title: 'CORS com localhost hardcoded como fallback (BUG-010)', status: 'todo', priority: 'P1',
      git: 'apps/gymops/apps/api/src',
      description: 'BUG-010: o fallback de CORS usa localhost hardcoded. Mover as origens permitidas para variavel de ambiente (CORS_ORIGINS).',
      tasks: [
        { title: 'Localizar o fallback hardcoded', status: 'done' },
        { title: 'Origens permitidas via env (CORS_ORIGINS)', status: 'todo' },
        { title: 'Validar preflight em /gymops/api', status: 'todo' },
      ],
    },
    {
      type: 'evolution', title: 'Arquivo .env.docker.public.example separado (OPS-005)', status: 'todo', priority: 'P1',
      git: 'apps/gymops',
      description: 'OPS-005: separar um .env.docker.public.example (placeholders) dedicado ao deploy publico, sem segredos no git.',
      tasks: [
        { title: 'Levantar variaveis publicas', status: 'todo' },
        { title: 'Criar .env.docker.public.example', status: 'todo' },
        { title: 'Documentar no README', status: 'todo' },
      ],
    },
    {
      type: 'evolution', title: 'Integrar Sentry (OPS-006)', status: 'backlog', priority: 'P2',
      git: 'apps/gymops',
      description: 'OPS-006: integrar Sentry para captura de erros em api e web (DSN via env).',
      tasks: [
        { title: 'Escolher SDK + DSN via env', status: 'todo' },
        { title: 'Instrumentar api e web', status: 'todo' },
        { title: 'Validar captura de erro', status: 'todo' },
      ],
    },
    {
      type: 'evolution', title: 'Indices Postgres de performance (OPS-007)', status: 'backlog', priority: 'P2',
      git: 'apps/gymops/packages/db',
      description: 'OPS-007: criar indices no Postgres para as queries quentes (listas grandes, paginacao por cursor).',
      tasks: [
        { title: 'Identificar queries lentas', status: 'todo' },
        { title: 'Criar indices', status: 'todo' },
        { title: 'Medir ganho', status: 'todo' },
      ],
    },
    {
      type: 'feature', title: 'Endpoint /admin/queues/stats (OPS-008)', status: 'backlog', priority: 'P2',
      git: 'apps/gymops/apps/api/src',
      description: 'OPS-008: expor /admin/queues/stats com metricas das filas BullMQ (recurrence/import/notification/ai-summary/delay-scan).',
      tasks: [
        { title: 'Coletar metricas das filas BullMQ', status: 'todo' },
        { title: 'Endpoint /admin/queues/stats', status: 'todo' },
        { title: 'Proteger por RBAC', status: 'todo' },
      ],
    },
    {
      type: 'evolution', title: 'Documentacao OpenAPI (OPS-009)', status: 'backlog', priority: 'P2',
      git: 'apps/gymops/apps/api/src',
      description: 'OPS-009: gerar e publicar a documentacao OpenAPI das rotas Fastify.',
      tasks: [
        { title: 'Anotar rotas Fastify', status: 'todo' },
        { title: 'Gerar OpenAPI', status: 'todo' },
        { title: 'Publicar /docs', status: 'todo' },
      ],
    },
  ],
  rmambiental: [
    {
      type: 'feature', title: 'Portal institucional completo (hero/servicos/galeria/contato)', status: 'done', priority: 'P2',
      git: 'apps/rmambiental',
      description: 'SPA institucional premium (Vite/React): hero, servicos, galeria e contato, servida sob /rmambiental.',
      tasks: [
        { title: 'Secoes hero/servicos', status: 'done' },
        { title: 'Galeria + contato', status: 'done' },
        { title: 'Build com base /rmambiental', status: 'done' },
      ],
    },
    {
      type: 'feature', title: 'Tema claro/escuro (claro por padrao)', status: 'done', priority: 'P3',
      git: 'apps/rmambiental',
      description: 'Alternancia de tema claro/escuro, com o tema claro como padrao.',
      tasks: [
        { title: 'Tokens de tema', status: 'done' },
        { title: 'Toggle claro/escuro', status: 'done' },
        { title: 'Claro por padrao', status: 'done' },
      ],
    },
  ],
  anarabottini: [
    {
      type: 'feature', title: 'Portal institucional (hero/NR-1/sobre/palestras/contato)', status: 'done', priority: 'P2',
      git: 'apps/anarabottini',
      description: 'SPA institucional (Vite/React/Tailwind) com paleta quente, posicionamento NR-1 e portfolio de 6 palestras, servida sob /anarabottini.',
      tasks: [
        { title: 'Hero + secao NR-1 (gancho 2026)', status: 'done' },
        { title: '6 palestras + consultoria', status: 'done' },
        { title: 'Build com base /anarabottini', status: 'done' },
      ],
    },
    {
      type: 'feature', title: 'Upgrade interativo (videos, materiais, modais, FAQ, formulario)', status: 'done', priority: 'P2',
      git: 'apps/anarabottini/src/components',
      description: 'Palestras com filtro + modal de detalhe; secao de Midia (lightbox YouTube), Materiais, FAQ (acordeao) e formulario de proposta (WhatsApp/e-mail). Frontend-only e acessivel (WCAG AA).',
      tasks: [
        { title: 'Modal/VideoEmbed/Accordion reutilizaveis', status: 'done' },
        { title: 'Filtro de palestras + PalestraModal', status: 'done' },
        { title: 'Correcoes de a11y/contraste (revisao adversarial)', status: 'done' },
      ],
    },
    {
      type: 'evolution', title: 'Preencher midia e contato reais (placeholders)', status: 'todo', priority: 'P1',
      git: 'apps/anarabottini/src/lib/site.ts',
      description: 'Substituir placeholders por dados reais: WhatsApp/e-mail/redes, fotos, ids de YouTube e materiais (PDFs). Tudo centralizado em site.ts + data/*.ts.',
      tasks: [
        { title: 'Contato / redes / fotos', status: 'todo' },
        { title: 'Videos (youtubeId) + materiais (PDFs)', status: 'todo' },
      ],
    },
  ],
};

/**
 * Idempotente:
 *  - projetos: upsert por `key`.
 *  - itens: upsert por (project, title) — INSERE se ausente, ATUALIZA o conteudo
 *    (type/priority/description/git_url/pr_url) se ja existir. NAO mexe no `status`
 *    para preservar movimentacoes manuais no board.
 *  - tasks: insere a checklist do item apenas se ele ainda nao tiver nenhuma task.
 */
export async function seed() {
  let projects = 0;
  let itemsInserted = 0;
  let itemsUpdated = 0;
  let tasksInserted = 0;

  for (const p of PROJECTS) {
    const { rows } = await query(
      `INSERT INTO projects (key,name,stack,repo_url,route,k8s_label_selector,status,description)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
       ON CONFLICT (key) DO UPDATE SET
         name=EXCLUDED.name, stack=EXCLUDED.stack, repo_url=EXCLUDED.repo_url, route=EXCLUDED.route,
         k8s_label_selector=EXCLUDED.k8s_label_selector, status=EXCLUDED.status,
         description=EXCLUDED.description, updated_at=now()
       RETURNING id`,
      [p.key, p.name, p.stack, p.repo_url, p.route, p.k8s_label_selector, p.status, p.description],
    );
    const projectId = rows[0].id;
    projects += 1;

    for (const it of ITEMS[p.key] || []) {
      const gitUrl = it.git ? `${REPO}/tree/main/${it.git}` : null;
      const prUrl = it.status === 'done' && it.git ? `${REPO}/commits/main/${it.git}` : null;

      const found = await query('SELECT id FROM items WHERE project_id=$1 AND title=$2', [projectId, it.title]);
      let itemId;
      if (found.rowCount) {
        itemId = found.rows[0].id;
        await query(
          `UPDATE items SET type=$2::item_type, priority=$3::item_priority,
                  description=$4, git_url=$5, pr_url=$6, updated_at=now()
             WHERE id=$1`,
          [itemId, it.type, it.priority, it.description, gitUrl, prUrl],
        );
        itemsUpdated += 1;
      } else {
        const ins = await query(
          `INSERT INTO items (project_id,type,title,status,priority,description,git_url,pr_url)
           VALUES ($1,$2,$3,$4::item_status,$5::item_priority,$6,$7,$8) RETURNING id`,
          [projectId, it.type, it.title, it.status, it.priority, it.description, gitUrl, prUrl],
        );
        itemId = ins.rows[0].id;
        itemsInserted += 1;
      }

      // Tasks: so semeia se o item ainda nao tiver nenhuma (preserva edicoes manuais).
      const has = await query('SELECT 1 FROM tasks WHERE item_id=$1 LIMIT 1', [itemId]);
      if (!has.rowCount && Array.isArray(it.tasks)) {
        let pos = 0;
        for (const t of it.tasks) {
          await query(
            `INSERT INTO tasks (item_id,title,status,position,started_at,completed_at)
             VALUES ($1,$2,$3::task_status,$4,
               CASE WHEN $3 IN ('in_progress','done') THEN now() END,
               CASE WHEN $3 = 'done' THEN now() END)`,
            [itemId, t.title, t.status, pos++],
          );
          tasksInserted += 1;
        }
      }
    }
  }

  const cms = [];
  try { cms.push(await seedCmsAnarabottini()); } catch (e) { console.warn('[seed] cms anarabottini ignorado:', e.message); }
  try { cms.push(await seedCmsRmambiental()); } catch (e) { console.warn('[seed] cms rmambiental ignorado:', e.message); }

  const out = { projects, itemsInserted, itemsUpdated, tasksInserted, cms };
  console.info('[seed]', JSON.stringify(out));
  return out;
}

if (process.argv[1] && import.meta.url === `file://${process.argv[1].replace(/\\/g, '/')}`) {
  seed().then(() => process.exit(0)).catch((e) => {
    console.error('[seed] falhou:', e);
    process.exit(1);
  });
}
