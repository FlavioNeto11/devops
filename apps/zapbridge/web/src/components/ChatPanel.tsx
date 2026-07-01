import { useNavigate } from 'react-router-dom';
import { IconBack } from './icons';

// Placeholder da Fase 3 — o painel de mensagens real chega na Fase 4.
export function ChatPanel({ chatId }: { chatId?: string }) {
  const nav = useNavigate();

  if (!chatId) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center bg-bg text-center px-8">
        <div className="text-2xl font-bold text-white/80">ZapBridge Web</div>
        <div className="text-muted mt-2 max-w-sm">
          Selecione uma conversa para começar. O painel de mensagens chega na Fase 4.
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col h-full min-h-0 bg-bg">
      <div
        className="flex items-center gap-3 px-3 h-14 bg-header border-b border-line shrink-0"
        style={{ paddingTop: 'env(safe-area-inset-top)' }}
      >
        <button onClick={() => nav('/')} className="text-white md:hidden" title="Voltar">
          <IconBack />
        </button>
        <div className="font-semibold text-white truncate">Conversa {chatId.slice(0, 8)}…</div>
      </div>
      <div className="flex-1 grid place-items-center text-muted">Mensagens chegam na Fase 4.</div>
    </div>
  );
}
