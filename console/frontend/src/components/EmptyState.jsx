import React from 'react';
import Icon from './Icon.jsx';

/** Estado vazio amigável: ícone + título + dica + ação opcional. */
export default function EmptyState({ icon = 'info', title, hint, action }) {
  return (
    <div className="empty-state">
      <span className="empty-state__icon"><Icon name={icon} size={26} /></span>
      <p className="empty-state__title">{title}</p>
      {hint && <p className="empty-state__hint">{hint}</p>}
      {action && <div className="empty-state__action">{action}</div>}
    </div>
  );
}
