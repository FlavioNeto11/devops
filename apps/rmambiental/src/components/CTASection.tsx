import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { MessageCircle, Mail, ArrowRight } from 'lucide-react';
import { whatsappUrl, mailtoUrl } from '../lib/site';
import { asset } from '../lib/utils';

// Botões secundários sobre a faixa escura (imagem) — brancos de propósito (independe do tema).
const onDark =
  'inline-flex items-center justify-center gap-2 rounded-xl border border-white/30 bg-white/5 px-5 py-3 text-sm font-semibold text-white backdrop-blur transition-all hover:bg-white/12';

export default function CTASection() {
  return (
    <section className="relative py-20">
      <div className="container-wide">
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: '-80px' }}
          transition={{ duration: 0.6 }}
          className="relative overflow-hidden rounded-[28px] shadow-glass"
        >
          {/* Faixa rica com imagem real + overlay escuro (mesmo visual em claro/escuro) */}
          <div className="absolute inset-0" aria-hidden>
            <img src={asset('images/decor/costa.jpg')} alt="" className="h-full w-full object-cover" />
            <div className="absolute inset-0 bg-gradient-to-br from-brand-ink/92 via-brand-ink/82 to-brand-petrol/80" />
            <div className="absolute inset-0 bg-tech-grid opacity-15" />
            <div className="absolute -right-20 -top-24 h-72 w-72 rounded-full bg-brand-neon/20 blur-[120px]" />
          </div>

          <div className="relative max-w-3xl p-9 sm:p-14">
            <h2 className="font-display text-3xl font-extrabold leading-tight text-white sm:text-4xl">
              Seu projeto precisa de segurança ambiental, técnica e regulatória?
            </h2>
            <p className="mt-4 text-base leading-relaxed text-white/85 sm:text-lg">
              Fale com a RM Ambiental Brasil e conte com uma equipe multidisciplinar para conduzir seu projeto com
              responsabilidade, clareza e eficiência.
            </p>
            <div className="mt-9 flex flex-wrap gap-3">
              <a href={whatsappUrl()} target="_blank" rel="noopener noreferrer" className="btn-primary">
                <MessageCircle className="h-4 w-4" /> Falar no WhatsApp
              </a>
              <a href={mailtoUrl()} className={onDark}>
                <Mail className="h-4 w-4" /> Enviar e-mail
              </a>
              <Link to="/contato" className={onDark}>
                Solicitar proposta <ArrowRight className="h-4 w-4" />
              </Link>
            </div>
          </div>
        </motion.div>
      </div>
    </section>
  );
}
