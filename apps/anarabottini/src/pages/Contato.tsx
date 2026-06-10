import { Mail, MessageCircle, MapPin, Linkedin, Instagram } from 'lucide-react';
import {
  site,
  whatsappUrl,
  mailtoUrl,
  hasInstagram,
  hasLinkedin,
} from '../lib/site';
import { Reveal, SectionHeading } from '../components/ui';
import { InfinityMotif } from '../components/backgrounds';

export default function Contato() {
  const wa = whatsappUrl();
  const mail = mailtoUrl();
  const hasLocation = !!(site.contact.city || site.contact.state);

  return (
    <section className="relative overflow-hidden pt-[120px]">
      <InfinityMotif className="pointer-events-none absolute -right-10 top-24 h-40 w-80 opacity-25" />
      <div className="container-wide relative pb-24">
        <SectionHeading
          eyebrow="Contato"
          title={
            <>
              Vamos falar sobre a <span className="text-gradient">sua empresa</span>
            </>
          }
          subtitle="Palestra, campanha temática (Setembro Amarelo, Dia da Mulher), treinamento de lideranças ou um programa contínuo — me conte o contexto e eu retorno com uma proposta."
        />

        <div className="mt-12 grid max-w-3xl gap-4">
          {/* WhatsApp */}
          <Reveal>
            {wa ? (
              <a
                href={wa}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-4 rounded-2xl border border-brand-text/10 bg-brand-surface/70 p-5 shadow-soft transition-colors hover:border-brand-neon/40"
              >
                <span className="grid h-12 w-12 place-items-center rounded-xl bg-brand-neon/12">
                  <MessageCircle className="h-6 w-6 text-brand-neon" />
                </span>
                <span>
                  <span className="block font-display text-base font-bold text-brand-text">WhatsApp</span>
                  <span className="block text-sm text-brand-muted">{site.contact.whatsappLabel || 'Enviar mensagem'}</span>
                </span>
              </a>
            ) : (
              <div className="flex items-center gap-4 rounded-2xl border border-dashed border-brand-text/15 bg-brand-surface/50 p-5">
                <span className="grid h-12 w-12 place-items-center rounded-xl bg-brand-text/5">
                  <MessageCircle className="h-6 w-6 text-brand-muted" />
                </span>
                <span>
                  <span className="block font-display text-base font-bold text-brand-text">WhatsApp</span>
                  <span className="block text-sm text-brand-muted">A definir</span>
                </span>
              </div>
            )}
          </Reveal>

          {/* E-mail */}
          <Reveal delay={0.05}>
            {mail ? (
              <a
                href={mail}
                className="flex items-center gap-4 rounded-2xl border border-brand-text/10 bg-brand-surface/70 p-5 shadow-soft transition-colors hover:border-brand-neon/40"
              >
                <span className="grid h-12 w-12 place-items-center rounded-xl bg-brand-neon/12">
                  <Mail className="h-6 w-6 text-brand-neon" />
                </span>
                <span>
                  <span className="block font-display text-base font-bold text-brand-text">E-mail</span>
                  <span className="block text-sm text-brand-muted">{site.contact.email}</span>
                </span>
              </a>
            ) : (
              <div className="flex items-center gap-4 rounded-2xl border border-dashed border-brand-text/15 bg-brand-surface/50 p-5">
                <span className="grid h-12 w-12 place-items-center rounded-xl bg-brand-text/5">
                  <Mail className="h-6 w-6 text-brand-muted" />
                </span>
                <span>
                  <span className="block font-display text-base font-bold text-brand-text">E-mail</span>
                  <span className="block text-sm text-brand-muted">A definir</span>
                </span>
              </div>
            )}
          </Reveal>

          {/* Redes */}
          {(hasInstagram || hasLinkedin) && (
            <Reveal delay={0.1}>
              <div className="flex flex-wrap gap-3 rounded-2xl border border-brand-text/10 bg-brand-surface/70 p-5 shadow-soft">
                {hasInstagram && (
                  <a
                    href={site.social.instagram}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-2 rounded-lg border border-brand-text/10 px-4 py-2 text-sm font-medium text-brand-text transition-colors hover:border-brand-neon/40 hover:text-brand-neon"
                  >
                    <Instagram className="h-4 w-4" /> Instagram
                  </a>
                )}
                {hasLinkedin && (
                  <a
                    href={site.social.linkedin}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-2 rounded-lg border border-brand-text/10 px-4 py-2 text-sm font-medium text-brand-text transition-colors hover:border-brand-neon/40 hover:text-brand-neon"
                  >
                    <Linkedin className="h-4 w-4" /> LinkedIn
                  </a>
                )}
              </div>
            </Reveal>
          )}

          {/* Localização */}
          {hasLocation && (
            <Reveal delay={0.12}>
              <div className="flex items-center gap-3 px-1 text-sm text-brand-muted">
                <MapPin className="h-4 w-4 text-brand-neon" />
                {[site.contact.city, site.contact.state].filter(Boolean).join(' · ')}
              </div>
            </Reveal>
          )}
        </div>
      </div>
    </section>
  );
}
