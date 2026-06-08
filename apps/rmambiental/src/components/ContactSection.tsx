import { useState, type FormEvent } from 'react';
import { MessageCircle, Mail, MapPin, Globe2, Send } from 'lucide-react';
import { serviceGroups } from '../data/services';
import { site, whatsappUrl, mailtoUrl } from '../lib/site';
import { SectionHeading } from './ui';

const field =
  'w-full rounded-xl border border-white/10 bg-brand-bg/60 px-4 py-3 text-sm text-white placeholder:text-brand-muted/60 outline-none transition-colors focus:border-brand-neon/50';

export default function ContactSection() {
  const [form, setForm] = useState({
    nome: '',
    empresa: '',
    telefone: '',
    email: '',
    servico: '',
    mensagem: '',
  });

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  const compose = () =>
    `Olá! Sou ${form.nome || '[nome]'}${form.empresa ? ` (${form.empresa})` : ''}.\n` +
    `Serviço de interesse: ${form.servico || 'não especificado'}.\n` +
    `Telefone: ${form.telefone || '-'} · E-mail: ${form.email || '-'}.\n\n` +
    `${form.mensagem || ''}`;

  // Sem backend: o envio abre o WhatsApp (ou e-mail) com a mensagem pré-preenchida.
  const onWhatsApp = (e: FormEvent) => {
    e.preventDefault();
    window.open(whatsappUrl(compose()), '_blank', 'noopener');
  };
  const onEmail = () => {
    window.location.href = mailtoUrl(`Contato — ${form.servico || 'RM Ambiental Brasil'}`, compose());
  };

  return (
    <section id="contato" className="relative py-24">
      <div className="container-wide">
        <SectionHeading
          center
          eyebrow="Contato"
          title={
            <>
              Vamos conversar sobre o seu <span className="text-gradient">projeto</span>
            </>
          }
          subtitle="Conte sobre o desafio e nossa equipe retorna com os próximos passos. Atendimento em todo o Brasil."
        />

        <div className="mt-14 grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
          {/* Formulário */}
          <form onSubmit={onWhatsApp} className="rounded-3xl border border-white/10 bg-brand-surface/60 p-6 sm:p-8">
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className="mb-1.5 block text-xs font-semibold text-brand-muted">Nome *</label>
                <input required value={form.nome} onChange={set('nome')} className={field} placeholder="Seu nome" />
              </div>
              <div>
                <label className="mb-1.5 block text-xs font-semibold text-brand-muted">Empresa</label>
                <input value={form.empresa} onChange={set('empresa')} className={field} placeholder="Sua empresa" />
              </div>
              <div>
                <label className="mb-1.5 block text-xs font-semibold text-brand-muted">Telefone</label>
                <input value={form.telefone} onChange={set('telefone')} className={field} placeholder="(11) 90000-0000" />
              </div>
              <div>
                <label className="mb-1.5 block text-xs font-semibold text-brand-muted">E-mail *</label>
                <input
                  required
                  type="email"
                  value={form.email}
                  onChange={set('email')}
                  className={field}
                  placeholder="voce@empresa.com"
                />
              </div>
              <div className="sm:col-span-2">
                <label className="mb-1.5 block text-xs font-semibold text-brand-muted">Tipo de serviço</label>
                <select value={form.servico} onChange={set('servico')} className={field}>
                  <option value="">Selecione…</option>
                  {serviceGroups.map((g) => (
                    <option key={g.id} value={g.title}>
                      {g.title}
                    </option>
                  ))}
                  <option value="Outro">Outro</option>
                </select>
              </div>
              <div className="sm:col-span-2">
                <label className="mb-1.5 block text-xs font-semibold text-brand-muted">Mensagem *</label>
                <textarea
                  required
                  rows={4}
                  value={form.mensagem}
                  onChange={set('mensagem')}
                  className={field}
                  placeholder="Descreva brevemente o seu projeto ou necessidade."
                />
              </div>
            </div>

            <div className="mt-5 flex flex-wrap gap-3">
              <button type="submit" className="btn-primary">
                <MessageCircle className="h-4 w-4" /> Enviar via WhatsApp
              </button>
              <button type="button" onClick={onEmail} className="btn-ghost">
                <Send className="h-4 w-4" /> Enviar por e-mail
              </button>
            </div>
            <p className="mt-3 text-xs text-brand-muted/70">
              Ao enviar, abriremos o WhatsApp ou o e-mail com sua mensagem pré-preenchida. Nenhum dado é armazenado neste site.
            </p>
          </form>

          {/* Info + mapa estilizado */}
          <div className="flex flex-col gap-5">
            <div className="rounded-3xl border border-white/10 bg-brand-surface/60 p-6">
              <ul className="space-y-4 text-sm">
                <li className="flex items-center gap-3">
                  <span className="grid h-10 w-10 place-items-center rounded-xl bg-brand-neon/12 ring-1 ring-brand-neon/20">
                    <Mail className="h-5 w-5 text-brand-neon" />
                  </span>
                  <a href={mailtoUrl()} className="text-white transition-colors hover:text-brand-neon">
                    {site.contact.email}
                  </a>
                </li>
                <li className="flex items-center gap-3">
                  <span className="grid h-10 w-10 place-items-center rounded-xl bg-brand-neon/12 ring-1 ring-brand-neon/20">
                    <MessageCircle className="h-5 w-5 text-brand-neon" />
                  </span>
                  <a href={whatsappUrl()} target="_blank" rel="noopener noreferrer" className="text-white transition-colors hover:text-brand-neon">
                    WhatsApp · {site.contact.whatsappLabel}
                  </a>
                </li>
                <li className="flex items-center gap-3">
                  <span className="grid h-10 w-10 place-items-center rounded-xl bg-brand-neon/12 ring-1 ring-brand-neon/20">
                    <MapPin className="h-5 w-5 text-brand-neon" />
                  </span>
                  <span className="text-white">
                    {site.contact.city} · {site.contact.state}, {site.contact.country}
                  </span>
                </li>
                <li className="flex items-center gap-3">
                  <span className="grid h-10 w-10 place-items-center rounded-xl bg-brand-neon/12 ring-1 ring-brand-neon/20">
                    <Globe2 className="h-5 w-5 text-brand-neon" />
                  </span>
                  <span className="text-white">{site.contact.coverage}</span>
                </li>
              </ul>
            </div>

            {/* "mapa" elegante sem dependência do Google Maps */}
            <div className="relative flex-1 overflow-hidden rounded-3xl border border-white/10 bg-gradient-to-br from-brand-petrol/30 to-brand-green/30 p-6">
              <div className="absolute inset-0 bg-tech-grid opacity-30" aria-hidden />
              <div className="relative flex h-full min-h-[160px] flex-col justify-between">
                <span className="eyebrow w-fit">Onde atuamos</span>
                <div className="flex items-end justify-between">
                  <div>
                    <div className="font-display text-2xl font-bold text-white">São Paulo · Brasil</div>
                    <div className="mt-1 text-sm text-brand-muted">Sede operacional · atuação nacional</div>
                  </div>
                  <MapPin className="h-10 w-10 text-brand-neon" />
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
