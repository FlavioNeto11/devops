import React, { useEffect, useRef } from 'react';
import Icon from './Icon.jsx';
import { useFocusTrap } from '../lib/useFocusTrap.js';

/**
 * Modal genérico (overlay central). Fecha no Esc e no clique fora; foca o primeiro
 * controle ao abrir, prende o Tab dentro do diálogo e devolve o foco ao fechar
 * (via useFocusTrap — mesmo padrão dos drawers). `footer` é opcional.
 */
export default function Modal({ title, onClose, children, footer, size = 'md' }) {
  const ref = useRef(null);

  // onClose costuma ser uma arrow INLINE (identidade nova a cada render do pai);
  // guardamos a versão atual num ref para o efeito de montagem não re-executar
  // a cada re-render (ex.: snapshots SSE) — era isso que ROUBAVA o foco do
  // usuário no meio da digitação, pulando para o primeiro botão (o X).
  const onCloseRef = useRef(onClose);
  useEffect(() => { onCloseRef.current = onClose; });

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onCloseRef.current?.(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []); // monta UMA vez — sem re-foco em re-render

  // Foco inicial no primeiro controle do CORPO (nunca o X do cabeçalho), trap de
  // Tab e devolução do foco ao controle que abriu o modal.
  useFocusTrap(ref, {
    getInitialFocus: (root) =>
      root.querySelector('.modal__body input, .modal__body select, .modal__body textarea, .modal__body button')
      || root.querySelector('.modal__foot button'),
  });

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
