import { useState, FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { useAuthStore } from '../store/auth.store';

export function RegisterPage() {
  const register = useAuthStore((s) => s.register);
  const loading = useAuthStore((s) => s.loading);
  const error = useAuthStore((s) => s.error);
  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    await register(email.trim(), password, displayName.trim());
  };

  return (
    <div className="flex-1 flex items-center justify-center px-6 bg-bg">
      <form onSubmit={submit} className="w-full max-w-sm">
        <div className="text-center mb-8">
          <div className="text-3xl font-extrabold text-primary">Criar conta</div>
        </div>

        <label className="block text-sm text-muted mb-1">Nome</label>
        <input
          className="w-full mb-4 rounded-xl bg-surface px-4 py-3 outline-none focus:ring-2 focus:ring-primary/50"
          value={displayName}
          onChange={(e) => setDisplayName(e.target.value)}
          placeholder="Seu nome"
        />

        <label className="block text-sm text-muted mb-1">E-mail</label>
        <input
          className="w-full mb-4 rounded-xl bg-surface px-4 py-3 outline-none focus:ring-2 focus:ring-primary/50"
          type="email"
          autoComplete="username"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="voce@email.com"
        />

        <label className="block text-sm text-muted mb-1">Senha</label>
        <input
          className="w-full mb-2 rounded-xl bg-surface px-4 py-3 outline-none focus:ring-2 focus:ring-primary/50"
          type="password"
          autoComplete="new-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="mínimo 6 caracteres"
        />

        {error && <div className="text-danger text-sm mb-3">{error}</div>}

        <button
          disabled={loading || !email || !password || !displayName}
          className="w-full mt-3 rounded-xl bg-primary text-bg font-bold py-3 disabled:opacity-50"
        >
          {loading ? 'Criando…' : 'Criar conta'}
        </button>

        <div className="text-center text-sm text-muted mt-6">
          Já tem conta?{' '}
          <Link to="/login" className="text-primary font-medium">
            Entrar
          </Link>
        </div>
      </form>
    </div>
  );
}
