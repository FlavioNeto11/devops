import React, { useEffect, useRef, useState } from 'react';
import Icon from '../Icon.jsx';
import { useToast } from '../ToastProvider.jsx';

/**
 * AiAssist — caixa de comando de IA reutilizável (painel de seção, painel do
 * site, drawer do modo avançado). O usuário descreve a mudança; `onRun` chama o
 * endpoint correspondente do pm-api (a IA recebe o site INTEIRO + os pedidos
 * originais de criação como contexto). Sem IA configurada, o backend responde
 * 503 e a mensagem aparece aqui — nada quebra.
 */
export default function AiAssist({ onRun, autoFocus = false, placeholder }) {
  const toast = useToast();
  const ref = useRef(null);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => { if (autoFocus) ref.current?.focus(); }, [autoFocus]);

  const run = async () => {
    const instruction = text.trim();
    if (!instruction || busy) return;
    setBusy(true);
    try {
      await onRun(instruction);
      setText('');
      toast.ok('Pronto — alteração aplicada pela IA.');
    } catch (e) {
      toast.err(e.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="ai-assist" style={{ marginTop: 14, padding: 12, border: '1px dashed var(--accent, #6366f1)', borderRadius: 10 }}>
      <span className="field__label" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <Icon name="sparkles" size={14} /> Pedir à IA
      </span>
      <textarea
        ref={ref}
        className="input"
        rows={2}
        style={{ marginTop: 6, resize: 'vertical' }}
        value={text}
        placeholder={placeholder || 'ex.: deixe o tom mais formal · troque os cards para focar em resultados · resuma o texto pela metade'}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); run(); } }}
      />
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 8 }}>
        <button className="btn btn--primary" disabled={busy || !text.trim()} onClick={run}>
          {busy ? 'Aplicando…' : 'Aplicar com IA'}
        </button>
        <span className="muted" style={{ fontSize: '.75rem' }}>usa o site inteiro e o briefing original como contexto</span>
      </div>
    </div>
  );
}
