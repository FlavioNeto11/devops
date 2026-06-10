import { Link } from 'react-router-dom';
import { ArrowRight, MessageCircle } from 'lucide-react';
import { whatsappUrl } from '../lib/site';
import { cn } from '../lib/utils';

/**
 * CTA "Solicitar proposta". Resolve para o WhatsApp (wa.me) quando o número estiver
 * configurado em site.ts; caso contrário, leva à página /contato — nunca um link quebrado.
 */
export default function ProposalButton({
  label = 'Solicitar proposta',
  message,
  variant = 'primary',
  className,
}: {
  label?: string;
  message?: string;
  variant?: 'primary' | 'ghost';
  className?: string;
}) {
  const cls = cn(variant === 'primary' ? 'btn-primary' : 'btn-ghost', className);
  const wa = whatsappUrl(message);

  if (wa) {
    return (
      <a href={wa} target="_blank" rel="noopener noreferrer" className={cls}>
        <MessageCircle className="h-4 w-4" /> {label}
      </a>
    );
  }
  return (
    <Link to="/contato" className={cls}>
      {label} <ArrowRight className="h-4 w-4" />
    </Link>
  );
}
