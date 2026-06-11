// session.js — uma sessão de captura = um contexto Chromium EFÊMERO e ISOLADO.
// Lança o browser uma vez (singleton), e por sessão: newContext → page → CDP.
// Captura a rede (A3) via CDP Network (corpos por getResponseBody, redigidos na
// origem), cookies e screenshots. O screencast/input vivem em screencast.js.
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
import { redactObject, sanitizeHeaders, sanitizeCookies, redactBody } from './redaction.js';
import { insertEvent, insertSessionState, insertScreenshot, setSessionStatus } from './store.js';
import { attachScreencast } from './screencast.js';

const STORAGE_DIR = process.env.STORAGE_DIR || '/data/storage';
const MAX_BODY_INLINE = 64 * 1024; // corpos maiores vão ao PVC
const CAPTURED_RESOURCE_TYPES = new Set(['XHR', 'Fetch', 'Document']);

let browserPromise = null;
function getBrowser() {
  if (!browserPromise) {
    browserPromise = chromium.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-gpu'],
    });
  }
  return browserPromise;
}

function blobPath(sessionId, ...parts) {
  return path.join(STORAGE_DIR, 'portal-rec', sessionId, ...parts);
}
function ensureDir(p) { fs.mkdirSync(path.dirname(p), { recursive: true }); }

export class CaptureSession {
  constructor(sessionId, portal) {
    this.id = sessionId;
    this.portal = portal;
    this.seq = 0;
    this.startedAt = Date.now();
    this.frameSink = null;
    this.idleAt = Date.now();
    this.pending = new Map(); // requestId → meta (correlaciona request↔response)
    this.closed = false;
  }

  offset() { return Date.now() - this.startedAt; }
  touch() { this.idleAt = Date.now(); }

  async start() {
    const browser = await getBrowser();
    this.context = await browser.newContext({ viewport: { width: 1280, height: 800 }, ignoreHTTPSErrors: true });
    this.page = await this.context.newPage();
    this.cdp = await this.context.newCDPSession(this.page);
    await this.cdp.send('Network.enable');
    this._wireNetwork();
    this.screencast = await attachScreencast(this.cdp, (frame) => this.frameSink && this.frameSink(frame));
    await this.page.goto(this.portal.entry_url, { waitUntil: 'domcontentloaded', timeout: 60_000 }).catch((e) => {
      console.warn(`[session ${this.id}] goto falhou: ${e.message}`);
    });
    await setSessionStatus(this.id, 'running', { started: true });
    return this;
  }

  // Captura request/response que importam (XHR/Fetch/Document), redigidos.
  _wireNetwork() {
    this.cdp.on('Network.requestWillBeSent', (p) => {
      if (!CAPTURED_RESOURCE_TYPES.has(p.type)) return;
      this.pending.set(p.requestId, { request: p.request, type: p.type });
      this._recordRequest(p).catch(() => {});
    });
    this.cdp.on('Network.responseReceived', (p) => {
      const e = this.pending.get(p.requestId);
      if (e) e.response = p.response;
    });
    this.cdp.on('Network.loadingFinished', (p) => {
      const e = this.pending.get(p.requestId);
      if (!e || !e.response) { this.pending.delete(p.requestId); return; }
      this._recordResponse(p.requestId, e).finally(() => this.pending.delete(p.requestId));
    });
  }

  _split(url) {
    try { const u = new URL(url); const q = {}; for (const [k, v] of u.searchParams) q[k] = v; return { host: u.host, path: u.pathname, query: q }; }
    catch { return { host: '', path: String(url), query: {} }; }
  }

  async _recordRequest(p) {
    const acc = { keys: [], hashes: {} };
    const { host, path: pth, query } = this._split(p.request.url);
    const reqHeaders = sanitizeHeaders(p.request.headers, acc);
    const { body } = redactBody(p.request.postData, acc);
    await insertEvent(this.id, {
      seq: this.seq++, tOffsetMs: this.offset(), phase: 'request',
      method: p.request.method, url: p.request.url, host, path: pth, query,
      resourceType: p.type, reqHeaders, reqBody: body,
      redactedKeys: acc.keys, secretHashes: acc.hashes,
    });
  }

  async _recordResponse(requestId, e) {
    const acc = { keys: [], hashes: {} };
    const { host, path: pth, query } = this._split(e.response.url);
    const respHeaders = sanitizeHeaders(e.response.headers, acc);
    let body = null; let blobRef = null; let truncated = false;
    try {
      const got = await this.cdp.send('Network.getResponseBody', { requestId });
      const raw = got.base64Encoded ? Buffer.from(got.body, 'base64') : got.body;
      if (got.base64Encoded || raw.length > MAX_BODY_INLINE) {
        // binário ou grande: vai ao PVC, não inline (e não tenta redigir binário)
        blobRef = blobPath(this.id, 'bodies', `${requestId}.bin`);
        ensureDir(blobRef);
        fs.writeFileSync(blobRef, got.base64Encoded ? Buffer.from(got.body, 'base64') : Buffer.from(raw));
        truncated = true;
      } else {
        const r = redactBody(raw, acc);
        body = r.body; truncated = r.truncated;
      }
    } catch { /* sem corpo (304, etc.) */ }
    await insertEvent(this.id, {
      seq: this.seq++, tOffsetMs: this.offset(), phase: 'response',
      method: e.request.method, url: e.response.url, host, path: pth, query,
      statusCode: e.response.status, resourceType: e.type,
      respHeaders, respBody: body, bodyBlobRef: blobRef, bodyTruncated: truncated,
      redactedKeys: acc.keys, secretHashes: acc.hashes,
    });
  }

  async flushCookies() {
    try {
      const cookies = await this.context.cookies();
      await insertSessionState(this.id, this.offset(), sanitizeCookies(cookies));
    } catch (e) { console.warn(`[session ${this.id}] cookies: ${e.message}`); }
  }

  async screenshot(caption, annotationId) {
    const ref = blobPath(this.id, 'shots', `${Date.now()}.png`);
    ensureDir(ref);
    const buf = await this.page.screenshot({ type: 'png' });
    fs.writeFileSync(ref, buf);
    return insertScreenshot(this.id, this.offset(), ref, { width: 1280, height: 800, caption, annotationId });
  }

  dispatchInput(msg) { this.touch(); return this.screencast?.dispatchInput(msg); }
  onFrame(sink) { this.frameSink = sink; this.touch(); }

  async stop(finalStatus = 'finalizing') {
    if (this.closed) return;
    this.closed = true;
    try { await this.screencast?.stop(); } catch { /* ignore */ }
    await this.flushCookies();
    try { await this.context?.close(); } catch { /* ignore */ }
    await setSessionStatus(this.id, finalStatus, { ended: true }).catch(() => {});
  }
}

// Gerencia o ciclo de vida das sessões (limite de concorrência + idle-TTL).
export class SessionManager {
  constructor({ maxConcurrent = Number(process.env.MAX_CONCURRENT_SESSIONS || 2), idleTtlMs = 10 * 60_000 } = {}) {
    this.sessions = new Map();
    this.maxConcurrent = maxConcurrent;
    this.idleTtlMs = idleTtlMs;
    this._sweep = setInterval(() => this._reapIdle(), 30_000);
    if (typeof this._sweep.unref === 'function') this._sweep.unref();
  }

  get(id) { return this.sessions.get(id); }

  async start(sessionId, portal) {
    if (this.sessions.has(sessionId)) return this.sessions.get(sessionId);
    if (this.sessions.size >= this.maxConcurrent) {
      const err = new Error('max concurrent sessions reached');
      err.code = 'MAX_CONCURRENT';
      throw err;
    }
    const session = new CaptureSession(sessionId, portal);
    this.sessions.set(sessionId, session);
    try { await session.start(); } catch (e) { this.sessions.delete(sessionId); throw e; }
    return session;
  }

  async stop(sessionId, status) {
    const s = this.sessions.get(sessionId);
    if (!s) return false;
    await s.stop(status);
    this.sessions.delete(sessionId);
    return true;
  }

  async _reapIdle() {
    const now = Date.now();
    for (const [id, s] of this.sessions) {
      if (now - s.idleAt > this.idleTtlMs) {
        console.log(`[session ${id}] idle TTL — encerrando`);
        await this.stop(id, 'finalizing').catch(() => {});
      }
    }
  }
}
