import React, { useEffect, useRef, useState } from 'react';
import Icon from './Icon.jsx';

/**
 * TopBar — barra superior: hamburger (mobile), título+descrição da seção e, à direita,
 * badge de tempo real (SSE), toggle de tema e menu do usuário (avatar + e-mail + papel + sair).
 */
export default function TopBar({ section, onMenu, theme, onToggleTheme, me, live }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    const onDoc = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    const onKey = (e) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('mousedown', onDoc); document.removeEventListener('keydown', onKey); };
  }, [open]);

  const email = me?.email || '';
  const initial = (email.trim()[0] || '?').toUpperCase();
  const role = me?.isAdmin ? 'Administrador' : me?.isMember ? 'Acesso a projetos' : 'Sessão';

  return (
    <header className="topbar">
      <button className="topbar__menu icon-btn" onClick={onMenu} aria-label="Abrir menu">
        <Icon name="menu" size={20} />
      </button>

      <div className="topbar__title">
        <h1 className="topbar__heading">{section?.label || 'DevOps Console'}</h1>
        {section?.description && <p className="topbar__desc">{section.description}</p>}
      </div>

      <div className="topbar__actions">
        {live && <span className={live.cls} title="Observação do cluster em tempo real (SSE)">{live.text}</span>}
        <button
          className="icon-btn topbar__icon"
          onClick={onToggleTheme}
          title="Alternar tema claro/escuro"
          aria-label="Alternar tema claro/escuro"
        >
          <Icon name={theme === 'dark' ? 'sun' : 'moon'} size={18} />
        </button>

        <div className="usermenu" ref={ref}>
          <button className="usermenu__btn" onClick={() => setOpen((o) => !o)} aria-haspopup="menu" aria-expanded={open}>
            <span className="usermenu__avatar">{initial}</span>
            {email && <span className="usermenu__email">{email}</span>}
          </button>
          {open && (
            <div className="usermenu__pop" role="menu">
              <div className="usermenu__head">
                <span className="usermenu__avatar usermenu__avatar--lg">{initial}</span>
                <div className="usermenu__id">
                  <div className="usermenu__email-full">{email || 'sessão autenticada'}</div>
                  <span className="badge badge-accent">{role}</span>
                </div>
              </div>
              <a href="/oauth2/sign_out" className="usermenu__item" role="menuitem">
                <Icon name="logout" size={16} /> Sair
              </a>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
