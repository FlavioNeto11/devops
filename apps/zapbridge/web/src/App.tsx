import { useEffect } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { useAuthStore } from './store/auth.store';
import { useSessionStore } from './store/session.store';
import { useChatsStore } from './store/chats.store';
import { LoginPage } from './pages/LoginPage';
import { RegisterPage } from './pages/RegisterPage';
import { Home } from './pages/Home';
import { ComingSoonPage } from './pages/ComingSoonPage';
import { ConnectPage } from './pages/ConnectPage';
import { ContactsPage } from './pages/ContactsPage';
import { SettingsPage } from './pages/SettingsPage';
import { AssistantPage } from './pages/AssistantPage';
import { Spinner } from './components/Spinner';
import { isDevPreview } from './dev/devPreview';

export default function App() {
  const bootstrapping = useAuthStore((s) => s.bootstrapping);
  const user = useAuthStore((s) => s.user);
  const bootstrap = useAuthStore((s) => s.bootstrap);

  // Revalida o token salvo ao abrir (seed de dev já rodou no main.tsx).
  useEffect(() => {
    if (isDevPreview()) return;
    bootstrap();
  }, []);

  // Ao autenticar, liga os listeners de tempo real (sessão + chats).
  useEffect(() => {
    if (!user || isDevPreview()) return;
    useSessionStore.getState().bindRealtime();
    useChatsStore.getState().bindRealtime();
  }, [user]);

  // Título dinâmico da aba (contador de conversas não lidas).
  const unreadCount = useChatsStore((s) => s.chats.filter((c) => c.unreadCount > 0).length);
  useEffect(() => {
    document.title = unreadCount > 0 ? `(${unreadCount}) ZapBridge` : 'ZapBridge';
  }, [unreadCount]);

  if (bootstrapping) {
    return (
      <div className="flex-1 grid place-items-center bg-bg">
        <Spinner size={32} />
      </div>
    );
  }

  return (
    <Routes>
      {!user ? (
        <>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/register" element={<RegisterPage />} />
          <Route path="*" element={<Navigate to="/login" replace />} />
        </>
      ) : (
        <>
          <Route path="/" element={<Home />} />
          <Route path="/chat/:chatId" element={<Home />} />
          <Route path="/connect" element={<ConnectPage />} />
          <Route path="/contacts" element={<ContactsPage />} />
          <Route path="/settings" element={<SettingsPage />} />
          <Route path="/assistant" element={<AssistantPage />} />
          <Route path="/mais/:tab" element={<ComingSoonPage />} />
          <Route path="/soon" element={<ComingSoonPage />} />
          <Route path="/login" element={<Navigate to="/" replace />} />
          <Route path="/register" element={<Navigate to="/" replace />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </>
      )}
    </Routes>
  );
}
