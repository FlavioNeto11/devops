import React from 'react';
import RichTextField from './RichTextField.jsx';
import MediaPicker from './MediaPicker.jsx';
import IconPicker from './IconPicker.jsx';

// Editor de conteudo GENERICO: percorre o objeto `data` (jsonb) e renderiza o
// editor adequado por tipo/chave. Cobre qualquer `kind` sem formulario dedicado.
//   - chave 'html'         -> RichTextField (WYSIWYG)
//   - chave 'icon'         -> IconPicker (grid visual buscável)
//   - chave *url|*photo... -> MediaPicker (preview + upload + biblioteca)
//   - array de objetos     -> lista com add/remover/reordenar (AutoForm aninhado)
//   - array de strings     -> textarea (um por linha)
//   - objeto               -> sub-formulario
//   - boolean/number/string-> input apropriado

const isObj = (v) => v && typeof v === 'object' && !Array.isArray(v);
const TEXTAREA_KEYS = new Set(['intro', 'desc', 'description', 'summary', 'text', 'subtitle', 'a', 'objetivo', 'tagline', 'positioning', 'quote', 'titleTail']);
const FILE_KEY = /(fileid|photo|logo|image|url|hero|about)$/i;
const LONG = 70;

function labelize(k) {
  return k.replace(/([A-Z])/g, ' $1').replace(/[_-]/g, ' ').replace(/^./, (c) => c.toUpperCase());
}

function emptyLike(v) {
  if (Array.isArray(v)) return [];
  if (isObj(v)) return Object.fromEntries(Object.keys(v).map((k) => [k, emptyLike(v[k])]));
  if (typeof v === 'boolean') return false;
  if (typeof v === 'number') return 0;
  return '';
}

function StringField({ k, value, onChange, projectId }) {
  if (k === 'html') return <RichTextField value={value} onChange={onChange} />;
  if (k === 'icon') return <IconPicker value={value} onChange={onChange} />;
  if (FILE_KEY.test(k)) return <MediaPicker projectId={projectId} value={value} onChange={onChange} />;
  const multi = TEXTAREA_KEYS.has(k) || (typeof value === 'string' && value.length > LONG);
  return multi
    ? <textarea className="textarea" value={value || ''} onChange={(e) => onChange(e.target.value)} />
    : <input className="input" value={value || ''} onChange={(e) => onChange(e.target.value)} />;
}

function ArrayOfStrings({ value, onChange }) {
  return (
    <textarea
      className="textarea"
      value={(value || []).join('\n')}
      placeholder="um item por linha"
      onChange={(e) => onChange(e.target.value.split('\n').map((s) => s.trim()).filter(Boolean))}
    />
  );
}

function ArrayOfObjects({ value, onChange, projectId }) {
  const items = value || [];
  const tmpl = items[0] ? emptyLike(items[0]) : {};
  const setItem = (i, next) => onChange(items.map((it, idx) => (idx === i ? next : it)));
  const move = (i, d) => {
    const j = i + d;
    if (j < 0 || j >= items.length) return;
    const arr = [...items];
    [arr[i], arr[j]] = [arr[j], arr[i]];
    onChange(arr);
  };
  return (
    <div style={{ display: 'grid', gap: 10 }}>
      {items.map((it, i) => (
        <div key={i} style={{ border: '1px solid var(--line, #eee)', borderRadius: 10, padding: 10, background: 'var(--bg-soft, #fafbfd)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
            <strong style={{ fontSize: '.78rem', opacity: 0.7 }}>#{i + 1}</strong>
            <span style={{ display: 'flex', gap: 4 }}>
              <button type="button" className="icon-btn" title="subir" onClick={() => move(i, -1)}>↑</button>
              <button type="button" className="icon-btn" title="descer" onClick={() => move(i, 1)}>↓</button>
              <button type="button" className="icon-btn" title="remover" onClick={() => onChange(items.filter((_, idx) => idx !== i))}>✕</button>
            </span>
          </div>
          <AutoForm value={it} onChange={(n) => setItem(i, n)} projectId={projectId} />
        </div>
      ))}
      <button type="button" className="btn" onClick={() => onChange([...items, JSON.parse(JSON.stringify(tmpl))])}>
        + adicionar item
      </button>
    </div>
  );
}

export default function AutoForm({ value, onChange, projectId }) {
  if (!isObj(value)) return null;
  const set = (k, v) => onChange({ ...value, [k]: v });
  return (
    <div style={{ display: 'grid', gap: 12 }}>
      {Object.keys(value).map((k) => {
        const v = value[k];
        const isScalar = !Array.isArray(v) && !isObj(v);
        return (
          <div key={k} className="field">
            <span className="field__label">{labelize(k)}</span>
            {Array.isArray(v) ? (
              v.length && isObj(v[0])
                ? <ArrayOfObjects value={v} onChange={(n) => set(k, n)} projectId={projectId} />
                : <ArrayOfStrings value={v} onChange={(n) => set(k, n)} />
            ) : isObj(v) ? (
              <div style={{ borderLeft: '2px solid var(--line2, #ddd)', paddingLeft: 12 }}>
                <AutoForm value={v} onChange={(n) => set(k, n)} projectId={projectId} />
              </div>
            ) : typeof v === 'boolean' ? (
              <label className="check-inline" style={{ paddingBottom: 0 }}>
                <input type="checkbox" checked={v} onChange={(e) => set(k, e.target.checked)} /> {v ? 'sim' : 'não'}
              </label>
            ) : typeof v === 'number' ? (
              <input className="input" type="number" value={v} onChange={(e) => set(k, Number(e.target.value))} />
            ) : (
              isScalar && <StringField k={k} value={v} onChange={(n) => set(k, n)} projectId={projectId} />
            )}
          </div>
        );
      })}
    </div>
  );
}
