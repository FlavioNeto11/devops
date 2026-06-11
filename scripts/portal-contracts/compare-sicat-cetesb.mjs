#!/usr/bin/env node
// compare-sicat-cetesb.mjs — comparador read-only: contrato canônico do portal × mapa do consumidor.
//
// Lê o contrato (docs/portal-contracts/<portal>/<LATEST>/endpoints.jsonl) e o mapa declarativo do
// app consumidor (ex.: apps/sicat/backend/docs/portal-contracts/sicat-cetesb-endpoint-map.jsonl),
// valida os `anchors` do mapa contra o arquivo do gateway (mantém o mapa honesto), roda o diff PURO
// (lib/contract-diff.mjs) e emite drift-report.md (versionado) + JSON (artefato de CI).
//
// Genérico: parametrizável por --portal/--consumer/--map/--gateway/--fail-on.
//   defaults voltados ao par CETESB ↔ SICAT.
//
// --fail-on <severity>  exitCode=1 se houver achado >= severidade (default: critical)
// --no-write            não grava o drift-report.md versionado (só o JSON de artefato)

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { diffContractAgainstConsumer, hasFindingAtLeast } from './lib/contract-diff.mjs';

const ROOT = process.cwd();
const args = process.argv.slice(2);
const flag = (name, def = null) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : def; };

const portal = flag('--portal', 'cetesb');
const consumer = flag('--consumer', 'sicat');
const mapPath = flag('--map', 'apps/sicat/backend/docs/portal-contracts/sicat-cetesb-endpoint-map.jsonl');
const gatewayPath = flag('--gateway', 'apps/sicat/backend/src/gateways/cetesb-gateway.js');
const failOn = flag('--fail-on', 'critical');
const noWrite = args.includes('--no-write');

function readJsonl(filePath) {
  const records = [];
  const raw = fs.readFileSync(path.resolve(ROOT, filePath), 'utf8');
  raw.split(/\r?\n/).forEach((line, idx) => {
    const t = line.trim();
    if (!t) return;
    try { records.push(JSON.parse(t)); }
    catch (e) { throw new Error(`${filePath}:${idx + 1} JSON inválido: ${e.message}`); }
  });
  return records;
}

function resolveVersion(portalSlug) {
  const portalDir = path.join(ROOT, 'docs', 'portal-contracts', portalSlug);
  const version = fs.readFileSync(path.join(portalDir, 'LATEST'), 'utf8').trim();
  return { version, dir: path.join(portalDir, version) };
}

// 1) carregar contrato + mapa
const { version, dir: versionDir } = resolveVersion(portal);
const contractEndpoints = readJsonl(path.join('docs', 'portal-contracts', portal, version, 'endpoints.jsonl'));
const consumerMap = readJsonl(mapPath);

// 2) validar anchors do mapa contra o gateway (mantém o mapa sincronizado com o código real)
const anchorIssues = [];
if (fs.existsSync(path.resolve(ROOT, gatewayPath))) {
  const gatewaySrc = fs.readFileSync(path.resolve(ROOT, gatewayPath), 'utf8');
  for (const m of consumerMap) {
    for (const anchor of m.anchors || []) {
      if (!gatewaySrc.includes(anchor)) {
        anchorIssues.push({ severity: 'critical', code: 'ANCHOR_NOT_IN_GATEWAY', contractId: m.contract_id, message: `anchor "${anchor}" não existe em ${gatewayPath} — o mapa está dessincronizado do gateway.`, recommendation: `Atualizar o mapa ou o anchor de ${m.gateway_method}.` });
      }
    }
  }
} else {
  anchorIssues.push({ severity: 'warning', code: 'GATEWAY_NOT_FOUND', contractId: null, message: `gateway ${gatewayPath} não encontrado; anchors não verificados.`, recommendation: null });
}

// 3) diff puro
const { findings: diffFindings, summary } = diffContractAgainstConsumer(contractEndpoints, consumerMap);
const findings = [...anchorIssues, ...diffFindings];
for (const s of ['info', 'warning', 'high', 'error', 'critical']) summary[s] = findings.filter((f) => f.severity === s).length;
summary.total = findings.length;

// 4) relatório markdown (versionado) + JSON (artefato)
const generatedAt = new Date().toISOString();
const bySeverity = (sev) => findings.filter((f) => f.severity === sev);
const md = [
  '---',
  `title: "Drift report — ${consumer} × ${portal} (${version})"`,
  'status: reference',
  `applies_to: [${consumer}]`,
  `updated: ${generatedAt.slice(0, 10)}`,
  'language: pt-BR',
  '---',
  '',
  `# Drift report — ${consumer} × ${portal} (contrato ${version})`,
  '',
  `> Gerado em ${generatedAt}. Comparador read-only: o contrato é a verdade do portal real;`,
  `> o mapa declarativo (\`${mapPath}\`) descreve como o ${consumer} acessa cada endpoint hoje.`,
  `> Os \`anchors\` do mapa são validados contra \`${gatewayPath}\`.`,
  '',
  '## Resumo',
  '',
  `| severidade | qtd |`,
  `|---|---|`,
  ...['critical', 'error', 'high', 'warning', 'info'].map((s) => `| ${s} | ${summary[s] || 0} |`),
  '',
  ...(findings.length === 0 ? ['Sem achados — consumidor alinhado ao contrato.'] : ['## Achados', '']),
  ...['critical', 'error', 'high', 'warning', 'info'].flatMap((sev) => {
    const items = bySeverity(sev);
    if (!items.length) return [];
    return [`### ${sev} (${items.length})`, '', ...items.map((f) => `- **${f.contractId || '—'}** \`${f.code}\` — ${f.message}${f.recommendation ? `  \n  ↳ ${f.recommendation}` : ''}`), ''];
  }),
  '## Nota sobre o baseline',
  '',
  'Enquanto o contrato for um **seed derivado do gateway** (`generated_by: seed-from-gateway`), ele está',
  'alinhado ao SICAT por construção — drifts reais só aparecem quando uma **captura real** do',
  '`portal-recorder` substituir o seed e revelar como a CETESB de fato responde. Achados `info`/',
  '`low_confidence` aqui refletem isso.',
  '',
].join('\n');

if (!noWrite) fs.writeFileSync(path.join(versionDir, 'drift-report.md'), md);

const artifactsDir = path.join(ROOT, 'artifacts', 'portal-contracts');
fs.mkdirSync(artifactsDir, { recursive: true });
const stamp = generatedAt.replace(/[:.]/g, '-');
fs.writeFileSync(path.join(artifactsDir, `drift-${consumer}-${portal}-${stamp}.json`), `${JSON.stringify({ generatedAt, portal, consumer, version, summary, findings }, null, 2)}\n`);

// 5) gate
const blocking = hasFindingAtLeast(findings, failOn);
console.log(`Comparação ${consumer} × ${portal} (${version}): ${summary.total} achados (${summary.critical || 0} critical, ${summary.error || 0} error, ${summary.high || 0} high, ${summary.warning || 0} warning, ${summary.info || 0} info).`);
if (!noWrite) console.log(`drift-report.md atualizado em docs/portal-contracts/${portal}/${version}/`);
if (blocking) {
  console.error(`Há achados >= "${failOn}" — gate reprova.`);
  process.exitCode = 1;
}
