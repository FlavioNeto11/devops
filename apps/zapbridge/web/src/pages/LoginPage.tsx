import { useState, FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { useAuthStore } from '../store/auth.store';

export function LoginPage() {
  const login = useAuthStore((s) => s.login);
  const loading = useAuthStore((s) => s.loading);
  const error = useAuthStore((s) => s.error);
  const sessionExpired = useAuthStore((s) => s.sessionExpired);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    await login(email.trim(), password);
  };

  return (
    <div className="flex-1 flex items-center justify-center px-6 bg-bg">
      <form onSubmit={submit} className="w-full max-w-sm">
        <div className="text-center mb-8">
          <div className="text-4xl font-extrabold text-primary tracking-tight">ZapBridge</div>
          <div className="text-muted mt-1 text-sm">Seu WhatsApp na web</div>
        </div>

        {sessionExpired && (
          <div
            role="status"
            className="mb-4 rounded-xl bg-surface border border-line px-4 py-3 text-sm text-white"
          >
            Sua sessão expirou. Entre novamente para continuar.
          </div>
        )}

        <label htmlFor="login-email" className="block text-sm text-muted mb-1">E-mail</label>
        <input
          id="login-email"
          className="w-full mb-4 rounded-xl bg-surface px-4 py-3 outline-none focus:ring-2 focus:ring-primary/50"
          type="email"
          autoComplete="username"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="voce@email.com"
        />

        <label htmlFor="login-password" className="block text-sm text-muted mb-1">Senha</label>
        <input
          id="login-password"
          className="w-full mb-2 rounded-xl bg-surface px-4 py-3 outline-none focus:ring-2 focus:ring-primary/50"
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="••••••••"
        />

        {error && <div className="text-danger text-sm mb-3">{error}</div>}

        <button
          disabled={loading || !email || !password}
          className="w-full mt-3 rounded-xl bg-primary text-bg font-bold py-3 disabled:opacity-50 transition-opacity"
        >
          {loading ? 'Entrando…' : 'Entrar'}
        </button>

        <div className="text-center text-sm text-muted mt-6">
          Não tem conta?{' '}
          <Link to="/register" className="text-primary font-medium">
            Criar conta
          </Link>
        </div>
      </form>
    </div>
  );
}
