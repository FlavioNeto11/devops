import React, { useRef, useState } from 'react';
import { pmCmsUpload } from '../../api.js';
import { useToast } from '../ToastProvider.jsx';

/**
 * Campo de arquivo: input de URL + botao de upload (envia ao pm-api e grava a URL
 * publica retornada). Aceita imagens e PDF.
 */
export default function FileField({ projectId, value, onChange }) {
  const inp = useRef(null);
  const [busy, setBusy] = useState(false);
  const toast = useToast();

  const onFile = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setBusy(true);
    try {
      const r = await pmCmsUpload(projectId, file);
      onChange(r.url);
      toast.ok('Arquivo enviado.');
    } catch (err) {
      toast.err(err.message);
    } finally {
      setBusy(false);
      if (inp.current) inp.current.value = '';
    }
  };

  return (
    <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
      <input className="input" style={{ flex: 1 }} value={value || ''} placeholder="URL ou faça upload…"
        onChange={(e) => onChange(e.target.value)} />
      {value && /\.(png|jpe?g|webp|gif|svg)$/i.test(value) === false && value.startsWith('/devops/api/cms/public/files/') && (
        <a href={value} target="_blank" rel="noopener noreferrer" className="btn" style={{ fontSize: '.8rem' }}>ver</a>
      )}
      <input ref={inp} type="file" hidden onChange={onFile} accept="image/png,image/jpeg,image/webp,image/gif,image/svg+xml,application/pdf" />
      <button type="button" className="btn" disabled={busy || !projectId} onClick={() => inp.current?.click()}>
        {busy ? '…' : 'Upload'}
      </button>
    </div>
  );
}
