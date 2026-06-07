/**
 * Registry de ações operacionais do Centro Operacional SICAT.
 *
 * Este registry é puramente declarativo (sem IA) e serve como base estrutural
 * para um futuro Command Center conversacional. Cada comando descreve:
 *  - id: identificador estável.
 *  - title: rótulo curto exibido no command palette.
 *  - description: explicação operacional.
 *  - keywords: termos para busca.
 *  - resolve(router, ctx): função que executa a navegação/ação.
 */

function go(router, path, query = {}) {
  return router.push({ path, query });
}

export function buildCommandRegistry({ router } = {}) {
  if (!router) {
    throw new Error('commandRegistry requer um router Vue.');
  }

  return [
    {
      id: 'jobs.failed',
      title: 'Ver jobs com erro',
      description: 'Abre o console de jobs filtrado por status falhos (failed, dlq, cancelled).',
      keywords: ['jobs', 'erro', 'falha', 'dlq', 'failed'],
      resolve: () => go(router, '/sistema/jobs', { status: 'failed' })
    },
    {
      id: 'jobs.dlq',
      title: 'Ver jobs em DLQ',
      description: 'Abre o console de jobs com itens parados em fila morta para inspeção.',
      keywords: ['dlq', 'fila', 'morta', 'jobs', 'reprocessar'],
      resolve: () => go(router, '/sistema/jobs', { status: 'dlq' })
    },
    {
      id: 'audit.byCorrelation',
      title: 'Abrir auditoria por correlationId',
      description: 'Abre o explorer de auditoria com um campo focado para colar o correlationId.',
      keywords: ['auditoria', 'correlation', 'trail', 'rastreio'],
      resolve: (_router, ctx) => {
        const correlationId = String(ctx?.correlationId || '').trim();
        return correlationId
          ? router.push({ path: `/operacao/auditoria/${correlationId}` })
          : router.push('/operacao/auditoria');
      }
    },
    {
      id: 'reports.mtr',
      title: 'Abrir relatório de MTRs',
      description: 'Pesquisa paginada com export CSV (limite 5.000 linhas).',
      keywords: ['relatorio', 'mtr', 'manifesto', 'csv', 'export'],
      resolve: () => go(router, '/operacao/relatorios/mtr')
    },
    {
      id: 'cetesb.health',
      title: 'Verificar saúde CETESB',
      description: 'Visão derivada localmente da saúde de contas e sessões CETESB.',
      keywords: ['cetesb', 'saude', 'health', 'contas', 'sessao'],
      resolve: () => go(router, '/operacao/cetesb-health')
    },
    {
      id: 'dashboard.overview',
      title: 'Abrir visão geral operacional',
      description: 'KPIs de jobs, manifestos, contas e sessões.',
      keywords: ['dashboard', 'visao', 'kpi', 'overview'],
      resolve: () => go(router, '/operacao/dashboard')
    },
    {
      id: 'cdf.list',
      title: 'Listar CDFs emitidos',
      description: 'Abre o console de jobs filtrando operação cdf.generate.',
      keywords: ['cdf', 'certificado', 'destinacao'],
      resolve: () => go(router, '/sistema/jobs', { operation: 'cdf.generate' })
    }
  ];
}
