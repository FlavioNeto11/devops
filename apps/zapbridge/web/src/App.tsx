import { useEffect } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { useAuthStore } from './store/auth.store';
import { useSessionStore } from './store/session.store';
import { useChatsStore } from './store/chats.store';
import { LoginPage } from './pages/LoginPage';
import { RegisterPage } from './pages/RegisterPage';
import { HomePage } from './pages/HomePage';
import { Spinner } from './components/Spinner';

export default function App() {
  const bootstrapping = useAuthStore((s) => s.bootstrapping);
  const user = useAuthStore((s) => s.user);
  const bootstrap = useAuthStore((s) => s.bootstrap);

  // Revalida o token salvo ao abrir.
  useEffect(() => {
    bootstrap();
  }, []);

  // Ao autenticar, liga os listeners de tempo real (sessão + chats).
  useEffect(() => {
    if (user) {
      useSessionStore.getState().bindRealtime();
      useChatsStore.getState().bindRealtime();
    }
  }, [user]);

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
          <Route path="/" element={<HomePage />} />
          <Route path="/login" element={<Navigate to="/" replace />} />
          <Route path="/register" element={<Navigate to="/" replace />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </>
      )}
    </Routes>
  );
}
