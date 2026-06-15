import React from 'react';
import Icon from './Icon.jsx';

/**
 * Sidebar — navegação vertical (dashboard enterprise). Grupos com rótulo, itens
 * com ícone+label e estado ativo (barra de accent à esquerda). Colapsável no
 * desktop (labels escondidos via CSS); off-canvas no mobile (.shell--navopen).
 * Os textos são sempre renderizados — o CSS decide exibi-los conforme o modo.
 */
export default function Sidebar({ groups, links = [], activeKey, onSelect, collapsed, onToggleCollapse }) {
  return (
    <aside className={'sidebar' + (collapsed ? ' sidebar--collapsed' : '')} aria-label="Navegação principal">
      <div className="sidebar__logo">
        <span className="sidebar__logo-mark"><Icon name="diamond" size={22} /></span>
        <span className="sidebar__logo-text">DevOps Console</span>
      </div>

      <nav className="sidebar__nav" id="sidebar-nav">
        {groups.map((g) => (
          <div key={g.label} className="sidebar__group">
            <div className="sidebar__group-label">{g.label}</div>
            {g.items.map((it) => (
              <button
                key={it.key}
                type="button"
                className={'sidebar__item' + (activeKey === it.key ? ' sidebar__item--active' : '')}
                onClick={() => onSelect(it.key)}
                title={it.label}
                aria-current={activeKey === it.key ? 'page' : undefined}
              >
                <Icon name={it.icon} size={18} />
                <span className="sidebar__item-label">{it.label}</span>
              </button>
            ))}
          </div>
        ))}

        {links.length > 0 && (
          <div className="sidebar__group sidebar__group--links">
            <div className="sidebar__group-label">Plataforma</div>
            {links.map((l) => (l.onClick ? (
              // Entrada informativa (ex.: Traefik — dashboard interno, sem rota pública):
              // abre um modal em vez de navegar para uma URL que não existe neste host.
              <button key={l.label} type="button" className="sidebar__item sidebar__item--link" onClick={l.onClick} title={l.title || l.label}>
                <Icon name={l.icon || 'info'} size={18} />
                <span className="sidebar__item-label">{l.label}</span>
              </button>
            ) : (
              <a key={l.href} className="sidebar__item sidebar__item--link" href={l.href} target="_blank" rel="noopener noreferrer"
                title={`${l.label} — abre em nova aba`} aria-label={`${l.label} (abre em nova aba)`}>
                <Icon name="external" size={18} />
                <span className="sidebar__item-label">{l.label}</span>
              </a>
            )))}
          </div>
        )}
      </nav>

      <button
        type="button"
        className="sidebar__collapse"
        onClick={onToggleCollapse}
        title={collapsed ? 'Expandir menu' : 'Recolher menu'}
        aria-label={collapsed ? 'Expandir menu' : 'Recolher menu'}
      >
        <Icon name={collapsed ? 'chevronRight' : 'chevronLeft'} size={18} />
        <span>Recolher</span>
      </button>
    </aside>
  );
}
