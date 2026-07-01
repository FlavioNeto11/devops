import { useAuthStore } from '../store/auth.store';

// Placeholder da Fase 2 — substituído pelo shell + lista de conversas na Fase 3.
export function HomePage() {
  const user = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.logout);
  return (
    <div className="flex-1 flex flex-col items-center justify-center gap-3 bg-bg text-center px-6">
      <div className="text-2xl font-bold text-primary">Logado ✅</div>
      <div className="text-muted">
        {user?.displayName} — {user?.email}
      </div>
      <div className="text-muted text-sm max-w-xs">
        Shell responsivo + lista de conversas chegam na Fase 3.
      </div>
      <button onClick={() => logout()} className="mt-2 rounded-lg bg-surface px-5 py-2 hover:bg-surfaceAlt">
        Sair
      </button>
    </div>
  );
}
