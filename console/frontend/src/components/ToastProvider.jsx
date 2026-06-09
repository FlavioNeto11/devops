import React, { createContext, useCallback, useContext, useMemo, useState } from 'react';
import Icon from './Icon.jsx';

/**
 * Sistema de toasts (notificações) — feedback de sucesso/erro/info consistente,
 * substitui mensagens inline soltas. Pilha no canto superior direito, auto-dismiss.
 * Uso: const toast = useToast(); toast.ok('Salvo'); toast.err('Falhou: ...').
 */
const ToastCtx = createContext(null);
let idSeq = 0;

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);

  const dismiss = useCallback((id) => setToasts((t) => t.filter((x) => x.id !== id)), []);

  const push = useCallback((kind, message, ttl) => {
    const id = ++idSeq;
    setToasts((t) => [...t, { id, kind, message }]);
    const ms = ttl ?? (kind === 'err' ? 7000 : 4000);
    if (ms) setTimeout(() => dismiss(id), ms);
    return id;
  }, [dismiss]);

  const api = useMemo(() => ({
    ok: (m, ttl) => push('ok', m, ttl),
    err: (m, ttl) => push('err', m, ttl),
    info: (m, ttl) => push('info', m, ttl),
    dismiss,
  }), [push, dismiss]);

  const iconFor = (kind) => (kind === 'ok' ? 'check' : kind === 'err' ? 'alert' : 'info');

  return (
    <ToastCtx.Provider value={api}>
      {children}
      <div className="toasts" role="region" aria-live="polite" aria-label="Notificações">
        {toasts.map((t) => (
          <div key={t.id} className={`toast toast--${t.kind}`} role="status">
            <Icon name={iconFor(t.kind)} size={18} />
            <span className="toast__msg">{t.message}</span>
            <button className="toast__close" onClick={() => dismiss(t.id)} aria-label="Fechar notificação">
              <Icon name="x" size={14} />
            </button>
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}

export function useToast() {
  // Fallback no-op se usado fora do provider (nunca quebra a UI).
  return useContext(ToastCtx) || { ok() {}, err() {}, info() {}, dismiss() {} };
}
