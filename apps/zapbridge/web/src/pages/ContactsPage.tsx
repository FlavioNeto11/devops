import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, errorMessage } from '../api/client';
import { Spinner } from '../components/Spinner';
import { IconBack, IconSearch } from '../components/icons';

interface Contact {
  id: string;
  jid: string;
  name: string | null;
  pushName: string | null;
}

const AVATAR_COLORS = ['#E91E63', '#9C27B0', '#3F51B5', '#2196F3', '#00BCD4', '#009688', '#8BC34A', '#FF9800', '#FF5722'];
function avatarColor(jid: string): string {
  let h = 0;
  for (let i = 0; i < jid.length; i++) h = (h * 31 + jid.charCodeAt(i)) | 0;
  return AVATAR_COLORS[Math.abs(h) % AVATAR_COLORS.length];
}
function phoneOf(jid: string): string | null {
  return jid.endsWith('@s.whatsapp.net') ? `+${jid.split('@')[0].split(':')[0]}` : null;
}
function contactName(c: Contact): string {
  return c.name ?? c.pushName ?? phoneOf(c.jid) ?? c.jid.split('@')[0];
}

export function ContactsPage() {
  const nav = useNavigate();
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [opening, setOpening] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const { data } = await api.get('/contacts');
        setContacts(data.contacts);
      } catch (e) {
        setError(errorMessage(e));
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    return contacts
      .filter((c) => c.name || c.pushName)
      .filter((c) => !q || contactName(c).toLowerCase().includes(q) || (phoneOf(c.jid) ?? '').includes(q));
  }, [contacts, search]);

  const open = async (c: Contact) => {
    if (opening) return;
    setOpening(true);
    try {
      const { data } = await api.post('/chats/open', { jid: c.jid });
      nav('/chat/' + data.chat.id);
    } catch (e) {
      setError(errorMessage(e));
      setOpening(false);
    }
  };

  return (
    <div className="flex-1 flex flex-col min-h-0 bg-bg max-w-2xl mx-auto w-full">
      <div className="flex items-center gap-3 px-3 h-14 bg-header border-b border-line shrink-0" style={{ paddingTop: 'env(safe-area-inset-top)' }}>
        <button onClick={() => nav('/')} className="text-white" title="Voltar">
          <IconBack />
        </button>
        <div className="font-semibold text-white">Nova conversa</div>
      </div>

      <div className="px-3 py-2 shrink-0">
        <div className="flex items-center gap-2 bg-surfaceAlt rounded-2xl px-3 h-10">
          <IconSearch size={16} className="text-muted" />
          <input
            className="flex-1 bg-transparent outline-none text-[15px]"
            placeholder="Buscar nome ou número"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto">
        {loading ? (
          <div className="grid place-items-center py-16">
            <Spinner />
          </div>
        ) : visible.length === 0 ? (
          <div className="text-center text-muted px-6 py-16">
            {error ?? (search ? 'Nenhum contato encontrado' : 'Nenhum contato sincronizado')}
          </div>
        ) : (
          visible.map((c) => {
            const name = contactName(c);
            const phone = phoneOf(c.jid);
            const sub = c.pushName && c.pushName !== name ? c.pushName : phone;
            return (
              <button key={c.id} onClick={() => open(c)} className="w-full flex items-center gap-3 px-3 py-2.5 text-left hover:bg-surface">
                <div className="w-[46px] h-[46px] rounded-full grid place-items-center text-white font-bold shrink-0" style={{ background: avatarColor(c.jid) }}>
                  {name.trim().slice(0, 2).toUpperCase()}
                </div>
                <div className="flex-1 min-w-0 border-b border-line pb-1.5">
                  <div className="text-white truncate">{name}</div>
                  {sub && <div className="text-muted text-sm truncate">{sub}</div>}
                </div>
              </button>
            );
          })
        )}
      </div>

      {opening && (
        <div className="absolute inset-0 bg-black/20 grid place-items-center">
          <Spinner />
        </div>
      )}
    </div>
  );
}
