import { Link } from 'react-router-dom';
import { Mail, MessageCircle, MapPin, Linkedin, Instagram } from 'lucide-react';
import { useSite } from '../lib/SiteContext';
import { asset } from '../lib/utils';
import { serviceGroups } from '../data/services';

const quick = [
  { label: 'Início', to: '/' },
  { label: 'Soluções', to: '/solucoes' },
  { label: 'Sobre', to: '/#sobre' },
  { label: 'Setores', to: '/#setores' },
  { label: 'Projetos', to: '/#projetos' },
  { label: 'Contato', to: '/contato' },
];

export default function Footer() {
  const { site, whatsappUrl, mailtoUrl } = useSite();
  const year = new Date().getFullYear();
  const hasSocial = site.social.linkedin || site.social.instagram;

  return (
    <footer className="relative border-t border-brand-text/10 bg-brand-surface2">
      <div className="container-wide grid gap-10 py-14 md:grid-cols-2 lg:grid-cols-[1.4fr_1fr_1fr_1.1fr]">
        {/* Marca */}
        <div>
          <Link to="/" className="inline-flex items-center rounded-xl bg-white px-3 py-2 shadow-sm">
            <img src={asset('images/logo.png')} alt="RM Ambiental Brasil" className="h-8 w-auto" />
          </Link>
          <p className="mt-4 max-w-xs text-sm leading-relaxed text-brand-muted">
            Engenharia, licenciamento e soluções ambientais para projetos complexos em todo o Brasil — com segurança
            técnica, conformidade e gestão multidisciplinar.
          </p>
          {hasSocial && (
            <div className="mt-5 flex gap-3">
              {site.social.linkedin && (
                <a href={site.social.linkedin} target="_blank" rel="noopener noreferrer" aria-label="LinkedIn" className="grid h-9 w-9 place-items-center rounded-lg border border-brand-text/10 text-brand-muted transition-colors hover:border-brand-neon/40 hover:text-brand-neon">
                  <Linkedin className="h-4 w-4" />
                </a>
              )}
              {site.social.instagram && (
                <a href={site.social.instagram} target="_blank" rel="noopener noreferrer" aria-label="Instagram" className="grid h-9 w-9 place-items-center rounded-lg border border-brand-text/10 text-brand-muted transition-colors hover:border-brand-neon/40 hover:text-brand-neon">
                  <Instagram className="h-4 w-4" />
                </a>
              )}
            </div>
          )}
        </div>

        {/* Navegação */}
        <div>
          <h4 className="font-display text-sm font-bold text-brand-text">Navegação</h4>
          <ul className="mt-4 space-y-2.5">
            {quick.map((q) => (
              <li key={q.label}>
                <Link to={q.to} className="text-sm text-brand-muted transition-colors hover:text-brand-neon">
                  {q.label}
                </Link>
              </li>
            ))}
          </ul>
        </div>

        {/* Soluções */}
        <div>
          <h4 className="font-display text-sm font-bold text-brand-text">Soluções</h4>
          <ul className="mt-4 space-y-2.5">
            {serviceGroups.map((g) => (
              <li key={g.id}>
                <Link to={`/solucoes#${g.id}`} className="text-sm text-brand-muted transition-colors hover:text-brand-neon">
                  {g.title}
                </Link>
              </li>
            ))}
          </ul>
        </div>

        {/* Contato */}
        <div>
          <h4 className="font-display text-sm font-bold text-brand-text">Contato</h4>
          <ul className="mt-4 space-y-3 text-sm">
            <li>
              <a href={mailtoUrl()} className="flex items-center gap-2.5 text-brand-muted transition-colors hover:text-brand-neon">
                <Mail className="h-4 w-4" /> {site.contact.email}
              </a>
            </li>
            <li>
              <a href={whatsappUrl()} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2.5 text-brand-muted transition-colors hover:text-brand-neon">
                <MessageCircle className="h-4 w-4" /> {site.contact.whatsappLabel}
              </a>
            </li>
            <li className="flex items-center gap-2.5 text-brand-muted">
              <MapPin className="h-4 w-4" /> {site.contact.city} · {site.contact.state}
            </li>
          </ul>
        </div>
      </div>

      <div className="border-t border-brand-text/10">
        <div className="container-wide flex flex-col items-center justify-between gap-3 py-6 text-xs text-brand-muted sm:flex-row">
          <p>© {year} {site.name}. Todos os direitos reservados.</p>
          {/* AJUSTAR: apontar para a página real de Política de Privacidade */}
          <a href="#" className="transition-colors hover:text-brand-neon">
            Política de Privacidade
          </a>
        </div>
      </div>
    </footer>
  );
}
