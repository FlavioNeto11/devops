// ai/tools.js — Tools R1 do assistente contábil (contaviva-360).
// Todas R1 (leitura/geração): consultam dados do usuário, calculam impostos, propõem rascunhos.
// Nenhuma persiste diretamente — mutações exigem confirmação explícita do usuário.
// authorize: por tenant (X-Tenant-Id/X-Role) injetado via toolContext.
import { createToolRegistry, AiToolError } from '@flavioneto11/ai-core';

const fmt = (n) => Number(n || 0).toFixed(2);
const authorize = (ctx) => ({
  allowed: Boolean(ctx && (ctx.tenantId != null || ctx.authenticated === true)),
  reason: ctx?.tenantId != null ? 'tenant autenticado' : 'requer contexto de tenant',
});

export function buildAccountingTools(pool) {
  return createToolRegistry([

    // --- consulta_dados: lê dados financeiros do usuário (PF/PJ) ---
    {
      name: 'consulta_dados',
      description: 'Consulta dados financeiros do usuário: receitas, despesas, patrimônio, obrigações fiscais, tarefas pendentes, fluxo de caixa. Use para responder "qual é meu saldo?", "quanto devo?", "quais impostos estão vencendo?".',
      specialist: 'contabil',
      risk: 'R1',
      mutates: false,
      parameters: {
        type: 'object',
        properties: {
          data_type: {
            type: 'string',
            enum: ['saldo_caixa', 'receitas_despesas', 'patrimonio_pf', 'obrigacoes_fiscais', 'tarefas', 'notas_fiscais'],
            description: 'Tipo de dado a consultar',
          },
          entity_type: { type: 'string', enum: ['PF', 'PJ'], description: 'Tipo de entidade (PF=Pessoa Física, PJ=Pessoa Jurídica)' },
          entity_id: { type: 'integer', description: 'ID da entidade (PF ou PJ)' },
          period_start: { type: 'string', description: 'Data início (YYYY-MM-DD)' },
          period_end: { type: 'string', description: 'Data fim (YYYY-MM-DD)' },
          limit: { type: 'integer', description: 'Máximo de registros (default 20)' },
        },
        required: ['data_type'],
      },
      authorize,
      execute: async (input, ctx) => {
        const tenantId = ctx.tenantId || 1;
        const limit = Math.min(Number(input.limit) || 20, 100);
        const pStart = input.period_start || null;
        const pEnd = input.period_end || null;
        const eId = input.entity_id ? Number(input.entity_id) : null;
        const eType = input.entity_type || null;

        switch (input.data_type) {
          case 'saldo_caixa': {
            // Saldo = receitas pagas - despesas pagas (mês atual se sem período)
            const start = pStart || new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().slice(0, 10);
            const end = pEnd || new Date().toISOString().slice(0, 10);
            const params = [tenantId, start, end];
            let sql = `SELECT tipo, SUM(valor)::numeric AS total FROM income_expenses
                       WHERE tenant_id=$1 AND data BETWEEN $2 AND $3 AND status='pago'`;
            if (eType) { sql += ` AND entity_type=$${params.length + 1}`; params.push(eType); }
            if (eId)   { sql += ` AND entity_id=$${params.length + 1}`; params.push(eId); }
            sql += ' GROUP BY tipo';
            const { rows } = await pool.query(sql, params);
            const receitas = Number(rows.find((r) => r.tipo === 'receita')?.total || 0);
            const despesas = Number(rows.find((r) => r.tipo === 'despesa')?.total || 0);
            return { data_type: 'saldo_caixa', periodo: { inicio: start, fim: end }, receitas_pagas: fmt(receitas), despesas_pagas: fmt(despesas), saldo: fmt(receitas - despesas), entity_type: eType, entity_id: eId };
          }

          case 'receitas_despesas': {
            const params = [tenantId];
            let sql = 'SELECT id, tipo, categoria, descricao, valor, data, status, contraparte FROM income_expenses WHERE tenant_id=$1';
            if (pStart) { sql += ` AND data >= $${params.length + 1}`; params.push(pStart); }
            if (pEnd)   { sql += ` AND data <= $${params.length + 1}`; params.push(pEnd); }
            if (eType)  { sql += ` AND entity_type=$${params.length + 1}`; params.push(eType); }
            if (eId)    { sql += ` AND entity_id=$${params.length + 1}`; params.push(eId); }
            sql += ` ORDER BY data DESC LIMIT $${params.length + 1}`; params.push(limit);
            const { rows } = await pool.query(sql, params);
            return { data_type: 'receitas_despesas', count: rows.length, records: rows.map((r) => ({ id: r.id, tipo: r.tipo, categoria: r.categoria, descricao: r.descricao, valor: fmt(r.valor), data: r.data?.toISOString?.()?.slice(0, 10) || r.data, status: r.status, contraparte: r.contraparte })) };
          }

          case 'patrimonio_pf': {
            const pfId = eId;
            if (!pfId) return { error: 'entity_id obrigatório para patrimônio PF' };
            const [pf, assets, liabs] = await Promise.all([
              pool.query('SELECT id, nome, cpf, patrimonio_inicial FROM physical_persons WHERE tenant_id=$1 AND id=$2', [tenantId, pfId]),
              pool.query('SELECT tipo, descricao, valor FROM pf_assets WHERE tenant_id=$1 AND pf_id=$2', [tenantId, pfId]),
              pool.query('SELECT tipo, descricao, valor FROM pf_liabilities WHERE tenant_id=$1 AND pf_id=$2', [tenantId, pfId]),
            ]);
            if (!pf.rows[0]) return { error: 'PF não encontrada', entity_id: pfId };
            const totalAtivos = assets.rows.reduce((s, r) => s + Number(r.valor), 0);
            const totalPassivos = liabs.rows.reduce((s, r) => s + Number(r.valor), 0);
            return { data_type: 'patrimonio_pf', pf: { id: pf.rows[0].id, nome: pf.rows[0].nome }, ativos: assets.rows.map((r) => ({ ...r, valor: fmt(r.valor) })), passivos: liabs.rows.map((r) => ({ ...r, valor: fmt(r.valor) })), total_ativos: fmt(totalAtivos), total_passivos: fmt(totalPassivos), patrimonio_liquido: fmt(totalAtivos - totalPassivos) };
          }

          case 'obrigacoes_fiscais': {
            const params = [tenantId];
            let sql = 'SELECT id, tipo, data_vencimento, periodicidade, status, descricao, valor_estimado, entidade_tipo, entidade_id FROM fiscal_obligations WHERE tenant_id=$1';
            if (pStart) { sql += ` AND data_vencimento >= $${params.length + 1}`; params.push(pStart); }
            if (pEnd)   { sql += ` AND data_vencimento <= $${params.length + 1}`; params.push(pEnd); }
            if (eId)    { sql += ` AND entidade_id=$${params.length + 1}`; params.push(eId); }
            sql += " AND status IN ('pendente','atrasado') ORDER BY data_vencimento ASC";
            sql += ` LIMIT $${params.length + 1}`; params.push(limit);
            const { rows } = await pool.query(sql, params);
            return { data_type: 'obrigacoes_fiscais', count: rows.length, obrigacoes: rows.map((r) => ({ id: r.id, tipo: r.tipo, vencimento: r.data_vencimento?.toISOString?.()?.slice(0, 10) || r.data_vencimento, status: r.status, descricao: r.descricao, valor_estimado: r.valor_estimado ? fmt(r.valor_estimado) : null })) };
          }

          case 'tarefas': {
            const params = [tenantId];
            let sql = "SELECT id, title, assignee, due_at, priority, status FROM tasks WHERE tenant_id=$1 AND status NOT IN ('concluida','cancelada')";
            if (eType) { sql += ` AND entity_type=$${params.length + 1}`; params.push(eType); }
            if (eId)   { sql += ` AND entity_id=$${params.length + 1}`; params.push(eId); }
            sql += ` ORDER BY due_at ASC NULLS LAST LIMIT $${params.length + 1}`; params.push(limit);
            const { rows } = await pool.query(sql, params);
            return { data_type: 'tarefas', count: rows.length, tarefas: rows.map((r) => ({ id: r.id, titulo: r.title, responsavel: r.assignee, prazo: r.due_at?.toISOString?.()?.slice(0, 10) || r.due_at, prioridade: r.priority, status: r.status })) };
          }

          case 'notas_fiscais': {
            const params = [tenantId];
            let sql = 'SELECT id, numero_nf, status, data_emissao, total_nf, destinatario_razao_social FROM notas_fiscais WHERE tenant_id=$1';
            if (pStart) { sql += ` AND data_emissao >= $${params.length + 1}`; params.push(pStart); }
            if (pEnd)   { sql += ` AND data_emissao <= $${params.length + 1}`; params.push(pEnd); }
            sql += ` ORDER BY data_emissao DESC LIMIT $${params.length + 1}`; params.push(limit);
            const { rows } = await pool.query(sql, params);
            return { data_type: 'notas_fiscais', count: rows.length, notas: rows.map((r) => ({ id: r.id, numero: r.numero_nf, status: r.status, data_emissao: r.data_emissao?.toISOString?.()?.slice(0, 10) || r.data_emissao, total: fmt(r.total_nf), destinatario: r.destinatario_razao_social })) };
          }

          default:
            return { error: `data_type desconhecido: ${input.data_type}` };
        }
      },
    },

    // --- calcula_impostos: estimativa de impostos (IRPF, IRPJ, ICMS, ISS) --
    {
      name: 'calcula_impostos',
      description: 'Calcula estimativa de impostos com base nos dados do usuário. Suporta IRPF (tabela progressiva), IRPJ (Lucro Presumido/Simples), ISS e ICMS (alíquotas médias). Os valores são estimativas; consulte um contador para valores definitivos.',
      specialist: 'contabil',
      risk: 'R1',
      mutates: false,
      parameters: {
        type: 'object',
        properties: {
          imposto_tipo: { type: 'string', enum: ['IRPF', 'IRPJ', 'ICMS', 'ISS', 'Simples_DAS'], description: 'Tipo de imposto a calcular' },
          entity_type: { type: 'string', enum: ['PF', 'PJ'] },
          entity_id: { type: 'integer' },
          ano: { type: 'integer', description: 'Ano de competência (default: ano atual)' },
          regime_tributario: { type: 'string', enum: ['simples', 'lucro_presumido', 'lucro_real'], description: 'Regime tributário para PJ' },
        },
        required: ['imposto_tipo'],
      },
      authorize,
      execute: async (input, ctx) => {
        const tenantId = ctx.tenantId || 1;
        const ano = Number(input.ano) || new Date().getFullYear();
        const eType = input.entity_type || 'PF';
        const eId = input.entity_id ? Number(input.entity_id) : null;

        // Busca receitas do ano
        const params = [tenantId, `${ano}-01-01`, `${ano}-12-31`];
        let sql = "SELECT tipo, SUM(valor)::numeric AS total FROM income_expenses WHERE tenant_id=$1 AND data BETWEEN $2 AND $3 AND status='pago'";
        if (eType) { sql += ` AND entity_type=$${params.length + 1}`; params.push(eType); }
        if (eId)   { sql += ` AND entity_id=$${params.length + 1}`; params.push(eId); }
        sql += ' GROUP BY tipo';
        const { rows } = await pool.query(sql, params);
        const receita = Number(rows.find((r) => r.tipo === 'receita')?.total || 0);
        const despesa = Number(rows.find((r) => r.tipo === 'despesa')?.total || 0);
        const lucro = receita - despesa;

        let resultado;
        switch (input.imposto_tipo) {
          case 'IRPF': {
            // Tabela IRPF 2024 simplificada (base anual)
            const tabela = [
              { ate: 24511.92, aliq: 0, deducao: 0 },
              { ate: 33919.80, aliq: 0.075, deducao: 1838.39 },
              { ate: 45012.60, aliq: 0.15, deducao: 4382.38 },
              { ate: 55976.16, aliq: 0.225, deducao: 7758.78 },
              { ate: Infinity, aliq: 0.275, deducao: 10557.13 },
            ];
            const base = Math.max(0, receita - despesa * 0.20); // 20% dedução simplificada
            const faixa = tabela.find((f) => base <= f.ate) || tabela[tabela.length - 1];
            const imposto = Math.max(0, base * faixa.aliq - faixa.deducao);
            resultado = { imposto_tipo: 'IRPF', ano, base_calculo: fmt(base), aliquota_efetiva: fmt((imposto / base) * 100) + '%', imposto_estimado: fmt(imposto), aviso: 'Estimativa com dedução simplificada de 20%. Consulte um contador.' };
            break;
          }
          case 'IRPJ': {
            const regime = input.regime_tributario || 'lucro_presumido';
            let imposto = 0;
            if (regime === 'simples') {
              const aliq = receita < 180000 ? 0.04 : receita < 360000 ? 0.073 : 0.094;
              imposto = receita * aliq;
              resultado = { imposto_tipo: 'IRPJ', regime: 'simples', ano, receita_bruta: fmt(receita), aliquota: fmt(aliq * 100) + '%', imposto_estimado: fmt(imposto) };
            } else if (regime === 'lucro_presumido') {
              const base = receita * 0.32; // presunção 32% para serviços
              imposto = base * 0.15 + Math.max(0, base - 240000) * 0.10;
              resultado = { imposto_tipo: 'IRPJ', regime: 'lucro_presumido', ano, receita_bruta: fmt(receita), base_presumida: fmt(base), imposto_estimado: fmt(imposto) };
            } else {
              imposto = Math.max(0, lucro) * 0.15 + Math.max(0, lucro - 240000) * 0.10;
              resultado = { imposto_tipo: 'IRPJ', regime: 'lucro_real', ano, lucro: fmt(lucro), imposto_estimado: fmt(imposto) };
            }
            break;
          }
          case 'ISS':
            resultado = { imposto_tipo: 'ISS', aviso: 'Alíquota ISS varia por município (2%–5%). Informe o município para cálculo preciso.', base_estimada: fmt(receita) };
            break;
          case 'ICMS':
            resultado = { imposto_tipo: 'ICMS', aviso: 'ICMS varia por estado e produto/serviço. Informe o estado e NCM para cálculo preciso.', base_estimada: fmt(receita) };
            break;
          case 'Simples_DAS': {
            const aliq = receita < 180000 ? 0.04 : receita < 360000 ? 0.073 : 0.094;
            resultado = { imposto_tipo: 'Simples_DAS', ano, receita_bruta: fmt(receita), aliquota: fmt(aliq * 100) + '%', das_mensal_estimado: fmt((receita / 12) * aliq) };
            break;
          }
          default:
            throw new AiToolError('INVALID_INPUT', `Imposto não suportado: ${input.imposto_tipo}`);
        }
        return { ...resultado, aviso_geral: 'Valores estimados. Consulte um contador para valores definitivos.' };
      },
    },

    // --- gera_rascunho: propõe um rascunho (NÃO persiste; exige confirmação) ---
    {
      name: 'gera_rascunho',
      description: 'Gera um rascunho de declaração, guia de pagamento ou análise contábil. O rascunho é uma PROPOSTA — não é salvo automaticamente. O usuário deve confirmar antes de persistir.',
      specialist: 'contabil',
      risk: 'R1',
      mutates: false,
      supportsDryRun: true,
      parameters: {
        type: 'object',
        properties: {
          tipo: {
            type: 'string',
            enum: ['declaracao_irpf', 'guia_pagamento', 'analise_contabil', 'relatorio_receitas_despesas'],
            description: 'Tipo de rascunho a gerar',
          },
          entity_type: { type: 'string', enum: ['PF', 'PJ'] },
          entity_id: { type: 'integer' },
          periodo: { type: 'string', description: 'Período de referência (ex.: "2024", "2024-01")' },
          dados_extras: { type: 'object', description: 'Dados adicionais para o rascunho (ex.: deduções, dependentes)' },
        },
        required: ['tipo'],
      },
      authorize,
      execute: async (input, ctx) => {
        const tenantId = ctx.tenantId || 1;
        const eType = input.entity_type || 'PF';
        const eId = input.entity_id ? Number(input.entity_id) : null;
        const periodo = input.periodo || String(new Date().getFullYear());
        const ano = parseInt(periodo) || new Date().getFullYear();
        const extras = input.dados_extras || {};

        // Busca dados base
        const params = [tenantId, `${ano}-01-01`, `${ano}-12-31`];
        let sql = "SELECT tipo, SUM(valor)::numeric AS total FROM income_expenses WHERE tenant_id=$1 AND data BETWEEN $2 AND $3 AND status='pago'";
        if (eType) { sql += ` AND entity_type=$${params.length + 1}`; params.push(eType); }
        if (eId)   { sql += ` AND entity_id=$${params.length + 1}`; params.push(eId); }
        sql += ' GROUP BY tipo';
        const { rows } = await pool.query(sql, params);
        const receita = Number(rows.find((r) => r.tipo === 'receita')?.total || 0);
        const despesa = Number(rows.find((r) => r.tipo === 'despesa')?.total || 0);

        let draft;
        switch (input.tipo) {
          case 'declaracao_irpf': {
            const deducoes = Number(extras.deducoes || 0);
            const dependentes = Number(extras.dependentes || 0);
            const deducaoDependente = dependentes * 2275.08; // 2024
            const baseCalc = Math.max(0, receita - despesa * 0.20 - deducoes - deducaoDependente);
            draft = {
              tipo: 'declaracao_irpf',
              titulo: `Rascunho Declaração IRPF ${ano}`,
              periodo,
              rendimento_tributavel: fmt(receita),
              deducoes_estimadas: fmt(despesa * 0.20 + deducoes + deducaoDependente),
              base_calculo: fmt(baseCalc),
              dependentes,
              campos_principais: { rendimento_tributavel: fmt(receita), deducoes_simplificadas: fmt(despesa * 0.20), deducoes_adicionais: fmt(deducoes), deducao_dependentes: fmt(deducaoDependente) },
              aviso: 'PROPOSTA NÃO SALVA. Confirme os dados e submeta para persistir o rascunho.',
              status: 'pendente_confirmacao',
            };
            break;
          }
          case 'guia_pagamento': {
            draft = {
              tipo: 'guia_pagamento',
              titulo: `Rascunho Guia de Pagamento ${periodo}`,
              periodo,
              valor_estimado: fmt(receita * 0.04), // DAS simplificado
              vencimento_sugerido: `${ano}-${periodo.length > 4 ? periodo.slice(5, 7) : '01'}-20`,
              descricao: 'Guia estimado baseado em receitas do período',
              aviso: 'PROPOSTA NÃO SALVA. Confirme e ajuste o valor antes de persistir.',
              status: 'pendente_confirmacao',
            };
            break;
          }
          case 'analise_contabil': {
            const margem = receita > 0 ? ((receita - despesa) / receita) * 100 : 0;
            draft = {
              tipo: 'analise_contabil',
              titulo: `Análise Contábil ${periodo}`,
              periodo,
              receita_total: fmt(receita),
              despesa_total: fmt(despesa),
              resultado: fmt(receita - despesa),
              margem_percentual: fmt(margem) + '%',
              situacao: receita > despesa ? 'superavit' : 'deficit',
              aviso: 'PROPOSTA NÃO SALVA. Confirme para persistir a análise.',
              status: 'pendente_confirmacao',
            };
            break;
          }
          case 'relatorio_receitas_despesas': {
            const { rows: detalhes } = await pool.query(
              `SELECT tipo, categoria, SUM(valor)::numeric AS total FROM income_expenses
               WHERE tenant_id=$1 AND data BETWEEN $2 AND $3 AND status='pago'
               ${eType ? ` AND entity_type=$4` : ''} GROUP BY tipo, categoria ORDER BY total DESC`,
              eType ? [tenantId, `${ano}-01-01`, `${ano}-12-31`, eType] : [tenantId, `${ano}-01-01`, `${ano}-12-31`],
            );
            draft = {
              tipo: 'relatorio_receitas_despesas',
              titulo: `Relatório Receitas e Despesas ${periodo}`,
              periodo,
              receita_total: fmt(receita),
              despesa_total: fmt(despesa),
              resultado: fmt(receita - despesa),
              por_categoria: detalhes.map((r) => ({ tipo: r.tipo, categoria: r.categoria || 'sem categoria', total: fmt(r.total) })),
              aviso: 'PROPOSTA NÃO SALVA. Confirme para persistir o relatório.',
              status: 'pendente_confirmacao',
            };
            break;
          }
          default:
            throw new AiToolError('INVALID_INPUT', `Tipo de rascunho não suportado: ${input.tipo}`);
        }

        // Gera um draft_id temporário para referência na confirmação
        const draftId = `draft-${input.tipo}-${Date.now()}`;
        return { draft_id: draftId, draft, _pendente_confirmacao: true };
      },
    },

    // --- cita_fonte: cita uma fonte de dado específica como evidência ---
    {
      name: 'cita_fonte',
      description: 'Cita uma fonte de dado específica (registro de receita/despesa, NF, obrigação, tarefa) para embasar uma afirmação. Use para grounding — sempre cite quando mencionar um valor ou data específica.',
      specialist: 'contabil',
      risk: 'R1',
      mutates: false,
      parameters: {
        type: 'object',
        properties: {
          source_type: {
            type: 'string',
            enum: ['income_expense', 'nota_fiscal', 'fiscal_obligation', 'task', 'pf_asset'],
            description: 'Tipo da fonte a citar',
          },
          source_id: { type: 'integer', description: 'ID do registro a citar' },
          descricao: { type: 'string', description: 'Descrição breve do que está sendo citado (para o texto da resposta)' },
        },
        required: ['source_type'],
      },
      authorize,
      execute: async (input, ctx) => {
        const tenantId = ctx.tenantId || 1;
        const id = input.source_id ? Number(input.source_id) : null;
        let record = null;

        if (id) {
          switch (input.source_type) {
            case 'income_expense': {
              const { rows } = await pool.query('SELECT id, tipo, categoria, descricao, valor, data, status FROM income_expenses WHERE tenant_id=$1 AND id=$2', [tenantId, id]);
              record = rows[0] ? { id: rows[0].id, tipo: rows[0].tipo, categoria: rows[0].categoria, descricao: rows[0].descricao, valor: fmt(rows[0].valor), data: rows[0].data?.toISOString?.()?.slice(0, 10), status: rows[0].status } : null;
              break;
            }
            case 'nota_fiscal': {
              const { rows } = await pool.query('SELECT id, numero_nf, data_emissao, total_nf, status, destinatario_razao_social FROM notas_fiscais WHERE tenant_id=$1 AND id=$2', [tenantId, id]);
              record = rows[0] ? { id: rows[0].id, numero: rows[0].numero_nf, data_emissao: rows[0].data_emissao?.toISOString?.()?.slice(0, 10), total: fmt(rows[0].total_nf), status: rows[0].status, destinatario: rows[0].destinatario_razao_social } : null;
              break;
            }
            case 'fiscal_obligation': {
              const { rows } = await pool.query('SELECT id, tipo, data_vencimento, status, valor_estimado, descricao FROM fiscal_obligations WHERE tenant_id=$1 AND id=$2', [tenantId, id]);
              record = rows[0] ? { id: rows[0].id, tipo: rows[0].tipo, vencimento: rows[0].data_vencimento?.toISOString?.()?.slice(0, 10), status: rows[0].status, valor: rows[0].valor_estimado ? fmt(rows[0].valor_estimado) : null, descricao: rows[0].descricao } : null;
              break;
            }
            case 'task': {
              const { rows } = await pool.query('SELECT id, title, due_at, priority, status FROM tasks WHERE tenant_id=$1 AND id=$2', [tenantId, id]);
              record = rows[0] ? { id: rows[0].id, titulo: rows[0].title, prazo: rows[0].due_at?.toISOString?.()?.slice(0, 10), prioridade: rows[0].priority, status: rows[0].status } : null;
              break;
            }
            case 'pf_asset': {
              const { rows } = await pool.query('SELECT id, tipo, descricao, valor FROM pf_assets WHERE tenant_id=$1 AND id=$2', [tenantId, id]);
              record = rows[0] ? { id: rows[0].id, tipo: rows[0].tipo, descricao: rows[0].descricao, valor: fmt(rows[0].valor) } : null;
              break;
            }
          }
        }

        return {
          source_type: input.source_type,
          source_id: id,
          descricao_citacao: input.descricao || null,
          record: record || (id ? { error: 'not_found', source_id: id } : null),
          citado: Boolean(record),
        };
      },
    },

  ]);
}
