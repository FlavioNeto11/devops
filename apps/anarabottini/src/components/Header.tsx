import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Menu, X } from 'lucide-react';
import { cn } from '../lib/utils';
import { site } from '../lib/site';
import ProposalButton from './ProposalButton';

const NAV = [
  { label: 'Início', to: '/' },
  { label: 'NR-1', to: '/#nr1' },
  { label: 'Sobre', to: '/#sobre' },
  { label: 'Palestras', to: '/#palestras' },
  { label: 'Consultoria', to: '/#consultoria' },
  { label: 'Contato', to: '/contato' },
];

/** Marca textual (wordmark) com motivo ∞ — Ana não possui logotipo de imagem. */
function Wordmark() {
  return (
    <span className="flex items-center gap-2.5">
      <span className="grid h-9 w-9 place-items-center rounded-xl bg-gradient-to-br from-brand-neon/20 to-brand-terra/20 ring-1 ring-brand-text/10">
        <svg viewBox="0 0 48 24" className="h-4 w-7" fill="none" aria-hidden>
          <path
            d="M14 12c0-4-6-4-6 0s6 4 12 0 12-4 12 0-6 4-12 0-6-4-6 0z"
            stroke="rgb(var(--neon))"
            strokeWidth="2.4"
            strokeLinecap="round"
          />
        </svg>
      </span>
      <span className="font-display text-lg font-extrabold leading-none tracking-tight text-brand-text">
        {site.name}
      </span>
    </span>
  );
}

export default function Header() {
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
        scrolled || open
          ? 'border-b border-brand-text/10 bg-brand-bg/85 backdrop-blur-xl'
          : 'border-b border-transparent bg-transparent',
      )}
    >
      <div className="container-wide flex h-[72px] items-center justify-between gap-4">
        <Link to="/" className="flex items-center" onClick={() => setOpen(false)}>
          <Wordmark />
        </Link>

        <nav className="hidden items-center gap-0.5 lg:flex">
          {NAV.map((n) => (
            <Link
              key={n.label}
              to={n.to}
              className="rounded-lg px-3 py-2 text-sm font-medium text-brand-muted transition-colors hover:text-brand-text"
            >
              {n.label}
            </Link>
          ))}
        </nav>

        <div className="hidden lg:flex">
          <ProposalButton label="Solicitar proposta" />
        </div>

        <button
          className="grid h-10 w-10 place-items-center rounded-lg border border-brand-text/10 text-brand-text lg:hidden"
          onClick={() => setOpen((v) => !v)}
          aria-label="Abrir menu"
        >
          {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </button>
      </div>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.25 }}
            className="overflow-hidden border-t border-brand-text/10 bg-brand-bg/95 backdrop-blur-xl lg:hidden"
          >
            <nav className="container-wide flex flex-col gap-1 py-5">
              {NAV.map((n) => (
                <Link
                  key={n.label}
                  to={n.to}
                  onClick={() => setOpen(false)}
                  className="rounded-lg px-3 py-3 text-base font-medium text-brand-muted transition-colors hover:bg-brand-text/5 hover:text-brand-text"
                >
                  {n.label}
                </Link>
              ))}
              <ProposalButton label="Solicitar proposta" className="mt-3" />
            </nav>
          </motion.div>
        )}
      </AnimatePresence>
    </header>
  );
}
