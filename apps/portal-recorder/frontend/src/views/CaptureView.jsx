import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  getSession,
  stopSession,
  createAnnotation,
  listAnnotations,
  takeScreenshot,
  streamUrl,
} from '../api.js';
import { navigate } from '../router.js';

/**
 * CaptureView
 * -----------
 * Tela de captura (layout 2 colunas).
 *
 * ESQUERDA: um <canvas> conectado ao WS /portal-rec/stream?session=<id>. Cada
 * frame jpeg recebido e desenhado (new Image -> drawImage). Eventos de mouse/teclado
 * sobre o canvas sao enviados ao WS mapeando as coords do canvas para o VIEWPORT do
 * browser remoto (escala width_frame / width_canvas).
 *
 * DIREITA: painel de anotacao — "O que estou fazendo agora" (label) + "Marcar passo"
 * (POST annotations com start_offset_ms = agora - sessionStartMs) + "Print" (POST
 * screenshots). Lista os passos ja marcados nesta sessao.
 */
// Viewport fixo do browser remoto (casar com o newContext do recorder).
const VIEWPORT_W = 1280;
const VIEWPORT_H = 800;

// Reconexão automática do screencast (UX-PREC-005): teto de tentativas antes de
// deixar só o botão manual de "Reconectar" no overlay.
const MAX_AUTO_RETRIES = 5;

export default function CaptureView({ sessionId }) {
  const canvasRef = useRef(null);
  // Dimensoes do ultimo frame recebido (coords do viewport remoto).
  const frameSizeRef = useRef({ width: 0, height: 0 });
  const wsRef = useRef(null);
  // Marco temporal do inicio da sessao (para calcular start_offset_ms).
  const sessionStartRef = useRef(Date.now());

  const [session, setSession] = useState(null);
  const [wsStatus, setWsStatus] = useState('connecting'); // connecting|open|closed|error
  const [remoteStatus, setRemoteStatus] = useState({ status: '', url: '' });

  // Reconexão do screencast: `reconnectNonce` reexecuta o effect do WS; `retryAttempt`
  // e `exhausted` alimentam o feedback do overlay; refs guardam o backoff/timer.
  const [reconnectNonce, setReconnectNonce] = useState(0);
  const [retryAttempt, setRetryAttempt] = useState(0);
  const [exhausted, setExhausted] = useState(false);
  const retryTimerRef = useRef(0);
  const autoRetryRef = useRef(0);

  const [label, setLabel] = useState('');
  const [steps, setSteps] = useState([]);
  const [busyStep, setBusyStep] = useState(false);
  const [busyShot, setBusyShot] = useState(false);
  const [shotCount, setShotCount] = useState(0);
  const [busyStop, setBusyStop] = useState(false);
  const [actionErr, setActionErr] = useState(null);
  // UX-PREC-009: sessão inexistente (404) recebe estado dedicado, não o overlay
  // eterno de "Conectando…". Demais erros seguem fail-soft.
  const [notFound, setNotFound] = useState(false);

  // Carrega os metadados da sessao (titulo, started_at). started_at ancora o relogio.
  useEffect(() => {
    let alive = true;
    getSession(sessionId)
      .then((s) => {
        if (!alive) return;
        setSession(s);
        if (s && s.started_at) {
          const t = new Date(s.started_at).getTime();
          if (!Number.isNaN(t)) sessionStartRef.current = t;
        }
      })
      .catch((e) => {
        if (!alive) return;
        // 404 = sessão realmente inexistente (link velho / excluída): estado dedicado.
        // Erros transitórios seguem fail-soft (mantém started local).
        if (e && e.status === 404) setNotFound(true);
      });
    return () => {
      alive = false;
    };
  }, [sessionId]);

  // UX-PREC-004: hidrata os passos já persistidos (GET annotations) para sobreviver a
  // reload/reabertura da captura. Sem isso a lista zerava e novos passos recomeçavam do
  // índice 0. O step_index passa a ser atribuído pelo backend (ver markStep), então a
  // narrativa da revisão não ganha índices duplicados.
  useEffect(() => {
    let alive = true;
    listAnnotations(sessionId)
      .then((rows) => {
        if (!alive || !Array.isArray(rows)) return;
        setSteps(
          rows.map((r) => ({
            id: r.id,
            label: r.label,
            start_offset_ms: r.start_offset_ms,
            step_index: r.step_index,
          }))
        );
      })
      .catch(() => {
        /* sessão nova / sem anotações ainda, ou leitura falhou: mantém a lista local */
      });
    return () => {
      alive = false;
    };
  }, [sessionId]);

  // Desenha um frame jpeg (base64) no canvas, ajustando o tamanho do backing store.
  const drawFrame = useCallback((b64, width, height) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    if (width && height) {
      frameSizeRef.current = { width, height };
      if (canvas.width !== width) canvas.width = width;
      if (canvas.height !== height) canvas.height = height;
    }
    const img = new Image();
    img.onload = () => {
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    };
    img.src = `data:image/jpeg;base64,${b64}`;
  }, []);

  // Conexao WebSocket do screencast — com auto-reconexão (backoff) e botão manual.
  // Reexecuta sempre que `reconnectNonce` muda (retry automático ou clique em Reconectar).
  useEffect(() => {
    let closed = false;
    let ws;
    try {
      ws = new WebSocket(streamUrl(sessionId));
    } catch {
      setWsStatus('error');
      return undefined;
    }
    wsRef.current = ws;
    setWsStatus('connecting');

    ws.onopen = () => {
      if (closed) return;
      // conexão saudável: zera o backoff.
      autoRetryRef.current = 0;
      setRetryAttempt(0);
      setExhausted(false);
      setWsStatus('open');
    };
    ws.onclose = () => {
      if (closed) return;
      setWsStatus('closed');
      // UX-PREC-005: reconecta sozinho com backoff exponencial (teto de tentativas),
      // sem exigir F5. Esgotado o teto, resta o botão "Reconectar" do overlay.
      if (autoRetryRef.current < MAX_AUTO_RETRIES) {
        autoRetryRef.current += 1;
        setRetryAttempt(autoRetryRef.current);
        setExhausted(false);
        const delay = Math.min(8000, 1000 * 2 ** (autoRetryRef.current - 1));
        clearTimeout(retryTimerRef.current);
        retryTimerRef.current = setTimeout(() => {
          setReconnectNonce((k) => k + 1);
        }, delay);
      } else {
        setExhausted(true);
      }
    };
    ws.onerror = () => {
      if (!closed) setWsStatus('error');
    };
    ws.onmessage = (evt) => {
      if (closed) return;
      let msg;
      try {
        msg = JSON.parse(evt.data);
      } catch {
        return; // frame nao-JSON ignorado
      }
      if (msg.type === 'frame' && msg.data) {
        drawFrame(msg.data, msg.width, msg.height);
      } else if (msg.type === 'status') {
        setRemoteStatus({ status: msg.status || '', url: msg.url || '' });
      }
    };

    return () => {
      closed = true;
      clearTimeout(retryTimerRef.current);
      try {
        ws.close();
      } catch {
        /* noop */
      }
      wsRef.current = null;
    };
  }, [sessionId, drawFrame, reconnectNonce]);

  // Reconexão manual imediata: zera o backoff e força um novo WS agora.
  const reconnectNow = useCallback(() => {
    clearTimeout(retryTimerRef.current);
    autoRetryRef.current = 0;
    setRetryAttempt(0);
    setExhausted(false);
    setWsStatus('connecting');
    setReconnectNonce((k) => k + 1);
  }, []);

  // Envia uma mensagem ao WS, se conectado.
  const send = useCallback((obj) => {
    const ws = wsRef.current;
    if (ws && ws.readyState === WebSocket.OPEN) {
      try {
        ws.send(JSON.stringify(obj));
      } catch {
        /* noop */
      }
    }
  }, []);

  // Converte coords de um evento do canvas para coords do VIEWPORT REMOTO.
  // O viewport do browser remoto é fixo (1280x800, ver o recorder), então mapeamos
  // para essas dimensões — mais robusto que o metadata do screencast (que pode vir
  // com pageScaleFactor) e garante que o clique cai onde o cursor local aponta.
  const toViewport = useCallback((evt) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    if (!rect.width || !rect.height) return { x: 0, y: 0 };
    const cx = evt.clientX - rect.left;
    const cy = evt.clientY - rect.top;
    const x = Math.round((cx / rect.width) * VIEWPORT_W);
    const y = Math.round((cy / rect.height) * VIEWPORT_H);
    return {
      x: Math.max(0, Math.min(VIEWPORT_W, x)),
      y: Math.max(0, Math.min(VIEWPORT_H, y)),
    };
  }, []);

  // Handlers de mouse/teclado sobre o canvas.
  // Throttle do mousemove via requestAnimationFrame: sem isso o WS é inundado e
  // o cursor remoto fica "pulando"/atrasado.
  const moveRaf = useRef(0);
  const pendingMove = useRef(null);
  const onMouseMove = (e) => {
    pendingMove.current = toViewport(e);
    if (moveRaf.current) return;
    moveRaf.current = requestAnimationFrame(() => {
      moveRaf.current = 0;
      const p = pendingMove.current;
      if (p) send({ type: 'mouse', action: 'move', x: p.x, y: p.y });
    });
  };
  const focusCanvas = () => { try { canvasRef.current && canvasRef.current.focus(); } catch { /* noop */ } };
  const onMouseDown = (e) => {
    focusCanvas();
    const { x, y } = toViewport(e);
    send({ type: 'mouse', action: 'down', x, y, button: mouseButton(e.button) });
  };
  const onMouseUp = (e) => {
    const { x, y } = toViewport(e);
    send({ type: 'mouse', action: 'up', x, y, button: mouseButton(e.button) });
  };
  const onWheel = (e) => {
    e.preventDefault();
    const { x, y } = toViewport(e);
    send({ type: 'mouse', action: 'wheel', x, y, deltaY: e.deltaY });
  };
  // Caractere imprimível (1 char, sem Ctrl/Alt/Meta) → SÓ 'char' (insertText) —
  // evita o keyDown+char duplicado que digitava torto. Teclas de controle
  // (Backspace/Enter/Tab/setas…) vão por 'down'/'up' com key+code.
  const isPrintable = (e) => e.key && e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey;
  // WCAG 2.1.2 (No Keyboard Trap): Tab/Shift+Tab e Escape NUNCA são engolidos —
  // são a rota de saída por teclado do canvas. Tab navega para o próximo/anterior
  // controle da página; Esc devolve o foco ao documento (blur). As demais teclas
  // seguem sendo encaminhadas ao browser remoto enquanto o canvas tem foco.
  const isExitKey = (e) => e.key === 'Tab' || e.key === 'Escape';
  const onKeyDown = (e) => {
    if (isExitKey(e)) {
      if (e.key === 'Escape') e.currentTarget.blur();
      return; // sem preventDefault: navegação/saída por teclado seguem normais
    }
    e.preventDefault();
    if (isPrintable(e)) send({ type: 'key', action: 'char', text: e.key });
    else send({ type: 'key', action: 'down', key: e.key, code: e.code });
  };
  const onKeyUp = (e) => {
    if (isExitKey(e)) return;
    e.preventDefault();
    if (!isPrintable(e)) send({ type: 'key', action: 'up', key: e.key, code: e.code });
  };

  // ── Acoes do painel direito ───────────────────────────────────────────────
  const markStep = async () => {
    const text = label.trim();
    if (!text) return;
    setBusyStep(true);
    setActionErr(null);
    const startOffsetMs = Math.max(0, Date.now() - sessionStartRef.current);
    try {
      // step_index é atribuído pelo backend (COUNT das anotações persistidas), não pelo
      // tamanho da lista local — assim o índice nunca duplica após um reload (UX-PREC-004).
      const created = await createAnnotation(sessionId, {
        label: text,
        start_offset_ms: startOffsetMs,
      });
      setSteps((prev) => [
        ...prev,
        {
          id: (created && created.id) || `local-${Date.now()}`,
          label: text,
          start_offset_ms:
            created && created.start_offset_ms != null ? created.start_offset_ms : startOffsetMs,
          step_index: created && created.step_index != null ? created.step_index : prev.length,
        },
      ]);
      setLabel('');
    } catch (e) {
      setActionErr(e.message || String(e));
    } finally {
      setBusyStep(false);
    }
  };

  const print = async () => {
    setBusyShot(true);
    setActionErr(null);
    try {
      await takeScreenshot(sessionId);
      // UX-PREC-012: confirma o sucesso com um contador visível (o print só aparece
      // depois, na Revisão) — evita prints repetidos "por garantia".
      setShotCount((n) => n + 1);
    } catch (e) {
      setActionErr(e.message || String(e));
    } finally {
      setBusyShot(false);
    }
  };

  const stop = async () => {
    // UX-PREC-007: encerrar é irreversível (não dá para retomar) — pede confirmação,
    // no mesmo padrão das exclusões (window.confirm).
    if (!window.confirm('Encerrar a captura? A sessão não pode ser retomada depois.')) return;
    setBusyStop(true);
    setActionErr(null);
    try {
      await stopSession(sessionId);
      navigate(`#/review/${sessionId}`);
    } catch (e) {
      setActionErr(e.message || String(e));
      setBusyStop(false);
    }
  };

  if (notFound) {
    return (
      <div className="view">
        <div className="empty">
          <p style={{ margin: 0 }}>Sessão não encontrada.</p>
          <p className="muted small" style={{ marginTop: 6 }}>
            Ela pode ter sido excluída ou o link está desatualizado.
          </p>
          <div style={{ marginTop: 14 }}>
            <button className="btn btn-primary" onClick={() => navigate('#/')}>
              ← Voltar aos portais
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="capture">
      <div className="capture__bar card">
        <div className="capture__status">
          <span
            className={'status status--dot status--' + wsKind(wsStatus)}
            role="status"
            aria-live="polite"
          >
            <span className="status__pulse" aria-hidden="true" />
            {wsLabel(wsStatus)}
          </span>
          {remoteStatus.status && <span className="chip">{remoteStatus.status}</span>}
          <span className="capture__url mono" title={remoteStatus.url}>
            {remoteStatus.url || (session && session.title) || sessionId}
          </span>
        </div>
        <button className="btn btn-danger" onClick={stop} disabled={busyStop}>
          {busyStop ? 'Encerrando…' : 'Encerrar sessao'}
        </button>
      </div>

      <div className="capture__cols">
        <div className="capture__screen card">
          <canvas
            ref={canvasRef}
            className="screencast"
            tabIndex={0}
            role="application"
            aria-label="Tela do browser remoto — clique para focar; mouse e teclado sao enviados ao portal. Pressione Esc para sair do controle por teclado, ou Tab para navegar."
            onMouseMove={onMouseMove}
            onMouseDown={onMouseDown}
            onMouseUp={onMouseUp}
            onWheel={onWheel}
            onKeyDown={onKeyDown}
            onKeyUp={onKeyUp}
            onContextMenu={(e) => e.preventDefault()}
          />
          {wsStatus !== 'open' && (
            <div className="screencast__overlay">
              <div className="screencast__overlay-msg">
                {wsStatus === 'connecting' && 'Conectando ao browser remoto…'}
                {wsStatus === 'closed' && 'Conexao encerrada.'}
                {wsStatus === 'error' && 'Falha na conexao do screencast.'}
              </div>
              {(wsStatus === 'closed' || wsStatus === 'error') && (
                <div className="screencast__overlay-actions">
                  {!exhausted && retryAttempt > 0 && (
                    <span
                      className="screencast__overlay-note"
                      role="status"
                      aria-live="polite"
                    >
                      Reconectando automaticamente… (tentativa {retryAttempt} de {MAX_AUTO_RETRIES})
                    </span>
                  )}
                  {exhausted && (
                    <span className="screencast__overlay-note">
                      Não foi possível reconectar automaticamente.
                    </span>
                  )}
                  <button className="btn btn-primary" onClick={reconnectNow}>
                    Reconectar
                  </button>
                </div>
              )}
            </div>
          )}
          <div className="screencast__hint muted small">
            Clique no quadro para focar (borda azul = teclado ativo). O cursor local serve
            de guia; digitação, Enter, Backspace e setas funcionam direto.
            <br />
            Pressione <kbd>Esc</kbd> para sair do controle por teclado (ou <kbd>Tab</kbd> para navegar).
          </div>
        </div>

        <aside className="capture__panel card">
          <h3 className="panel__title">Anotacao</h3>
          <label className="field">
            <span>O que estou fazendo agora</span>
            <input
              className="input"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && markStep()}
              placeholder="ex.: abrindo o login do portal"
            />
          </label>
          <div className="panel__actions">
            <button className="btn btn-primary" onClick={markStep} disabled={busyStep || !label.trim()}>
              {busyStep ? 'Marcando…' : 'Marcar passo'}
            </button>
            <button className="btn btn-ghost" onClick={print} disabled={busyShot}>
              {busyShot ? 'Printando…' : shotCount > 0 ? `Print (${shotCount})` : 'Print'}
            </button>
          </div>

          {shotCount > 0 && (
            <div className="panel__note muted small" role="status" aria-live="polite">
              {shotCount} print{shotCount > 1 ? 's' : ''} salvo{shotCount > 1 ? 's' : ''} nesta sessão — aparece{shotCount > 1 ? 'm' : ''} na Revisão.
            </div>
          )}

          {actionErr && <div className="alert alert-err" role="alert">{actionErr}</div>}

          <div className="panel__steps">
            <div className="muted small">Passos marcados ({steps.length})</div>
            {steps.length === 0 ? (
              <div className="empty empty--sm">Nenhum passo ainda.</div>
            ) : (
              <ol className="steps-list">
                {steps.map((s) => (
                  <li key={s.id} className="steps-list__item">
                    <span className="mono small">{fmtOffset(s.start_offset_ms)}</span>
                    <span>{s.label}</span>
                  </li>
                ))}
              </ol>
            )}
          </div>
        </aside>
      </div>
    </div>
  );
}

// Mapeia o numero do botao do mouse para o nome esperado pelo recorder/CDP.
function mouseButton(n) {
  if (n === 1) return 'middle';
  if (n === 2) return 'right';
  return 'left';
}

function wsKind(status) {
  if (status === 'open') return 'ok';
  if (status === 'connecting') return 'warn';
  return 'err';
}
function wsLabel(status) {
  return {
    open: 'ao vivo',
    connecting: 'conectando…',
    closed: 'desconectado',
    error: 'erro',
  }[status] || status;
}

function fmtOffset(ms) {
  if (ms == null) return '—';
  const totalSec = Math.floor(ms / 1000);
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}
