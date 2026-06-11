import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  getSession,
  stopSession,
  createAnnotation,
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

  const [label, setLabel] = useState('');
  const [steps, setSteps] = useState([]);
  const [busyStep, setBusyStep] = useState(false);
  const [busyShot, setBusyShot] = useState(false);
  const [busyStop, setBusyStop] = useState(false);
  const [actionErr, setActionErr] = useState(null);

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
      .catch(() => {
        /* sessao pode ainda nao existir no GET; mantem started local */
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

  // Conexao WebSocket do screencast.
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
      if (!closed) setWsStatus('open');
    };
    ws.onclose = () => {
      if (!closed) setWsStatus('closed');
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
      try {
        ws.close();
      } catch {
        /* noop */
      }
      wsRef.current = null;
    };
  }, [sessionId, drawFrame]);

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
  const onKeyDown = (e) => {
    e.preventDefault();
    if (isPrintable(e)) send({ type: 'key', action: 'char', text: e.key });
    else send({ type: 'key', action: 'down', key: e.key, code: e.code });
  };
  const onKeyUp = (e) => {
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
      const created = await createAnnotation(sessionId, {
        label: text,
        start_offset_ms: startOffsetMs,
        step_index: steps.length,
      });
      setSteps((prev) => [
        ...prev,
        {
          id: (created && created.id) || `local-${Date.now()}`,
          label: text,
          start_offset_ms: startOffsetMs,
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
    } catch (e) {
      setActionErr(e.message || String(e));
    } finally {
      setBusyShot(false);
    }
  };

  const stop = async () => {
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

  return (
    <div className="capture">
      <div className="capture__bar card">
        <div className="capture__status">
          <span className={'status status--' + wsKind(wsStatus)}>{wsLabel(wsStatus)}</span>
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
              {wsStatus === 'connecting' && 'Conectando ao browser remoto…'}
              {wsStatus === 'closed' && 'Conexao encerrada.'}
              {wsStatus === 'error' && 'Falha na conexao do screencast.'}
            </div>
          )}
          <div className="screencast__hint muted small">
            Clique no quadro para focar (borda azul = teclado ativo). O cursor local serve
            de guia; digitação, Enter, Backspace e setas funcionam direto.
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
              {busyShot ? 'Printando…' : 'Print'}
            </button>
          </div>

          {actionErr && <div className="alert alert-err">{actionErr}</div>}

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
