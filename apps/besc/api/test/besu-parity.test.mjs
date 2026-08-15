// Paridade do BesuAdapter (Fase 3): as MESMAS operacoes do LedgerPort que o dominio usa,
// exercidas contra um no Hyperledger Besu real. Pulado automaticamente se BESU_RPC_URL
// nao estiver setado (CI sem no). Prova que a troca simulado->besu nao muda a semantica:
// emissao credita supply/saldo; transferencia exige whitelist e move saldo; titulo
// congelado REJEITA transferencia; reativado volta a aceitar; substituicao queima+minta.
import test from 'node:test';
import assert from 'node:assert/strict';
import { BesuAdapter } from '../src/ledger/besu.js';

const RPC = process.env.BESU_RPC_URL;
const KEY = process.env.BESU_PRIVATE_KEY;

test('BesuAdapter — paridade semântica com o LedgerPort', { skip: !RPC || !KEY ? 'BESU_RPC_URL/BESU_PRIVATE_KEY ausentes' : false }, async () => {
  const contractAddress = await BesuAdapter.deploy({ rpcUrl: RPC, privateKey: KEY });
  const led = new BesuAdapter({ rpcUrl: RPC, privateKey: KEY, contractAddress, chainId: 'besu:dev' });

  const T1 = 'title-1-' + Date.now();
  const T3 = 'title-3-' + Date.now();
  const holder = 'sim:holder-1';

  // health
  const h = await led.health();
  assert.equal(h.ok, true, 'health ok');

  // emissao 1000 -> treasury
  const issue = await led.issueBatch({ titleId: T1, batchId: 'b1', toWallet: 'treasury', amount: 1000, faceValueCents: 1000, splitFactor: 100, issuanceDocHash: 'abc' });
  assert.equal(issue.status, 'confirmed');
  let state = await led.getTitleState({ titleId: T1 });
  assert.equal(state.totalSupply, 1000, 'supply = 1000');
  assert.equal(await led.getBalance({ titleId: T1, wallet: 'treasury' }), 1000, 'treasury 1000');

  // transferencia 200 treasury->holder (whitelist automatica)
  await led.transfer({ titleId: T1, fromWallet: 'treasury', toWallet: holder, amount: 200, transferKind: 'first', referenceHash: 'ref1' });
  assert.equal(await led.getBalance({ titleId: T1, wallet: 'treasury' }), 800, 'treasury 800');
  assert.equal(await led.getBalance({ titleId: T1, wallet: holder }), 200, 'holder 200');

  // congelar -> transferencia REJEITADA (mesma semantica do simulado)
  await led.freezeTitle({ titleId: T1, reasonCode: 'legal_status_suspended', evidenceHash: 'ev' });
  assert.equal((await led.getTitleState({ titleId: T1 })).paused, true, 'pausado');
  await assert.rejects(() => led.transfer({ titleId: T1, fromWallet: 'treasury', toWallet: holder, amount: 10, transferKind: 'secondary', referenceHash: 'r' }), /frozen|revert|paused/i, 'transferência em título congelado é rejeitada');

  // reativar -> volta a aceitar
  await led.unfreezeTitle({ titleId: T1, reasonCode: 'legal_status_reactivated', evidenceHash: 'ev2' });
  assert.equal((await led.getTitleState({ titleId: T1 })).paused, false, 'reativado');
  await led.transfer({ titleId: T1, fromWallet: 'treasury', toWallet: holder, amount: 50, transferKind: 'secondary', referenceHash: 'r2' });
  assert.equal(await led.getBalance({ titleId: T1, wallet: holder }), 250, 'holder 250 após reativação');

  // emitir no T3 e substituir (burn no T1 do holder + mint no T3)
  await led.issueBatch({ titleId: T3, batchId: 'b3', toWallet: 'treasury', amount: 1000, faceValueCents: 1250, splitFactor: 100, issuanceDocHash: 'def' });
  await led.substitute({ fromTitleId: T1, toTitleId: T3, allocations: [{ wallet: holder, amount: 160 }], substitutionDocHash: 'sub1' });
  assert.equal(await led.getBalance({ titleId: T3, wallet: holder }), 160, 'holder recebe 160 no T3');

  // ancoragem da trilha
  const anchor = await led.anchorAuditRoot({ merkleRoot: 'root', fromEventId: 1, toEventId: 100 });
  assert.equal(anchor.status, 'confirmed', 'anchor confirmado');
});
