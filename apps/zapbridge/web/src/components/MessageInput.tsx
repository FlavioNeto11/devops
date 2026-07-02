import { useEffect, useRef, useState, KeyboardEvent } from 'react';

const REWRITE_MODES: [string, string][] = [
  ['melhorar', '✨ Melhorar'],
  ['encurtar', '✂️ Encurtar'],
  ['formalizar', '🎩 Formalizar'],
  ['traduzir', '🌐 Traduzir'],
];

type MediaType = 'image' | 'video' | 'audio' | 'document';
function typeOf(file: File): MediaType {
  if (file.type.startsWith('image/')) return 'image';
  if (file.type.startsWith('video/')) return 'video';
  if (file.type.startsWith('audio/')) return 'audio';
  return 'document';
}

export function MessageInput({
  onSend,
  onAttach,
  onSendAudio,
  onTyping,
  disabled,
  suggestions,
  onClearSuggestions,
  aiEnabled,
  onRewrite,
}: {
  onSend: (text: string) => void;
  onAttach: (file: File, type: MediaType, name: string) => void;
  onSendAudio?: (blob: Blob, name: string) => void;
  onTyping?: () => void;
  disabled?: boolean;
  suggestions?: string[];
  onClearSuggestions?: () => void;
  aiEnabled?: boolean;
  onRewrite?: (text: string, mode: string) => Promise<string[]>;
}) {
  const [value, setValue] = useState('');
  const [menuOpen, setMenuOpen] = useState(false);
  const [recording, setRecording] = useState(false);
  const [recSecs, setRecSecs] = useState(0);
  const [rewriteOpen, setRewriteOpen] = useState(false);
  const [rewriteBusy, setRewriteBusy] = useState(false);
  const [variants, setVariants] = useState<string[]>([]);
  const fileRef = useRef<HTMLInputElement>(null);
  const docRef = useRef<HTMLInputElement>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<BlobPart[]>([]);
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => () => { if (tickRef.current) clearInterval(tickRef.current); }, []);

  const submit = () => {
    const t = value.trim();
    if (!t) return;
    onSend(t);
    setValue('');
    onClearSuggestions?.();
  };

  const onFiles = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (f) onAttach(f, typeOf(f), f.name);
    e.target.value = '';
    setMenuOpen(false);
  };

  const runRewrite = async (mode: string) => {
    if (!onRewrite || !value.trim()) return;
    setRewriteBusy(true);
    setVariants([]);
    try {
      setVariants(await onRewrite(value.trim(), mode));
    } catch {
      setVariants([]);
    } finally {
      setRewriteBusy(false);
    }
  };

  const toggleRecord = async () => {
    if (!onSendAudio) return;
    if (recording) {
      recorderRef.current?.stop();
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mr = new MediaRecorder(stream);
      chunksRef.current = [];
      mr.ondataavailable = (e) => e.data.size > 0 && chunksRef.current.push(e.data);
      mr.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: mr.mimeType || 'audio/webm' });
        stream.getTracks().forEach((t) => t.stop());
        if (tickRef.current) clearInterval(tickRef.current);
        setRecording(false);
        setRecSecs(0);
        if (blob.size > 0) onSendAudio(blob, 'audio.webm');
      };
      recorderRef.current = mr;
      mr.start();
      setRecSecs(0);
      tickRef.current = setInterval(() => setRecSecs((s) => s + 1), 1000);
      setRecording(true);
    } catch {
      setRecording(false);
    }
  };

  const canRecord = !!onSendAudio;
  const showSend = value.trim().length > 0 || !canRecord;
  const showRewrite = !!aiEnabled && !!onRewrite && value.trim().length > 0 && !recording;
  const mmss = `${String(Math.floor(recSecs / 60)).padStart(2, '0')}:${String(recSecs % 60).padStart(2, '0')}`;

  return (
    <div className="shrink-0">
      <input ref={fileRef} type="file" accept="image/*,video/*" hidden onChange={onFiles} />
      <input ref={docRef} type="file" hidden onChange={onFiles} />

      {!!suggestions?.length && !recording && (
        <div className="flex items-center gap-2 px-2 pt-2 bg-header">
          <span>✨</span>
          <div className="flex gap-2 overflow-x-auto no-scrollbar">
            {suggestions.slice(0, 3).map((s, i) => (
              <button
                key={i}
                onClick={() => {
                  setValue(s);
                  onClearSuggestions?.();
                }}
                className="shrink-0 max-w-[240px] text-left text-[13px] bg-surfaceAlt border border-primary/60 rounded-2xl px-3 py-2 line-clamp-2"
              >
                {s}
              </button>
            ))}
          </div>
          <button onClick={onClearSuggestions} className="text-muted text-lg px-1">×</button>
        </div>
      )}

      {rewriteOpen && (
        <div className="bg-surfaceAlt border-t border-line p-2">
          <div className="flex flex-wrap gap-2">
            {REWRITE_MODES.map(([mode, label]) => (
              <button key={mode} onClick={() => runRewrite(mode)} className="bg-surface rounded px-3 py-2 text-primary text-[13px] font-semibold">
                {label}
              </button>
            ))}
            <button onClick={() => { setRewriteOpen(false); setVariants([]); }} className="bg-surface rounded px-3 py-2 text-muted text-[13px]">
              Fechar
            </button>
          </div>
          {rewriteBusy && <div className="text-muted text-sm mt-2">Reescrevendo…</div>}
          {variants.map((v, i) => (
            <button key={i} onClick={() => { setValue(v); setRewriteOpen(false); setVariants([]); }} className="block w-full text-left bg-surface rounded p-3 mt-2 text-sm text-white">
              {v}
            </button>
          ))}
        </div>
      )}

      <div className="flex items-end gap-2 p-2 bg-header border-t border-line" style={{ paddingBottom: 'max(env(safe-area-inset-bottom), 8px)' }}>
        {!recording && (
          <div className="relative">
            <button onClick={() => setMenuOpen((v) => !v)} disabled={disabled} className="w-10 h-10 grid place-items-center text-muted text-2xl">＋</button>
            {menuOpen && (
              <div className="absolute bottom-12 left-0 bg-surfaceAlt rounded-xl py-1 shadow-lg w-44 z-10">
                <button onClick={() => fileRef.current?.click()} className="block w-full text-left px-4 py-2.5 hover:bg-surface text-white text-sm">📷 Foto ou vídeo</button>
                <button onClick={() => docRef.current?.click()} className="block w-full text-left px-4 py-2.5 hover:bg-surface text-white text-sm">📄 Documento</button>
              </div>
            )}
          </div>
        )}

        {recording ? (
          <div className="flex-1 flex items-center gap-2 bg-surface rounded-2xl px-3 min-h-[42px]">
            <span className="w-2.5 h-2.5 rounded-full bg-danger" />
            <span className="text-white text-[15px] tabular-nums">{mmss}</span>
            <span className="text-muted text-sm">Gravando áudio…</span>
          </div>
        ) : (
          <textarea
            className="flex-1 resize-none bg-surface rounded-2xl px-4 py-2.5 min-h-[42px] max-h-[120px] text-[15px] outline-none"
            placeholder="Mensagem"
            rows={1}
            value={value}
            disabled={disabled}
            onChange={(e) => {
              setValue(e.target.value);
              onTyping?.();
            }}
            onKeyDown={(e: KeyboardEvent<HTMLTextAreaElement>) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                submit();
              }
            }}
          />
        )}

        {showRewrite && (
          <button onClick={() => setRewriteOpen((v) => !v)} disabled={disabled} className="w-11 h-11 rounded-full bg-surfaceAlt grid place-items-center text-lg shrink-0">✨</button>
        )}
        {showSend ? (
          <button onClick={submit} disabled={disabled} className="w-11 h-11 rounded-full bg-primary text-bg grid place-items-center shrink-0 text-lg">➤</button>
        ) : (
          <button onClick={toggleRecord} disabled={disabled} className={`w-11 h-11 rounded-full grid place-items-center shrink-0 text-lg ${recording ? 'bg-danger text-white' : 'bg-primary text-bg'}`}>
            {recording ? '■' : '🎤'}
          </button>
        )}
      </div>
    </div>
  );
}
