// BesuAdapter — implementa o MESMO LedgerPort do SimulatedLedgerAdapter, agora contra
// uma rede Hyperledger Besu permissionada (QBFT) via ethers v6 (docs/evolution/05, Fase 3).
// A troca simulado<->besu e por config (LEDGER_ADAPTER); o dominio NAO muda.
// Chaves NUNCA no git — a private key da hot wallet vem de env (Sealed Secret).
import { ethers } from 'ethers';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ARTIFACT = JSON.parse(readFileSync(
  path.join(path.dirname(fileURLToPath(import.meta.url)), 'contracts', 'TitleRegistry.json'), 'utf8'));

// ids opacos do dominio (UUID/strings) -> bytes32 deterministico (keccak); enderecos
// deterministicos por wallet logico (sim:<uuid>) para nao exigir carteira on-chain real
const toB32 = (s) => ethers.keccak256(ethers.toUtf8Bytes(String(s)));
const hashToB32 = (hex) => (hex && /^[0-9a-f]{64}$/i.test(hex) ? '0x' + hex : ethers.keccak256(ethers.toUtf8Bytes(String(hex || ''))));
// endereco deterministico p/ um wallet logico (treasury / sim:<uuid>)
const addrOf = (w) => ethers.getAddress('0x' + ethers.keccak256(ethers.toUtf8Bytes('besc-wallet:' + w)).slice(26));

export class BesuAdapter {
  constructor({ rpcUrl, privateKey, contractAddress, chainId }) {
    this.provider = new ethers.JsonRpcProvider(rpcUrl);
    this.signer = new ethers.Wallet(privateKey, this.provider);
    this.chainId = chainId || 'besu';
    this.contract = new ethers.Contract(contractAddress, ARTIFACT.abi, this.signer);
    this._whitelisted = new Set();
    // serializa TODA escrita: nonce 'latest' fresco por tx + aguarda confirmacao antes da
    // proxima. Evita colisao de nonce sem NonceManager (que dessincroniza em reverts
    // esperados, ex.: transferir titulo congelado). Reverts nao consomem nonce (falham no
    // estimateGas antes do envio), entao o proximo write pega o nonce correto.
    this._queue = Promise.resolve();
  }

  // enfileira uma escrita: chama contract[method](...args, {nonce}) e aguarda 1 bloco
  _write(method, args) {
    const run = async () => {
      // retry em corrida transitoria de nonce (nós de mineracao instantanea, ex.: geth --dev):
      // re-busca o nonce e reenvia. Reverts de negocio NAO sao nonce e propagam de imediato.
      let lastErr;
      for (let attempt = 0; attempt < 5; attempt++) {
        try {
          const nonce = await this.provider.getTransactionCount(this.signer.address, 'pending');
          const tx = await this.contract[method](...args, { nonce });
          const receipt = await tx.wait(1);
          return { txHash: receipt.hash, chainId: this.chainId, blockNumber: receipt.blockNumber, status: receipt.status === 1 ? 'confirmed' : 'failed' };
        } catch (e) {
          const nonceRace = e.code === 'NONCE_EXPIRED' || /nonce (too low|has already been used)/i.test(e.message || '');
          if (!nonceRace) throw e;
          lastErr = e;
          await new Promise((r) => setTimeout(r, 100 * (attempt + 1)));
        }
      }
      throw lastErr;
    };
    // encadeia mesmo apos falha (revert esperado) para nao travar a fila
    const p = this._queue.then(run, run);
    this._queue = p.catch(() => {});
    return p;
  }

  // deploy do contrato (uma vez por ambiente) — usado pelo bootstrap/CI, nao no request path
  static async deploy({ rpcUrl, privateKey }) {
    const provider = new ethers.JsonRpcProvider(rpcUrl);
    const wallet = new ethers.Wallet(privateKey, provider);
    const factory = new ethers.ContractFactory(ARTIFACT.abi, ARTIFACT.bytecode, wallet);
    const c = await factory.deploy();
    await c.waitForDeployment();
    return await c.getAddress();
  }

  // garante identidade whitelisted da carteira destino antes de transferir
  async _ensureWhitelisted(wallet) {
    const addr = addrOf(wallet);
    if (this._whitelisted.has(addr)) return addr;
    const already = await this.contract.whitelisted(addr);
    if (!already) await this._write('registerIdentity', [addr, toB32('kyc:' + wallet)]);
    this._whitelisted.add(addr);
    return addr;
  }

  async issueBatch({ titleId, batchId, toWallet, amount, faceValueCents, splitFactor, issuanceDocHash }) {
    const to = await this._ensureWhitelisted(toWallet || 'treasury');
    return this._write('issueBatch', [toB32(titleId), toB32(batchId), to, BigInt(amount), BigInt(faceValueCents || 0), Number(splitFactor || 1), hashToB32(issuanceDocHash)]);
  }

  async transfer({ titleId, fromWallet, toWallet, amount, transferKind, referenceHash }) {
    const from = addrOf(fromWallet || 'treasury');
    const to = await this._ensureWhitelisted(toWallet);
    const kind = transferKind === 'first' ? 1 : transferKind === 'forced' ? 3 : 2;
    return this._write('transfer', [toB32(titleId), from, to, BigInt(amount), kind, hashToB32(referenceHash)]);
  }

  async freezeTitle({ titleId, reasonCode, evidenceHash }) {
    const code = reasonCode === 'legal_status_denied' ? 2 : reasonCode === 'compliance_hold' ? 3 : 1;
    return this._write('freezeTitle', [toB32(titleId), code, hashToB32(evidenceHash)]);
  }

  async unfreezeTitle({ titleId, reasonCode, evidenceHash }) {
    return this._write('unfreezeTitle', [toB32(titleId), 1, hashToB32(evidenceHash)]);
  }

  async substitute({ fromTitleId, toTitleId, allocations, substitutionDocHash }) {
    // um holder por substituicao no dominio (§E.5); usa a 1a alocacao
    const a = (allocations && allocations[0]) || { wallet: 'treasury', amount: 0 };
    const holder = await this._ensureWhitelisted(a.wallet);
    // burn total = mint total (o dominio ja preserva o montante); aqui espelha o mint
    return this._write('substitute', [toB32(fromTitleId), toB32(toTitleId), holder, BigInt(a.amount), BigInt(a.amount), hashToB32(substitutionDocHash)]);
  }

  async registerIdentity({ partyId, wallet, claimsHash }) {
    const addr = addrOf(wallet || partyId);
    this._whitelisted.add(addr);
    return this._write('registerIdentity', [addr, hashToB32(claimsHash)]);
  }

  async revokeIdentity({ partyId, wallet, reasonCode }) {
    const addr = addrOf(wallet || partyId);
    this._whitelisted.delete(addr);
    return this._write('revokeIdentity', [addr, toB32(reasonCode || 'revoked')]);
  }

  async anchorAuditRoot({ merkleRoot, fromEventId, toEventId }) {
    return this._write('anchorAuditRoot', [hashToB32(merkleRoot), BigInt(fromEventId || 0), BigInt(toEventId || 0)]);
  }

  async getTitleState({ titleId }) {
    const [paused, supply] = await Promise.all([this.contract.paused(toB32(titleId)), this.contract.totalSupply(toB32(titleId))]);
    return { paused, totalSupply: Number(supply) };
  }

  async getBalance({ titleId, wallet }) {
    return Number(await this.contract.balanceOf(toB32(titleId), addrOf(wallet)));
  }

  async health() {
    try {
      const bn = await this.provider.getBlockNumber();
      return { adapter: 'besu', chainId: this.chainId, blockHeight: bn, ok: true };
    } catch (e) {
      return { adapter: 'besu', chainId: this.chainId, ok: false, error: e.message };
    }
  }
}
