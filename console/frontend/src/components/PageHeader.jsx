import React from 'react';

/**
 * PageHeader — barra de ações por seção (a TopBar já mostra título/descrição da seção).
 * Usado pelas views para a ação primária (ex.: "Atualizar", "+ projeto"). Título/descrição
 * são opcionais (subtítulo dentro da view). Quando só há `actions`, alinha à direita.
 */
export default function PageHeader({ title, description, actions }) {
  if (!title && !description && !actions) return null;
  return (
    <div className={'page-header' + (!title && !description ? ' page-header--actions-only' : '')}>
      {(title || description) && (
        <div className="page-header__text">
          {title && <h2 className="page-header__title">{title}</h2>}
          {description && <p className="page-header__desc">{description}</p>}
        </div>
      )}
      {actions && <div className="page-header__actions">{actions}</div>}
    </div>
  );
}
