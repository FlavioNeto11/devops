import { useParams, useNavigate } from 'react-router-dom';
import { WhatsAppTabBar, TabKey } from '../components/WhatsAppTabBar';
import { IconBack } from '../components/icons';

const LABELS: Record<string, string> = {
  updates: 'Atualizações',
  calls: 'Ligações',
  communities: 'Comunidades',
  you: 'Você',
};
const TAB_KEYS = ['updates', 'calls', 'communities', 'you'];

export function ComingSoonPage() {
  const { tab } = useParams();
  const nav = useNavigate();
  const isTab = !!tab && TAB_KEYS.includes(tab);
  const title = (tab && LABELS[tab]) || 'Em breve';

  return (
    <div className="flex-1 flex flex-col min-h-0 bg-bg">
      <div className="px-4 pt-3 shrink-0" style={{ paddingTop: 'max(env(safe-area-inset-top), 12px)' }}>
        {!isTab && (
          <button onClick={() => nav('/')} className="text-white mb-2" title="Voltar">
            <IconBack />
          </button>
        )}
        <h1 className="text-[30px] font-extrabold text-white">{title}</h1>
      </div>
      <div className="flex-1 grid place-items-center text-center px-8">
        <div>
          <div className="text-xl font-bold text-white">Em breve</div>
          <div className="text-muted mt-1 max-w-xs">Este recurso ainda não está disponível.</div>
        </div>
      </div>
      {isTab && <WhatsAppTabBar active={tab as TabKey} />}
    </div>
  );
}
