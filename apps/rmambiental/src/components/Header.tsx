import { useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Menu, X, ArrowRight } from 'lucide-react';
import { asset, cn } from '../lib/utils';
import ThemeToggle from './ThemeToggle';

const NAV = [
  { label: 'Início', to: '/' },
  { label: 'Soluções', to: '/solucoes' },
  { label: 'Sobre', to: '/#sobre' },
  { label: 'Processo', to: '/#processo' },
  { label: 'Setores', to: '/#setores' },
  { label: 'Projetos', to: '/#projetos' },
  { label: 'ESG', to: '/#esg' },
  { label: 'Contato', to: '/contato' },
];

/** Item da navegação ativo para a rota atual (pathname + hash).
 *  Âncoras (/#secao) só ficam ativas com o hash correspondente; "Início" fica
 *  ativo na home sem hash. */
function isNavActive(to: string, pathname: string, hash: string): boolean {
  const [path, anchor] = to.split('#');
  const target = path || '/';
  if (target !== pathname) return false;
  if (anchor) return hash === `#${anchor}`;
  // Sem âncora: só ativo quando não há hash apontando para uma seção da home.
  return target === '/' ? hash === '' : true;
}

export default function Header() {
  const { pathname, hash } = useLocation();
  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 24);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  useEffect(() => {
    document.body.style.overflow = open ? 'hidden' : '';
    return () => {
      document.body.style.overflow = '';
    };
  }, [open]);

  return (
    <header
      className={cn(
        'fixed inset-x-0 top-0 z-50 transition-all duration-300',
        scrolled || open ? 'border-b border-brand-text/10 bg-brand-bg/85 backdrop-blur-xl' : 'border-b border-transparent bg-transparent',
      )}
    >
      <div className="container-wide flex h-[72px] items-center justify-between gap-4">
        <Link to="/" className="flex items-center" onClick={() => setOpen(false)}>
          <span className="flex items-center rounded-xl bg-white px-2.5 py-1.5 shadow-sm ring-1 ring-black/5">
            <img src={asset('images/logo.png')} alt="RM Ambiental Brasil" className="h-7 w-auto" />
          </span>
        </Link>

        <nav className="hidden items-center gap-0.5 xl:flex">
          {NAV.map((n) => {
            const active = isNavActive(n.to, pathname, hash);
            return (
              <Link
                key={n.label}
                to={n.to}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  'rounded-lg px-3 py-2 text-sm font-medium transition-colors hover:text-brand-text focus:outline-none focus-visible:ring-2 focus-visible:ring-[rgb(var(--neon))] focus-visible:ring-offset-2 focus-visible:ring-offset-[rgb(var(--bg))]',
                  active ? 'text-brand-text' : 'text-brand-muted',
                )}
              >
                {n.label}
              </Link>
            );
          })}
        </nav>

        <div className="hidden items-center gap-3 xl:flex">
          <ThemeToggle />
          <Link to="/contato" className="btn-primary">
            Fale com um especialista <ArrowRight className="h-4 w-4" />
          </Link>
        </div>

        <div className="flex items-center gap-2 xl:hidden">
          <ThemeToggle />
          <button
            type="button"
            className="grid h-10 w-10 place-items-center rounded-lg border border-brand-text/10 text-brand-text focus:outline-none focus-visible:ring-2 focus-visible:ring-[rgb(var(--neon))] focus-visible:ring-offset-2 focus-visible:ring-offset-[rgb(var(--bg))]"
            onClick={() => setOpen((v) => !v)}
            aria-label={open ? 'Fechar menu' : 'Abrir menu'}
            aria-expanded={open}
          >
            {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>
      </div>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.25 }}
            className="overflow-hidden border-t border-brand-text/10 bg-brand-bg/95 backdrop-blur-xl xl:hidden"
          >
            <nav className="container-wide flex flex-col gap-1 py-5">
              {NAV.map((n) => {
                const active = isNavActive(n.to, pathname, hash);
                return (
                  <Link
                    key={n.label}
                    to={n.to}
                    onClick={() => setOpen(false)}
                    aria-current={active ? 'page' : undefined}
                    className={cn(
                      'rounded-lg px-3 py-3 text-base font-medium transition-colors hover:bg-brand-text/5 hover:text-brand-text focus:outline-none focus-visible:ring-2 focus-visible:ring-[rgb(var(--neon))] focus-visible:ring-offset-2 focus-visible:ring-offset-[rgb(var(--bg))]',
                      active ? 'bg-brand-text/5 text-brand-text' : 'text-brand-muted',
                    )}
                  >
                    {n.label}
                  </Link>
                );
              })}
              <Link to="/contato" onClick={() => setOpen(false)} className="btn-primary mt-3">
                Fale com um especialista <ArrowRight className="h-4 w-4" />
              </Link>
            </nav>
          </motion.div>
        )}
      </AnimatePresence>
    </header>
  );
}
