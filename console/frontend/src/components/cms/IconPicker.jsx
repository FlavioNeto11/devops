import React, { useMemo, useState } from 'react';
import Modal from '../Modal.jsx';
import { ICON_BY_NAME, searchIcons } from './iconCatalog.js';

/**
 * IconPicker — seleção VISUAL de ícone (substitui digitar o nome).
 * Botão fechado mostra o ícone atual; clique abre um grid buscável (nome em
 * inglês + palavra-chave em PT). Grava a string do nome (ex.: "ShieldCheck"),
 * compatível com resolveIcon dos portais.
 */
export default function IconPicker({ value, onChange }) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const Current = value ? ICON_BY_NAME[value] : null;
  const results = useMemo(() => (open ? searchIcons(q) : []), [open, q]);

  return (
    <>
      <button type="button" className="ic-trigger" onClick={() => { setQ(''); setOpen(true); }}>
        <span className="ic-trigger__icon">{Current ? <Current size={20} /> : <span className="ic-trigger__none">?</span>}</span>
        <span className="ic-trigger__label">{value || 'Escolher ícone…'}</span>
        <span className="ic-trigger__hint">trocar</span>
      </button>

      {open && (
        <Modal title="Escolher ícone" size="md" onClose={() => setOpen(false)}>
          <input
            className="input"
            autoFocus
            placeholder="Busque em português (escudo, folha…) ou inglês (shield, leaf…)"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            style={{ marginBottom: 12 }}
          />
          {value && (
            <button type="button" className="btn" style={{ marginBottom: 12 }} onClick={() => { onChange(''); setOpen(false); }}>
              Remover ícone
            </button>
          )}
          <div className="ic-grid">
            {results.map((name) => {
              const Ico = ICON_BY_NAME[name];
              return (
                <button
                  key={name}
                  type="button"
                  title={name}
                  className={'ic-cell' + (name === value ? ' ic-cell--active' : '')}
                  onClick={() => { onChange(name); setOpen(false); }}
                >
                  <Ico size={22} />
                  <span className="ic-cell__name">{name}</span>
                </button>
              );
            })}
            {!results.length && <p className="muted" style={{ gridColumn: '1 / -1', textAlign: 'center', padding: 12 }}>Nenhum ícone encontrado.</p>}
          </div>
        </Modal>
      )}
    </>
  );
}
