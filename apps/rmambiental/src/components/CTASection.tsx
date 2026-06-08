import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { MessageCircle, Mail, ArrowRight } from 'lucide-react';
import { whatsappUrl, mailtoUrl } from '../lib/site';

export default function CTASection() {
  return (
    <section className="relative py-20">
      <div className="container-wide">
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: '-80px' }}
          transition={{ duration: 0.6 }}
          className="relative overflow-hidden rounded-[28px] border border-white/10 bg-gradient-to-br from-brand-petrol/40 via-brand-surface to-brand-green/40 p-9 sm:p-14"
        >
          <div className="absolute inset-0 bg-tech-grid opacity-20" aria-hidden />
          <div className="absolute -right-20 -top-20 h-72 w-72 rounded-full bg-brand-neon/15 blur-[110px]" aria-hidden />
          <div className="relative max-w-3xl">
            <h2 className="font-display text-3xl font-extrabold leading-tight text-white sm:text-4xl">
              Seu projeto precisa de segurança ambiental, técnica e regulatória?
            </h2>
            <p className="mt-4 text-base leading-relaxed text-brand-text/85 sm:text-lg">
              Fale com a RM Ambiental Brasil e conte com uma equipe multidisciplinar para conduzir seu projeto com
              responsabilidade, clareza e eficiência.
            </p>
            <div className="mt-9 flex flex-wrap gap-3">
              <a href={whatsappUrl()} target="_blank" rel="noopener noreferrer" className="btn-primary">
                <MessageCircle className="h-4 w-4" /> Falar no WhatsApp
              </a>
              <a href={mailtoUrl()} className="btn-ghost">
                <Mail className="h-4 w-4" /> Enviar e-mail
              </a>
              <Link to="/contato" className="btn-ghost">
                Solicitar proposta <ArrowRight className="h-4 w-4" />
              </Link>
            </div>
          </div>
        </motion.div>
      </div>
    </section>
  );
}
