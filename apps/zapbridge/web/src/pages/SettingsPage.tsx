import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../store/auth.store';
import { useSessionStore } from '../store/session.store';
import { IconBack, IconChevronRight } from '../components/icons';

const STATUS_LABEL: Record<string, string> = {
  connected: 'Conectado',
  connecting: 'Conectando…',
  qr: 'Aguardando leitura do QR',
  disconnected: 'Desconectado',
  logged_out: 'Desvinculado',
};

export function SettingsPage() {
  const nav = useNavigate();
  const user = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.logout);
  const status = useSessionStore((s) => s.status);
  const phoneNumber = useSessionStore((s) => s.phoneNumber);
  const disconnect = useSessionStore((s) => s.disconnect);
  const connected = status === 'connected';

  const Row = ({ label, value, onClick, danger }: { label: string; value?: string; onClick?: () => void; danger?: boolean }) => (
    <button
      onClick={onClick}
      disabled={!onClick}
      className={`w-full flex items-center gap-3 px-4 py-3.5 text-left ${onClick ? 'hover:bg-surfaceAlt' : ''} ${danger ? 'text-danger' : 'text-white'}`}
    >
      <span className="flex-1">{label}</span>
      {value && <span className="text-muted text-sm">{value}</span>}
      {onClick && !danger && <IconChevronRight size={16} className="text-muted" />}
    </button>
  );

  return (
    <div className="flex-1 flex flex-col min-h-0 bg-bg max-w-2xl mx-auto w-full">
      <div className="flex items-center gap-3 px-3 h-14 bg-header border-b border-line shrink-0" style={{ paddingTop: 'env(safe-area-inset-top)' }}>
        <button onClick={() => nav('/')} className="text-white" title="Voltar">
          <IconBack />
        </button>
        <div className="font-semibold text-white">Configurações</div>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto">
        {/* Perfil */}
        <div className="flex items-center gap-4 px-4 py-5">
          <div className="w-16 h-16 rounded-full bg-primary/20 grid place-items-center text-primary text-2xl font-bold">
            {(user?.displayName ?? '?').slice(0, 1).toUpperCase()}
          </div>
          <div className="min-w-0">
            <div className="text-lg font-semibold text-white truncate">{user?.displayName}</div>
            <div className="text-muted text-sm truncate">{user?.email}</div>
          </div>
        </div>

        {/* WhatsApp */}
        <div className="mt-2 border-t border-line">
          <div className="px-4 pt-3 pb-1 text-xs uppercase tracking-wide text-muted">WhatsApp</div>
          <Row label="Status" value={STATUS_LABEL[status] ?? status} />
          {connected && phoneNumber && <Row label="Número" value={phoneNumber} />}
          {connected ? (
            <Row label="Desconectar aparelho" danger onClick={() => disconnect()} />
          ) : (
            <Row label="Conectar WhatsApp" onClick={() => nav('/connect')} />
          )}
        </div>

        {/* IA */}
        <div className="mt-2 border-t border-line">
          <div className="px-4 pt-3 pb-1 text-xs uppercase tracking-wide text-muted">Inteligência (IA)</div>
          <Row label="Assistente" onClick={() => nav('/assistant')} />
        </div>

        {/* Conta */}
        <div className="mt-2 border-t border-line">
          <Row label="Sair da conta" danger onClick={() => logout()} />
        </div>

        <div className="text-center text-muted text-[11px] px-6 py-8">
          ZapBridge — seu WhatsApp na web. Uso legítimo: apenas a sua própria conta.
        </div>
      </div>
    </div>
  );
}
