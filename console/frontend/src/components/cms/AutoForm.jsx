import React from 'react';
import RichTextField from './RichTextField.jsx';
import MediaPicker from './MediaPicker.jsx';
import IconPicker from './IconPicker.jsx';
import VideoPicker from './VideoPicker.jsx';
import {
  labelFor, hintFor, isHiddenKey, isColorField, toInputHex, enumOptionsFor,
  isColumnsField, extractYouTubeId, isRequiredKey, isEmptyRequired,
} from '../../lib/fieldKit.js';

// Editor de conteudo GENERICO: percorre o objeto `data` (jsonb) e renderiza o
// editor adequado por tipo/chave — em linguagem de USUARIO (sem jargao):
//   - chave 'html'           -> RichTextField (WYSIWYG)
//   - chave 'icon'           -> IconPicker (grid visual buscavel)
//   - cor (hex/paleta)       -> seletor de cor nativo + campo texto sincronizado
//   - campos de escolha      -> select amigavel (posicao, layout, tipo de botao, colunas)
//   - youtubeId              -> aceita o LINK colado e extrai o ID sozinho
//   - chave *url|*photo...   -> MediaPicker (preview + upload + biblioteca)
//   - array de objetos       -> lista com add/remover/reordenar (AutoForm aninhado)
//   - array de strings       -> textarea (um por linha)
//   - objeto                 -> sub-formulario
//   - boolean/number/string  -> input apropriado
// Campos internos (aiPalette, _*) ficam ocultos.

const isObj = (v) => v && typeof v === 'object' && !Array.isArray(v);
const TEXTAREA_KEYS = new Set(['intro', 'desc', 'description', 'summary', 'text', 'subtitle', 'a', 'objetivo', 'tagline', 'positioning', 'quote', 'titleTail']);
const FILE_KEY = /(fileid|photo|logo|image|url|hero|about)$/i;
const VIDEO_KEY = /^(youtubeid|videoid|video)$/i;
const LONG = 70;

function emptyLike(v) {
  if (Array.isArray(v)) return [];
  if (isObj(v)) return Object.fromEntries(Object.keys(v).map((k) => [k, emptyLike(v[k])]));
  if (typeof v === 'boolean') return false;
  if (typeof v === 'number') return 0;
  return '';
}

/** Seletor visual de cor + hex sincronizado (o usuário não precisa saber o que é hex). */
function ColorField({ value, onChange }) {
  return (
    <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
      <input
        type="color"
        value={toInputHex(value)}
        onChange={(e) => onChange(e.target.value)}
        style={{ width: 44, height: 34, padding: 2, border: '1px solid var(--line)', borderRadius: 8, background: 'var(--bg-elev-2)', cursor: 'pointer' }}
        title="Clique para escolher a cor"
        aria-label="Escolher cor"
      />
      <input className="input" style={{ flex: 1 }} value={value || ''} placeholder="#22C55E"
        onChange={(e) => onChange(e.target.value)} aria-label="Código da cor" />
      {value && <span style={{ width: 20, height: 20, borderRadius: 6, background: toInputHex(value), border: '1px solid var(--line)' }} title={`Amostra: ${value}`} aria-hidden />}
    </div>
  );
}

function StringField({ k, value, onChange, projectId, siblings }) {
  if (k === 'html') return <RichTextField value={value} onChange={onChange} />;
  if (k === 'icon') return <IconPicker value={value} onChange={onChange} />;
  if (isColorField(k, value)) return <ColorField value={value} onChange={onChange} />;
  const label = labelFor(k);
  const options = enumOptionsFor(k, value, siblings);
  if (options) {
    return (
      <select className="select" aria-label={label} value={value || ''} onChange={(e) => onChange(e.target.value)}>
        {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    );
  }
  if (VIDEO_KEY.test(k)) return <VideoPicker projectId={projectId} value={value} onChange={(n) => onChange(extractYouTubeId(n))} />;
  if (FILE_KEY.test(k)) return <MediaPicker projectId={projectId} value={value} onChange={onChange} />;
  const multi = TEXTAREA_KEYS.has(k) || (typeof value === 'string' && value.length > LONG);
  return multi
    ? <textarea className="textarea" aria-label={label} value={value || ''} onChange={(e) => onChange(e.target.value)} />
    : <input className="input" aria-label={label} value={value || ''} onChange={(e) => onChange(e.target.value)} />;
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
      {!items.length && (
        <p className="muted" style={{ fontSize: '.78rem', margin: 0 }}>Nenhum item ainda — clique abaixo para adicionar o primeiro.</p>
      )}
      {items.map((it, i) => (
        <div key={i} style={{ border: '1px solid var(--line)', borderRadius: 10, padding: 10, background: 'var(--bg-soft)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
            <strong style={{ fontSize: '.78rem', opacity: 0.7 }}>#{i + 1}</strong>
            <span style={{ display: 'flex', gap: 4 }}>
              <button type="button" className="icon-btn" title="subir" aria-label={`Mover item ${i + 1} para cima`} onClick={() => move(i, -1)}>↑</button>
              <button type="button" className="icon-btn" title="descer" aria-label={`Mover item ${i + 1} para baixo`} onClick={() => move(i, 1)}>↓</button>
              <button type="button" className="icon-btn" title="remover" aria-label={`Remover item ${i + 1}`} onClick={() => onChange(items.filter((_, idx) => idx !== i))}>✕</button>
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
  const keys = Object.keys(value).filter((k) => !isHiddenKey(k));
  return (
    <div style={{ display: 'grid', gap: 12 }}>
      {keys.map((k) => {
        const v = value[k];
        const isScalar = !Array.isArray(v) && !isObj(v);
        const hint = hintFor(k);
        const required = isRequiredKey(k);
        const missing = isEmptyRequired(k, v);
        return (
          <div key={k} className="field">
            <span className="field__label">
              {labelFor(k)}
              {required && <span className="field__req" aria-hidden="true" title="Campo obrigatório"> *</span>}
            </span>
            {Array.isArray(v) ? (
              v.length && isObj(v[0])
                ? <ArrayOfObjects value={v} onChange={(n) => set(k, n)} projectId={projectId} />
                : <ArrayOfStrings value={v} onChange={(n) => set(k, n)} />
            ) : isObj(v) ? (
              <div style={{ borderLeft: '2px solid var(--line2)', paddingLeft: 12 }}>
                <AutoForm value={v} onChange={(n) => set(k, n)} projectId={projectId} />
              </div>
            ) : typeof v === 'boolean' ? (
              <label className="check-inline" style={{ paddingBottom: 0 }}>
                <input type="checkbox" aria-label={labelFor(k)} checked={v} onChange={(e) => set(k, e.target.checked)} /> {v ? 'sim' : 'não'}
              </label>
            ) : typeof v === 'number' ? (
              isColumnsField(k) ? (
                <select className="select" aria-label={labelFor(k)} value={v} onChange={(e) => set(k, Number(e.target.value))}>
                  {[1, 2, 3, 4].map((n) => <option key={n} value={n}>{n} coluna{n > 1 ? 's' : ''}</option>)}
                </select>
              ) : (
                <input className="input" type="number" aria-label={labelFor(k)} value={v} onChange={(e) => set(k, Number(e.target.value))} />
              )
            ) : (
              isScalar && <StringField k={k} value={v} onChange={(n) => set(k, n)} projectId={projectId} siblings={keys} />
            )}
            {hint && <span className="muted" style={{ fontSize: '.75rem', marginTop: 4 }}>{hint}</span>}
            {missing && <span className="field__req-msg" role="alert">Este campo é obrigatório.</span>}
          </div>
        );
      })}
    </div>
  );
}
