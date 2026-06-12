import React, { useCallback, useEffect, useRef, useState } from 'react';
import Modal from '../Modal.jsx';
import ConfirmDialog from '../ConfirmDialog.jsx';
import Icon from '../Icon.jsx';
import { useToast } from '../ToastProvider.jsx';
import { pmCmsFiles, pmCmsUpload, pmCmsDeleteFile, pmMe } from '../../api.js';

/**
 * MediaPicker — seleção VISUAL de mídia (substitui colar URL/caminho).
 * Preview (thumbnail de imagem / ícone+nome de documento) + Upload + biblioteca
 * (grid dos arquivos do projeto com thumbnails) + remover. Grava a URL pública
 * completa (/devops/api/cms/public/files/<id>), compatível com mediaUrl().
 */
const ACCEPT = [
  'image/png', 'image/jpeg', 'image/webp', 'image/gif', 'image/svg+xml', 'application/pdf',
  'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-powerpoint', 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'text/csv', 'text/plain', 'application/zip',
].join(',');

const isImage = (s) => /\.(png|jpe?g|webp|gif|svg)(\?|$)/i.test(s || '') || /^image\//.test(s || '');
const baseName = (url) => { try { return decodeURIComponent((url || '').split('/').pop() || 'arquivo'); } catch { return 'arquivo'; } };

export default function MediaPicker({ projectId, value, onChange }) {
  const toast = useToast();
  const inp = useRef(null);
  const [busy, setBusy] = useState(false);
  const [lib, setLib] = useState(false);

  const onFile = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setBusy(true);
    try { const r = await pmCmsUpload(projectId, file); onChange(r.url); toast.ok('Arquivo enviado.'); }
    catch (err) { toast.err(err.message); }
    finally { setBusy(false); if (inp.current) inp.current.value = ''; }
  };

  return (
    <div className="mp">
      <div className="mp-preview">
        {value
          ? (isImage(value)
            ? <img src={value} alt="" className="mp-preview__img" />
            : <span className="mp-preview__doc"><Icon name="file-text" size={18} /> {baseName(value)}</span>)
          : <span className="mp-preview__none">Nenhum arquivo</span>}
      </div>
      <input className="input" value={value || ''} placeholder="URL, ou faça upload / escolha da biblioteca…"
        onChange={(e) => onChange(e.target.value)} />
      <div className="mp-actions">
        <input ref={inp} type="file" hidden accept={ACCEPT} onChange={onFile} />
        <button type="button" className="btn" disabled={busy || !projectId} onClick={() => inp.current?.click()}>
          <Icon name="plus" size={15} /> {busy ? 'Enviando…' : 'Upload'}
        </button>
        <button type="button" className="btn" disabled={!projectId} onClick={() => setLib(true)}>
          <Icon name="grid" size={15} /> Biblioteca
        </button>
        {value && <button type="button" className="btn" onClick={() => onChange('')}>Remover</button>}
      </div>
      {lib && <MediaLibrary projectId={projectId} onClose={() => setLib(false)} onPick={(url) => { onChange(url); setLib(false); }} />}
    </div>
  );
}

/** Biblioteca de mídia em DOIS níveis (modal com grid): arquivos DESTE portal +
 *  biblioteca PÚBLICA da plataforma (reutilizável por qualquer portal; gerida por
 *  admin). `filter` = prefixo de mime (ex.: 'video/') — reusada pelo VideoPicker. */
const SCOPE_TABS = [
  { key: 'all', label: 'Todos disponíveis' },
  { key: 'project', label: 'Este portal' },
  { key: 'global', label: 'Biblioteca pública' },
];

export function MediaLibrary({ projectId, onClose, onPick, filter }) {
  const toast = useToast();
  const inp = useRef(null);
  const [files, setFiles] = useState(null);
  const [confirmDel, setConfirmDel] = useState(null);
  const [scope, setScope] = useState('all');
  const [isAdmin, setIsAdmin] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => { pmMe().then((m) => setIsAdmin(!!m?.isAdmin)).catch(() => {}); }, []);

  const load = useCallback(async () => {
    try { setFiles((await pmCmsFiles(projectId, scope)) || []); }
    catch (e) { toast.err(e.message); setFiles([]); }
  }, [projectId, scope, toast]);
  useEffect(() => { load(); }, [load]);

  // Upload direto para a biblioteca pública (admin): qualquer portal poderá usar.
  const onGlobalFile = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setBusy(true);
    try { await pmCmsUpload(projectId, file, 'global'); toast.ok('Arquivo publicado na biblioteca pública.'); await load(); }
    catch (err) { toast.err(err.message); }
    finally { setBusy(false); if (inp.current) inp.current.value = ''; }
  };

  const shown = files === null ? null : (filter ? files.filter((f) => (f.mime || '').startsWith(filter)) : files);

  return (
    <Modal title="Biblioteca de mídia" size="lg" onClose={onClose}>
      <div className="toolbar" style={{ marginBottom: 12, gap: 8, display: 'flex', alignItems: 'center', flexWrap: 'wrap' }}>
        <div className="meta__pills" role="tablist" aria-label="Escopo da biblioteca">
          {SCOPE_TABS.map((t) => (
            <button key={t.key} className={'pill' + (scope === t.key ? ' pill--active' : '')} role="tab"
              aria-selected={scope === t.key} onClick={() => setScope(t.key)}>{t.label}</button>
          ))}
        </div>
        {isAdmin && (
          <span style={{ marginLeft: 'auto' }}>
            <input ref={inp} type="file" hidden accept={ACCEPT} onChange={onGlobalFile} />
            <button type="button" className="btn" disabled={busy} title="Disponível para todos os portais"
              onClick={() => inp.current?.click()}>
              <Icon name="plus" size={15} /> {busy ? 'Enviando…' : 'Enviar à biblioteca pública'}
            </button>
          </span>
        )}
      </div>
      {shown === null ? (
        <p className="muted">Carregando…</p>
      ) : !shown.length ? (
        <p className="muted">
          {scope === 'global'
            ? 'A biblioteca pública ainda não tem arquivos deste tipo. Administradores podem publicar materiais reutilizáveis (logos, fundos, ícones).'
            : (filter ? 'Nenhum arquivo desse tipo enviado neste portal ainda. Use “Upload” no campo para enviar o primeiro.' : 'Nenhum arquivo enviado neste portal ainda. Use “Upload” no campo para enviar o primeiro.')}
        </p>
      ) : (
        <div className="cards mp-lib">
          {shown.map((f) => (
            <div key={f.id} className="mp-libitem">
              <button type="button" className="mp-libitem__pick" title={f.filename} onClick={() => onPick(f.url)}>
                {isImage(f.mime)
                  ? <img src={f.url} alt="" loading="lazy" />
                  : (f.mime || '').startsWith('video/')
                    ? <video src={f.url} preload="metadata" muted className="mp-libitem__video" />
                    : <span className="mp-libitem__doc"><Icon name="file-text" size={26} /></span>}
                <span className="mp-libitem__name">
                  {f.scope === 'global' && <span className="badge badge-accent" style={{ marginRight: 4 }}>pública</span>}
                  {f.filename}
                </span>
              </button>
              {(f.scope !== 'global' || isAdmin) && (
                <button type="button" className="icon-btn mp-libitem__del" title={f.scope === 'global' ? 'Excluir da biblioteca pública (afeta todos os portais)' : 'Excluir arquivo'} onClick={() => setConfirmDel(f)}>
                  <Icon name="trash2" size={15} />
                </button>
              )}
            </div>
          ))}
        </div>
      )}
      {confirmDel && (
        <ConfirmDialog
          title="Excluir arquivo"
          message={confirmDel.scope === 'global'
            ? `Excluir "${confirmDel.filename}" da biblioteca PÚBLICA? Qualquer portal que use este arquivo ficará sem a mídia.`
            : `Excluir "${confirmDel.filename}"? Seções que usam este arquivo ficarão sem a mídia.`}
          confirmLabel="Excluir" danger
          onClose={() => setConfirmDel(null)}
          onConfirm={async () => { await pmCmsDeleteFile(confirmDel.id); toast.ok('Arquivo excluído.'); setConfirmDel(null); await load(); }}
        />
      )}
    </Modal>
  );
}
