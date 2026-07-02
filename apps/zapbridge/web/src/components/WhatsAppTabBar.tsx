import { useNavigate } from 'react-router-dom';
import { IconUpdates, IconCalls, IconCommunities, IconChats, IconPerson } from './icons';

export type TabKey = 'updates' | 'calls' | 'communities' | 'chats' | 'you';

const TABS: { key: TabKey; label: string }[] = [
  { key: 'updates', label: 'Atualizações' },
  { key: 'calls', label: 'Ligações' },
  { key: 'communities', label: 'Comunidades' },
  { key: 'chats', label: 'Conversas' },
  { key: 'you', label: 'Você' },
];

function TabIcon({ tab, active }: { tab: TabKey; active: boolean }) {
  const cls = active ? 'text-primary' : 'text-muted';
  switch (tab) {
    case 'updates':
      return <IconUpdates className={cls} />;
    case 'calls':
      return <IconCalls className={cls} />;
    case 'communities':
      return <IconCommunities className={cls} />;
    case 'chats':
      return <IconChats className={cls} filled={active} />;
    case 'you':
      return <IconPerson className={cls} />;
  }
}

export function WhatsAppTabBar({ active, unread = 0 }: { active: TabKey; unread?: number }) {
  const nav = useNavigate();
  const go = (k: TabKey) => (k === 'chats' ? nav('/') : k === 'you' ? nav('/settings') : nav('/mais/' + k));

  return (
    <nav
      className="flex border-t border-line bg-header pt-2"
      style={{ paddingBottom: 'max(env(safe-area-inset-bottom), 8px)' }}
    >
      {TABS.map((t) => {
        const activeT = t.key === active;
        return (
          <button key={t.key} onClick={() => go(t.key)} className="flex-1 flex flex-col items-center gap-0.5">
            <div className="relative">
              <TabIcon tab={t.key} active={activeT} />
              {t.key === 'chats' && unread > 0 && (
                <span className="absolute -top-1 -right-2 min-w-[17px] h-[17px] px-1 rounded-full bg-primary text-bg text-[10px] font-extrabold grid place-items-center">
                  {unread > 99 ? '99+' : unread}
                </span>
              )}
            </div>
            <span className={`text-[10.5px] font-medium ${activeT ? 'text-primary' : 'text-muted'}`}>{t.label}</span>
          </button>
        );
      })}
    </nav>
  );
}
