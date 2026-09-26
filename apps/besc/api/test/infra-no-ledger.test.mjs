// ADR-010 (hardening P0): nenhum nó blockchain no deployment ativo e nenhuma variável de ledger
// necessária para o boot. Lê os manifestos reais que o Argo sincroniza (apps/besc/k8s via
// platform/argocd/apps/besc.yaml) e o código de boot.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, existsSync } from 'node:fs';

const APP = new URL('../../', import.meta.url);          // apps/besc/
const REPO = new URL('../../../../', import.meta.url);   // raiz do monorepo
const read = (u) => readFileSync(u, 'utf8');
const k8s = new URL('k8s/', APP);

export function activeManifests() {
  const kust = read(new URL('kustomization.yaml', k8s));
  const resources = [];
  let inResources = false;
  for (const line of kust.split(/\r?\n/)) {
    if (/^resources:\s*$/.test(line)) { inResources = true; continue; }
    if (inResources && /^\S/.test(line)) inResources = false;
    const m = inResources && /^\s*-\s*(\S+)/.exec(line);
    if (m) resources.push(m[1]);
  }
  return resources;
}

test('Argo sincroniza apps/besc/k8s e o kustomization não inclui Besu', () => {
  const argo = read(new URL('platform/argocd/apps/besc.yaml', REPO));
  assert.match(argo, /path:\s*apps\/besc\/k8s\s*$/m);
  const res = activeManifests();
  assert.ok(res.includes('besc.yaml') && res.includes('postgres.yaml'), res.join(','));
  assert.ok(!res.some((r) => /besu|ledger/i.test(r)), `recurso de ledger ativo: ${res.join(',')}`);
});

test('nenhum manifesto ativo menciona Besu nem define LEDGER_*/BESU_*', () => {
  for (const r of activeManifests()) {
    const body = read(new URL(r, k8s));
    const live = body.split(/\r?\n/).filter((l) => !/^\s*#/.test(l)).join('\n');
    assert.ok(!/besu/i.test(live), `${r} referencia Besu`);
    assert.ok(!/\b(LEDGER|BESU)_[A-Z_]+/.test(live), `${r} define variável de ledger`);
  }
  // Nenhum .yaml aplicável fora do kustomization: o arquivo histórico não pode ter extensão .yaml.
  assert.ok(existsSync(new URL('deprecated/besu.yaml.archived', k8s)), 'manifesto histórico preservado');
  for (const f of readdirSync(new URL('deprecated/', k8s))) assert.ok(!/\.ya?ml$/.test(f), `deprecated/${f} seria aplicável`);
});

test('boot não importa o adaptador Besu e ignora LEDGER_*/BESU_*', async () => {
  for (const f of ['src/server.js', 'src/app.js', 'src/marketplace/index.js', 'src/config.js']) {
    const code = read(new URL(`api/${f}`, APP)).split(/\r?\n/).filter((l) => !/^\s*\/\//.test(l)).join('\n');
    assert.ok(!/ledger\/besu\.js/.test(code), `${f} importa ledger/besu.js`);
  }
  const { config, legacyLedgerEnv } = await import('../src/config.js');
  for (const k of Object.keys(config)) assert.ok(!/ledger|besu/i.test(k), `config.${k}`);
  assert.deepEqual(legacyLedgerEnv({ LEDGER_ADAPTER: 'besu', BESU_RPC_URL: 'x', PORT: '1' }), ['BESU_RPC_URL', 'LEDGER_ADAPTER']);
});

test('script de deploy do contrato recusa execução', () => {
  const ps = read(new URL('scripts/besu-deploy-contract.ps1', REPO));
  assert.match(ps.split('\n').slice(0, 4).join('\n'), /^throw /m);
});

test('runtime fixado: Dockerfiles (API e build do frontend) = .nvmrc = engines', () => {
  for (const part of ['api', 'frontend']) {
    const nvmrc = read(new URL(`${part}/.nvmrc`, APP)).trim();
    assert.match(nvmrc, /^20\.\d+\.\d+$/, `${part}/.nvmrc`);
    const from = /^FROM node:(\S+?)-alpine/m.exec(read(new URL(`${part}/Dockerfile`, APP)));
    assert.ok(from, `${part}/Dockerfile sem FROM node:*-alpine`);
    assert.equal(from[1], nvmrc, `${part}: imagem ${from[1]} ≠ .nvmrc ${nvmrc}`);
    const pkg = JSON.parse(read(new URL(`${part}/package.json`, APP)));
    assert.equal(pkg.engines.node, `>=${nvmrc} <21`);
  }
});
