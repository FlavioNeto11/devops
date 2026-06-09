import React, { useEffect, useRef } from 'react';
import Icon from './Icon.jsx';

/**
 * Modal genérico (overlay central). Fecha no Esc e no clique fora; foca o primeiro
 * controle ao abrir. Reusa os tokens/animação do drawer. `footer` é opcional.
 */
export default function Modal({ title, onClose, children, footer, size = 'md' }) {
  const ref = useRef(null);

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose?.(); };
    document.addEventListener('keydown', onKey);
    const t = setTimeout(() => {
      const el = ref.current?.querySelector('input, select, textarea, button');
      if (el) el.focus();
    }, 30);
    return () => { document.removeEventListener('keydown', onKey); clearTimeout(t); };
  }, [onClose]);

  return (
    <div
      className="modal__overlay"
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose?.(); }}
    >
      <div className={`modal modal--${size}`} role="dialog" aria-modal="true" aria-label={title} ref={ref}>
        <div className="modal__head">
          <h3 className="modal__title">{title}</h3>
          <button className="drawer__close" onClick={onClose} aria-label="Fechar">
            <Icon name="x" size={18} />
          </button>
        </div>
        <div className="modal__body">{children}</div>
        {footer && <div className="modal__foot">{footer}</div>}
      </div>
    </div>
  );
}
