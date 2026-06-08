import { useEffect, useState } from 'react';
import { Sun, Moon } from 'lucide-react';
import { cn } from '../lib/utils';

type Theme = 'light' | 'dark';

function readInitial(): Theme {
  if (typeof document !== 'undefined' && document.documentElement.classList.contains('dark')) return 'dark';
  try {
    return localStorage.getItem('rmamb-theme') === 'dark' ? 'dark' : 'light';
  } catch {
    return 'light';
  }
}

/** Botão de alternância de tema. Padrão: CLARO. Persiste em localStorage ('rmamb-theme'). */
export default function ThemeToggle({ className }: { className?: string }) {
  const [theme, setTheme] = useState<Theme>(readInitial);

  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark');
    try {
      localStorage.setItem('rmamb-theme', theme);
    } catch {
      /* ignora storage indisponível */
    }
  }, [theme]);

  return (
    <button
      type="button"
      onClick={() => setTheme((t) => (t === 'dark' ? 'light' : 'dark'))}
      aria-label={theme === 'dark' ? 'Mudar para tema claro' : 'Mudar para tema escuro'}
      title={theme === 'dark' ? 'Tema claro' : 'Tema escuro'}
      className={cn(
        'grid h-10 w-10 place-items-center rounded-lg border border-brand-text/15 text-brand-text transition-colors hover:border-brand-neon/45 hover:text-brand-neon',
        className,
      )}
    >
      {theme === 'dark' ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
    </button>
  );
}
