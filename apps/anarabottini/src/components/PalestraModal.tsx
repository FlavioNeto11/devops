import { useEffect, useState } from 'react';
import { Check, Clock, Download, ExternalLink, FileText } from 'lucide-react';
import Modal from './Modal';
import VideoEmbed from './VideoEmbed';
import ProposalButton from './ProposalButton';
import type { Palestra } from '../data/palestras';
import { asset } from '../lib/utils';

/**
 * Modal de detalhe de uma palestra: vídeo (ou "em breve"), descrição completa,
 * formatos/duração, temas, benefícios, materiais e CTA "Solicitar esta palestra".
 * Mantém o último valor para a animação de saída ficar limpa após fechar.
 */
export default function PalestraModal({
  palestra,
  onClose,
}: {
  palestra: Palestra | null;
  onClose: () => void;
}) {
  const [shown, setShown] = useState<Palestra | null>(palestra);
  useEffect(() => {
    if (palestra) setShown(palestra);
  }, [palestra]);

  const p = shown;

  return (
    <Modal open={!!palestra} onClose={onClose} label={p?.title} size="xl">
      {p && (
        <div>
          <VideoEmbed id={p.videoId ?? ''} title={p.title} className="rounded-b-none" />

          <div className="p-6 sm:p-8">
            {p.tag && (
              <span className="mb-2 inline-block rounded-full bg-brand-neon/12 px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wider text-brand-neon">
                {p.tag}
              </span>
            )}
            <h3 className="font-display text-2xl font-bold leading-tight text-brand-text">{p.title}</h3>
            {p.subtitle && <p className="mt-1 text-sm italic text-brand-muted">{p.subtitle}</p>}

            <p className="mt-4 text-base leading-relaxed text-brand-muted">{p.descricao || p.objetivo}</p>

            {/* formato / duração */}
            <div className="mt-5 flex flex-wrap items-center gap-2">
              {p.modalidades?.map((m) => (
                <span
                  key={m}
                  className="rounded-full border border-brand-neon/25 bg-brand-neon/8 px-3 py-1 text-xs font-medium text-brand-text"
                >
                  {m}
                </span>
              ))}
              {p.duracao && (
                <span className="inline-flex items-center gap-1.5 rounded-full border border-brand-text/10 bg-brand-surface2/70 px-3 py-1 text-xs text-brand-muted">
                  <Clock className="h-3.5 w-3.5" /> {p.duracao}
                </span>
              )}
            </div>

            {/* temas */}
            <p className="mt-7 text-xs font-bold uppercase tracking-[0.16em] text-brand-muted">{p.temasLabel}</p>
            <div className="mt-3 flex flex-wrap gap-2">
              {p.temas.map((t) => (
                <span
                  key={t}
                  className="rounded-full border border-brand-text/10 bg-brand-surface2/70 px-3 py-1 text-xs text-brand-text"
                >
                  {t}
                </span>
              ))}
            </div>

            {/* benefícios */}
            <p className="mt-6 text-xs font-bold uppercase tracking-[0.16em] text-brand-muted">Benefícios para a empresa</p>
            <ul className="mt-3 grid gap-2 sm:grid-cols-2">
              {p.beneficios.map((b) => (
                <li key={b} className="flex items-start gap-2 text-sm text-brand-muted">
                  <Check className="mt-0.5 h-4 w-4 shrink-0 text-brand-neon/80" />
                  <span>{b}</span>
                </li>
              ))}
            </ul>

            {/* materiais relacionados */}
            {p.materiais && p.materiais.length > 0 && (
              <>
                <p className="mt-6 text-xs font-bold uppercase tracking-[0.16em] text-brand-muted">Materiais</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  {p.materiais.map((m) => {
                    const href = m.kind === 'pdf' ? asset('materiais/' + m.url) : m.url;
                    return (
                      <a
                        key={m.label}
                        href={href}
                        target={m.kind === 'pdf' ? undefined : '_blank'}
                        rel="noopener noreferrer"
                        {...(m.kind === 'pdf' ? { download: '' } : {})}
                        className="inline-flex items-center gap-2 rounded-lg border border-brand-text/10 px-3.5 py-2 text-sm font-medium text-brand-text transition-colors hover:border-brand-neon/40 hover:text-brand-neon"
                      >
                        {m.kind === 'pdf' ? <Download className="h-4 w-4" /> : m.kind === 'form' ? <FileText className="h-4 w-4" /> : <ExternalLink className="h-4 w-4" />}
                        {m.label}
                      </a>
                    );
                  })}
                </div>
              </>
            )}

            {/* CTA */}
            <div className="mt-8 border-t border-brand-text/10 pt-6">
              <ProposalButton
                label="Solicitar esta palestra"
                message={`Olá, Ana! Tenho interesse na palestra "${p.title}" para a minha empresa.`}
              />
            </div>
          </div>
        </div>
      )}
    </Modal>
  );
}
