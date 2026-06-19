import React from 'react';
import Icon from './Icon.jsx';

/**
 * TopBar — barra superior da seção: hamburger (mobile), título+descrição e o badge de
 * tempo real (SSE). O TEMA e o MENU DO USUÁRIO agora vivem na casca global
 * (<platform-shell>), evitando duplicação — aqui fica só o que é específico do Console.
 */
export default function TopBar({ section, onMenu, navOpen = false, live }) {
  return (
    <header className="topbar">
      <button
        className="topbar__menu icon-btn"
        onClick={onMenu}
        aria-label={navOpen ? 'Fechar menu' : 'Abrir menu'}
        aria-expanded={navOpen}
        aria-controls="sidebar-nav"
      >
        <Icon name="menu" size={20} />
      </button>

      <div className="topbar__title">
        <h1 className="topbar__heading">{section?.label || 'DevOps Console'}</h1>
        {section?.description && <p className="topbar__desc">{section.description}</p>}
      </div>

      <div className="topbar__actions">
        {live && (
          <span className={live.cls} title="Observação do cluster em tempo real (SSE)">
            {live.text}
          </span>
        )}
      </div>
    </header>
  );
}
