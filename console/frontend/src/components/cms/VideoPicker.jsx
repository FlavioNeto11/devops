import React, { useRef, useState } from 'react';
import { Clapperboard, FolderOpen, Upload } from 'lucide-react';
import { pmCmsUpload } from '../../api.js';
import { useToast } from '../ToastProvider.jsx';
import { MediaLibrary } from './MediaPicker.jsx';

/**
 * VideoPicker — campo de vídeo do CMS (1 string, retrocompatível).
 * Aceita: ID do YouTube (11 chars), URL do YouTube (normalizada para o ID ao
 * colar) ou URL de arquivo enviado. Espelha apps/anarabottini/src/lib/video.ts
 * (resolveVideo) — manter as duas cópias em sincronia.
 */
const YT_ID = /^[A-Za-z0-9_-]{11}$/;
const YT_URL = /(?:youtube(?:-nocookie)?\.com\/(?:watch\?(?:.*&)?v=|embed\/|shorts\/|live\/)|youtu\.be\/)([A-Za-z0-9_-]{11})/i;
const VIDEO_ACCEPT = 'video/mp4,video/webm,video/quicktime';
const VIDEO_MAX = 50 * 1024 * 1024; // espelha o pm-api (vídeo até 50 MB)

function resolveVideo(v) {
  if (typeof v !== 'string') return null;
  const s = v.trim();
  if (!s) return null;
  if (YT_ID.test(s)) return { kind: 'youtube', id: s };
  const m = s.match(YT_URL);
  if (m) return { kind: 'youtube', id: m[1] };
  if (s.startsWith('/') || /^https?:\/\//i.test(s)) return { kind: 'file', url: s };
  return null;
}

export default function VideoPicker({ projectId, value, onChange }) {
  const toast = useToast();
  const inp = useRef(null);
  const [busy, setBusy] = useState(false);
  const [lib, setLib] = useState(false);
  const v = resolveVideo(value);

  // colar URL do YouTube → grava só o ID; demais valores ficam como digitados.
  const onInput = (raw) => {
    const m = (raw || '').match(YT_URL);
    onChange(m ? m[1] : raw);
  };

  const onFile = async (e) => {
    const file = e.target.files?.[0];
    if (inp.current) inp.current.value = '';
    if (!file) return;
    if (file.size > VIDEO_MAX) { toast.err(`Vídeo excede o limite de ${VIDEO_MAX / 1024 / 1024} MB.`); return; }
    setBusy(true);
    try { const r = await pmCmsUpload(projectId, file); onChange(r.url); toast.ok('Vídeo enviado.'); }
    catch (err) { toast.err(err.message); }
    finally { setBusy(false); }
  };

  return (
    <div className="mp">
      <div className="mp-preview">
        {v?.kind === 'youtube' && (
          <a href={`https://www.youtube.com/watch?v=${v.id}`} target="_blank" rel="noopener noreferrer" title="Abrir no YouTube">
            <img src={`https://img.youtube.com/vi/${v.id}/hqdefault.jpg`} alt="" className="mp-preview__img" />
          </a>
        )}
        {v?.kind === 'file' && <video src={v.url} controls preload="metadata" className="mp-preview__img" />}
        {!v && <span className="mp-preview__none"><Clapperboard size={16} style={{ verticalAlign: '-3px' }} /> Nenhum vídeo</span>}
      </div>
      <input className="input" value={value || ''} placeholder="Cole a URL/ID do YouTube, ou envie um arquivo…"
        onChange={(e) => onInput(e.target.value)} />
      <div className="mp-actions">
        <input ref={inp} type="file" hidden accept={VIDEO_ACCEPT} onChange={onFile} />
        <button type="button" className="btn" disabled={busy || !projectId} onClick={() => inp.current?.click()}>
          <Upload size={15} /> {busy ? 'Enviando…' : 'Upload'}
        </button>
        <button type="button" className="btn" disabled={!projectId} onClick={() => setLib(true)}>
          <FolderOpen size={15} /> Biblioteca
        </button>
        {value && <button type="button" className="btn" onClick={() => onChange('')}>Remover</button>}
      </div>
      {lib && <MediaLibrary projectId={projectId} filter="video/" onClose={() => setLib(false)} onPick={(url) => { onChange(url); setLib(false); }} />}
    </div>
  );
}
