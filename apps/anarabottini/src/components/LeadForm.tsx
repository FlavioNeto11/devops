import { useState, type ChangeEvent, type FormEvent } from 'react';
import { MessageCircle, Mail, Info } from 'lucide-react';
import { Reveal, SectionHeading } from './ui';
import { useSite } from '../lib/SiteContext';

const DEMANDAS = ['Palestra', 'Campanha (Setembro Amarelo / Dia da Mulher)', 'Treinamento de lideranças', 'Consultoria educativa', 'Outro'];

const field =
  'w-full rounded-xl border border-brand-text/12 bg-brand-surface px-4 py-2.5 text-sm text-brand-text placeholder:text-brand-muted focus:outline-none focus-visible:border-brand-neon focus-visible:ring-2 focus-visible:ring-brand-neon/40';
const labelCls = 'mb-1.5 block text-xs font-semibold text-brand-muted';

/**
 * Formulário de proposta. Sem backend: compõe uma mensagem e abre WhatsApp/e-mail.
 * Se `site.forms.embedUrl` estiver configurado, embute um formulário externo
 * (Google Forms/Typeform) num iframe. `variant='section'` renderiza com cabeçalho
 * de seção (para a Home); `variant='page'` é mais enxuto (para a página /contato).
 */
export default function LeadForm({
  variant = 'section',
  defaultDemanda = '',
}: {
  variant?: 'page' | 'section';
  defaultDemanda?: string;
}) {
  const { site, whatsappUrl, mailtoUrl, hasWhatsApp, hasEmail, hasFormEmbed } = useSite();
  const [form, setForm] = useState({
    nome: '',
    empresa: '',
    cargo: '',
    demanda: defaultDemanda || DEMANDAS[0],
    dataEvento: '',
    mensagem: '',
  });

  const set =
    (k: keyof typeof form) =>
    (e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
      setForm((f) => ({ ...f, [k]: e.target.value }));

  const compose = () =>
    `Olá, Ana! Sou ${form.nome || '[nome]'}${form.empresa ? ` (${form.empresa})` : ''}${form.cargo ? `, ${form.cargo}` : ''}.\n` +
    `Tenho interesse em: ${form.demanda}.\n` +
    (form.dataEvento ? `Data/evento: ${form.dataEvento}.\n` : '') +
    (form.mensagem ? `\n${form.mensagem}` : '');

  const canSend = hasWhatsApp || hasEmail;

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    const wa = whatsappUrl(compose());
    if (wa) {
      window.open(wa, '_blank', 'noopener');
      return;
    }
    const mail = mailtoUrl('Proposta de palestra — via site', compose());
    if (mail) window.location.href = mail;
  };

  const formInner = (
    <form
      onSubmit={onSubmit}
      className="rounded-3xl border border-brand-text/10 bg-brand-surface/70 p-6 shadow-card sm:p-8"
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="lf-nome" className={labelCls}>Nome *</label>
          <input id="lf-nome" required aria-required="true" value={form.nome} onChange={set('nome')} className={field} placeholder="Seu nome" />
        </div>
        <div>
          <label htmlFor="lf-empresa" className={labelCls}>Empresa</label>
          <input id="lf-empresa" value={form.empresa} onChange={set('empresa')} className={field} placeholder="Nome da empresa" />
        </div>
        <div>
          <label htmlFor="lf-cargo" className={labelCls}>Cargo / área</label>
          <input id="lf-cargo" value={form.cargo} onChange={set('cargo')} className={field} placeholder="Ex.: RH, SESMT, gestão" />
        </div>
        <div>
          <label htmlFor="lf-demanda" className={labelCls}>Tipo de demanda</label>
          <select id="lf-demanda" value={form.demanda} onChange={set('demanda')} className={field}>
            {DEMANDAS.map((d) => (
              <option key={d} value={d}>
                {d}
              </option>
            ))}
          </select>
        </div>
        <div className="sm:col-span-2">
          <label htmlFor="lf-data" className={labelCls}>Data ou período do evento</label>
          <input id="lf-data" value={form.dataEvento} onChange={set('dataEvento')} className={field} placeholder="Ex.: setembro/2026" />
        </div>
        <div className="sm:col-span-2">
          <label htmlFor="lf-mensagem" className={labelCls}>Mensagem</label>
          <textarea
            id="lf-mensagem"
            value={form.mensagem}
            onChange={set('mensagem')}
            rows={4}
            className={field}
            placeholder="Conte o momento da empresa, o público e o formato desejado."
          />
        </div>
      </div>

      {canSend ? (
        <div className="mt-6 flex flex-wrap items-center gap-3">
          <button type="submit" className="btn-primary">
            {hasWhatsApp ? (
              <>
                <MessageCircle className="h-4 w-4" /> Enviar pelo WhatsApp
              </>
            ) : (
              <>
                <Mail className="h-4 w-4" /> Enviar por e-mail
              </>
            )}
          </button>
          {hasWhatsApp && hasEmail && (
            <button
              type="button"
              onClick={() => {
                const mail = mailtoUrl('Proposta de palestra — via site', compose());
                if (mail) window.location.href = mail;
              }}
              className="btn-ghost"
            >
              <Mail className="h-4 w-4" /> Prefiro e-mail
            </button>
          )}
        </div>
      ) : (
        <p className="mt-6 flex items-center gap-2 rounded-xl border border-dashed border-brand-text/15 bg-brand-surface2/60 px-4 py-3 text-sm text-brand-muted">
          <Info className="h-4 w-4 shrink-0 text-brand-neon" /> Canais de contato serão disponibilizados em breve.
        </p>
      )}
    </form>
  );

  const embed = hasFormEmbed && (
    <div className="overflow-hidden rounded-3xl border border-brand-text/10 bg-brand-surface shadow-card">
      <iframe
        src={site.forms.embedUrl}
        title="Formulário de contato"
        loading="lazy"
        className="min-h-[680px] w-full"
      />
    </div>
  );

  const body = embed || formInner;

  if (variant === 'page') return body;

  return (
    <section id="contato" className="relative py-24">
      <div className="container-wide">
        <SectionHeading
          eyebrow="Fale comigo"
          title={
            <>
              Vamos desenhar a ação ideal para a <span className="text-gradient">sua empresa</span>
            </>
          }
          subtitle="Conte o momento e o objetivo — palestra, campanha, treinamento ou um programa contínuo — e eu retorno com uma proposta."
        />
        <div className="mx-auto mt-12 max-w-3xl">
          <Reveal>{body}</Reveal>
        </div>
      </div>
    </section>
  );
}
