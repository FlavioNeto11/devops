import { Link } from 'react-router-dom';
import { Mail, MessageCircle, MapPin, Linkedin, Instagram, Youtube } from 'lucide-react';
import { useSite } from '../lib/SiteContext';

const quick = [
  { label: 'Início', to: '/' },
  { label: 'NR-1', to: '/#nr1' },
  { label: 'Sobre', to: '/#sobre' },
  { label: 'Palestras', to: '/#palestras' },
  { label: 'Mídia', to: '/#midia' },
  { label: 'Materiais', to: '/#materiais' },
  { label: 'Consultoria', to: '/#consultoria' },
  { label: 'FAQ', to: '/#faq' },
  { label: 'Contato', to: '/contato' },
];

export default function Footer() {
  const { site, whatsappUrl, mailtoUrl, hasInstagram, hasLinkedin, hasYoutube } = useSite();
  const year = new Date().getFullYear();
  const hasSocial = hasInstagram || hasLinkedin || hasYoutube;
  const hasLocation = !!(site.contact.city || site.contact.state);
  const wa = whatsappUrl();
  const mail = mailtoUrl();

  return (
    <footer className="relative border-t border-brand-text/10 bg-brand-surface2">
      <div className="container-wide grid gap-10 py-14 md:grid-cols-2 lg:grid-cols-[1.5fr_1fr_1.1fr]">
        {/* Marca */}
        <div>
          <p className="font-display text-lg font-extrabold tracking-tight text-brand-text">{site.name}</p>
          <p className="mt-1 text-sm font-medium text-brand-muted">{site.role}</p>
          <p className="mt-4 max-w-xs text-sm leading-relaxed text-brand-muted">{site.intro}</p>
          {hasSocial && (
            <div className="mt-5 flex gap-3">
              {hasLinkedin && (
                <a
                  href={site.social.linkedin}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label="LinkedIn"
                  className="grid h-9 w-9 place-items-center rounded-lg border border-brand-text/10 text-brand-muted transition-colors hover:border-brand-neon/40 hover:text-brand-neon focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-neon/45 focus-visible:ring-offset-2 focus-visible:ring-offset-brand-bg"
                >
                  <Linkedin className="h-4 w-4" />
                </a>
              )}
              {hasInstagram && (
                <a
                  href={site.social.instagram}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label="Instagram"
                  className="grid h-9 w-9 place-items-center rounded-lg border border-brand-text/10 text-brand-muted transition-colors hover:border-brand-neon/40 hover:text-brand-neon focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-neon/45 focus-visible:ring-offset-2 focus-visible:ring-offset-brand-bg"
                >
                  <Instagram className="h-4 w-4" />
                </a>
              )}
              {hasYoutube && (
                <a
                  href={site.media.youtube}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label="YouTube"
                  className="grid h-9 w-9 place-items-center rounded-lg border border-brand-text/10 text-brand-muted transition-colors hover:border-brand-neon/40 hover:text-brand-neon focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-neon/45 focus-visible:ring-offset-2 focus-visible:ring-offset-brand-bg"
                >
                  <Youtube className="h-4 w-4" />
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
                <Link to={q.to} className="rounded text-sm text-brand-muted transition-colors hover:text-brand-neon focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-neon/45 focus-visible:ring-offset-2 focus-visible:ring-offset-brand-bg">
                  {q.label}
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
              {mail ? (
                <a href={mail} className="flex items-center gap-2.5 rounded text-brand-muted transition-colors hover:text-brand-neon focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-neon/45 focus-visible:ring-offset-2 focus-visible:ring-offset-brand-bg">
                  <Mail className="h-4 w-4" /> {site.contact.email}
                </a>
              ) : (
                <span className="flex items-center gap-2.5 text-brand-muted/70">
                  <Mail className="h-4 w-4" /> E-mail a definir
                </span>
              )}
            </li>
            <li>
              {wa ? (
                <a
                  href={wa}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-2.5 rounded text-brand-muted transition-colors hover:text-brand-neon focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-neon/45 focus-visible:ring-offset-2 focus-visible:ring-offset-brand-bg"
                >
                  <MessageCircle className="h-4 w-4" /> {site.contact.whatsappLabel || 'WhatsApp'}
                </a>
              ) : (
                <span className="flex items-center gap-2.5 text-brand-muted/70">
                  <MessageCircle className="h-4 w-4" /> WhatsApp a definir
                </span>
              )}
            </li>
            {hasLocation && (
              <li className="flex items-center gap-2.5 text-brand-muted">
                <MapPin className="h-4 w-4" /> {[site.contact.city, site.contact.state].filter(Boolean).join(' · ')}
              </li>
            )}
          </ul>
        </div>
      </div>

      <div className="border-t border-brand-text/10">
        <div className="container-wide flex flex-col items-center justify-between gap-3 py-6 text-xs text-brand-muted sm:flex-row">
          <p>© {year} {site.name}. Todos os direitos reservados.</p>
          <p>Saúde mental corporativa · Neurodiversidade · NR-1</p>
        </div>
      </div>
    </footer>
  );
}
