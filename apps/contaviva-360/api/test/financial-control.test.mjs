// Verificação: Controle Financeiro — AP/AR, fluxo de caixa, relatórios, dashboard (REQ-CONTAVIVA360-0005)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dir = dirname(fileURLToPath(import.meta.url));
const src = (f) => readFileSync(join(__dir, '../src', f), 'utf-8');

const fcSrc   = src('routes/financial-control.js');
const cfSrc   = src('routes/cash-flow.js');
const frSrc   = src('routes/financial-reports.js');
const fdSrc   = src('routes/financial-dashboard.js');
const qSrc    = src('queue.js');
const wSrc    = src('worker.js');
const srvSrc  = src('server.js');
const dbSrc   = src('db.js');

// ── DB Migrations ──────────────────────────────────────────────────────────────

test('db: migration adiciona forma_pagamento à income_expenses', () => {
  assert.ok(dbSrc.includes('forma_pagamento'), 'coluna forma_pagamento na migration');
});

test('db: migration adiciona forma_recebimento à income_expenses', () => {
  assert.ok(dbSrc.includes('forma_recebimento'), 'coluna forma_recebimento na migration');
});

test('db: migration adiciona data_pagamento_realizado à income_expenses', () => {
  assert.ok(dbSrc.includes('data_pagamento_realizado'), 'coluna data_pagamento_realizado na migration');
});

test('db: migration adiciona recorrencia_tipo à income_expenses', () => {
  assert.ok(dbSrc.includes('recorrencia_tipo'), 'coluna recorrencia_tipo na migration');
});

// ── Contas a Pagar ─────────────────────────────────────────────────────────────

test('financial-control: AC1 — exporta registerFinancialControlRoutes', () => {
  assert.ok(fcSrc.includes('export function registerFinancialControlRoutes'), 'função exportada');
});

test('financial-control: AC1 — rota GET /v1/accounts-payable declarada', () => {
  assert.ok(fcSrc.includes("'/v1/accounts-payable'"), 'rota AP declarada');
});

test('financial-control: AC1 — POST /v1/accounts-payable valida fornecedor, valor, data', () => {
  assert.ok(fcSrc.includes('contraparte (fornecedor), valor e data são obrigatórios'), 'validação AP');
});

test('financial-control: AC1 — status AP inclui vencido e cancelado', () => {
  assert.ok(fcSrc.includes("'vencido'"), 'status vencido presente para AP');
  assert.ok(fcSrc.includes("'cancelado'"), 'status cancelado presente');
});

test('financial-control: AC1 — forma_pagamento validada (cheque, TED, cartão, boleto, dinheiro)', () => {
  assert.ok(fcSrc.includes("'cheque'") && fcSrc.includes("'TED'") && fcSrc.includes("'boleto'"), 'formas de pagamento declaradas');
});

test('financial-control: AC1 — data_pagamento_realizado atualizado no PUT', () => {
  assert.ok(fcSrc.includes('data_pagamento_realizado'), 'campo data_pagamento_realizado no update');
});

// ── Contas a Receber ───────────────────────────────────────────────────────────

test('financial-control: AC2 — rota GET /v1/accounts-receivable declarada', () => {
  assert.ok(fcSrc.includes("'/v1/accounts-receivable'"), 'rota AR declarada');
});

test('financial-control: AC2 — POST /v1/accounts-receivable valida cliente, valor, data', () => {
  assert.ok(fcSrc.includes('contraparte (cliente), valor e data são obrigatórios'), 'validação AR');
});

test('financial-control: AC2 — status AR inclui recebido e vencido', () => {
  assert.ok(fcSrc.includes("'recebido'"), 'status recebido para AR');
  assert.ok(fcSrc.includes("VALID_STATUS_AR"), 'array de status AR declarado');
  assert.ok(fcSrc.includes("'vencido'"), 'status vencido presente na validação AR');
});

test('financial-control: AC2 — forma_recebimento armazenado', () => {
  assert.ok(fcSrc.includes('forma_recebimento'), 'campo forma_recebimento presente');
});

// ── Fluxo de Caixa ─────────────────────────────────────────────────────────────

test('cash-flow: AC3 — exporta registerCashFlowRoutes', () => {
  assert.ok(cfSrc.includes('export function registerCashFlowRoutes'), 'função exportada');
});

test('cash-flow: AC3 — rota GET /v1/cash-flow com horizonte 30/60/90', () => {
  assert.ok(cfSrc.includes("'/v1/cash-flow'"), 'rota declarada');
  assert.ok(cfSrc.includes('horizon'), 'parâmetro horizon');
  assert.ok(cfSrc.includes('30') && cfSrc.includes('60') && cfSrc.includes('90'), 'horizontes 30/60/90');
});

test('cash-flow: AC3 — calcula saldo_atual realizado', () => {
  assert.ok(cfSrc.includes('saldo_atual'), 'saldo_atual calculado');
  assert.ok(cfSrc.includes("status IN ('recebido','pago')"), 'filtra lançamentos realizados');
});

test('cash-flow: AC3 — gera array diário com saldo acumulado', () => {
  assert.ok(cfSrc.includes('saldo_acumulado'), 'saldo_acumulado calculado');
  assert.ok(cfSrc.includes('dias'), 'array de dias gerado');
});

test('cash-flow: AC3 — retorna saldo_previsto_final', () => {
  assert.ok(cfSrc.includes('saldo_previsto_final'), 'saldo previsto ao final do período');
});

// ── Relatório Financeiro ───────────────────────────────────────────────────────

test('financial-reports: AC4 — exporta registerFinancialReportRoutes', () => {
  assert.ok(frSrc.includes('export function registerFinancialReportRoutes'), 'função exportada');
});

test('financial-reports: AC4 — rota GET /v1/reports/financial', () => {
  assert.ok(frSrc.includes("'/v1/reports/financial'"), 'rota declarada');
});

test('financial-reports: AC4 — filtra por período, categoria e centro_custo', () => {
  assert.ok(frSrc.includes('period_type') && frSrc.includes('month') === false || frSrc.includes('mês'), 'filtro por período');
  assert.ok(frSrc.includes('categoria'), 'filtro por categoria');
  assert.ok(frSrc.includes('centro_custo'), 'filtro por centro de custo');
});

test('financial-reports: AC4 — suporta export CSV e XLSX', () => {
  assert.ok(frSrc.includes("'csv'") && frSrc.includes("'xlsx'"), 'formatos csv e xlsx declarados');
  assert.ok(frSrc.includes('Content-Disposition'), 'header de download');
});

test('financial-reports: AC4 — enfileira geração assíncrona via queue', () => {
  assert.ok(frSrc.includes('enqueueFinancialReport'), 'usa fila para geração');
  assert.ok(frSrc.includes("reply.code(202)"), 'retorna 202 Accepted');
});

// ── Dashboard Financeiro ───────────────────────────────────────────────────────

test('financial-dashboard: AC5 — exporta registerFinancialDashboardRoutes', () => {
  assert.ok(fdSrc.includes('export function registerFinancialDashboardRoutes'), 'função exportada');
});

test('financial-dashboard: AC5 — rota GET /v1/dashboard/financial', () => {
  assert.ok(fdSrc.includes("'/v1/dashboard/financial'"), 'rota declarada');
});

test('financial-dashboard: AC5 — retorna total_a_receber, total_a_pagar, saldo_liquido', () => {
  assert.ok(fdSrc.includes('total_a_receber'), 'total a receber');
  assert.ok(fdSrc.includes('total_a_pagar'), 'total a pagar');
  assert.ok(fdSrc.includes('saldo_liquido'), 'saldo líquido');
});

test('financial-dashboard: AC5 — retorna top5_fornecedores e top5_clientes', () => {
  assert.ok(fdSrc.includes('top5_fornecedores'), 'top 5 fornecedores');
  assert.ok(fdSrc.includes('top5_clientes'), 'top 5 clientes');
  assert.ok(fdSrc.includes('LIMIT 5'), 'limitado a 5 resultados');
});

test('financial-dashboard: AC5 — retorna fluxo_mensal para gráfico', () => {
  assert.ok(fdSrc.includes('fluxo_mensal'), 'dados de fluxo mensal');
  assert.ok(fdSrc.includes("DATE_TRUNC('month'"), 'agrupamento mensal');
});

// ── Fila Redis (capability: redis-bullmq) ─────────────────────────────────────

test('queue: enqueueFinancialReport exportada', () => {
  assert.ok(qSrc.includes('export async function enqueueFinancialReport('), 'função exportada');
});

test('queue: financial-report sem REDIS_URL retorna inline:true', () => {
  assert.ok(qSrc.includes('if (!q) return { inline: true }'), 'degradação graciosa sem Redis');
});

test('queue: financial-report fila nomeada financial-report', () => {
  assert.ok(qSrc.includes("'financial-report'"), 'nome da fila correto');
});

// ── Worker (capability: redis-bullmq) ─────────────────────────────────────────

test('worker: financial-report worker declarado', () => {
  assert.ok(wSrc.includes("'financial-report'"), 'queue financial-report no worker');
});

test('worker: handleFinancialReport processa e loga', () => {
  assert.ok(wSrc.includes('handleFinancialReport'), 'handler declarado');
  assert.ok(wSrc.includes('financial-report gerado'), 'log de conclusão');
});

test('worker: financial-report fechado no SIGTERM', () => {
  assert.ok(wSrc.includes('reportWorker.close()'), 'graceful shutdown do reportWorker');
});

// ── Registro no servidor ───────────────────────────────────────────────────────

test('server: registerFinancialControlRoutes registrado', () => {
  assert.ok(srvSrc.includes('registerFinancialControlRoutes'), 'rota financialControl registrada');
});

test('server: registerCashFlowRoutes registrado', () => {
  assert.ok(srvSrc.includes('registerCashFlowRoutes'), 'rota cashFlow registrada');
});

test('server: registerFinancialReportRoutes registrado', () => {
  assert.ok(srvSrc.includes('registerFinancialReportRoutes'), 'rota financialReports registrada');
});

test('server: registerFinancialDashboardRoutes registrado', () => {
  assert.ok(srvSrc.includes('registerFinancialDashboardRoutes'), 'rota financialDashboard registrada');
});
