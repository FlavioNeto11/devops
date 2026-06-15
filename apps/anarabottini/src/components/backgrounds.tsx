import { motion, useReducedMotion } from 'framer-motion';

/** Grade técnica sutil + glows quentes radiais. Decorativo, full-bleed. */
export function GridGlow({ className = '' }: { className?: string }) {
  return (
    <div className={`pointer-events-none absolute inset-0 overflow-hidden ${className}`} aria-hidden>
      <div className="absolute inset-0 bg-tech-grid opacity-60 [mask-image:radial-gradient(ellipse_at_center,black,transparent_78%)]" />
      <div className="absolute left-1/2 top-[-12%] h-[560px] w-[860px] -translate-x-1/2 rounded-full bg-brand-neon/12 blur-[130px]" />
      <div className="absolute -right-40 bottom-[-10%] h-[440px] w-[440px] rounded-full bg-brand-terra/12 blur-[120px]" />
      <div className="absolute -left-32 top-1/3 h-[360px] w-[360px] rounded-full bg-brand-sage/10 blur-[120px]" />
    </div>
  );
}

/**
 * Motivo do INFINITO (símbolo da neurodiversidade), em traço dourado animado.
 * Decorativo — reforça o posicionamento sem afirmar dado algum.
 * Respeita prefers-reduced-motion (renderiza o traço já desenhado, sem o efeito de escrita).
 */
export function InfinityMotif({ className = '' }: { className?: string }) {
  const reduceMotion = useReducedMotion();
  return (
    <svg viewBox="0 0 240 120" className={className} fill="none" aria-hidden preserveAspectRatio="xMidYMid meet">
      <defs>
        <linearGradient id="ar-inf" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="rgb(var(--gold-neuro))" />
          <stop offset="1" stopColor="rgb(var(--terra))" />
        </linearGradient>
      </defs>
      <motion.path
        d="M70 60 C70 30 30 30 30 60 C30 90 70 90 120 60 C170 30 210 30 210 60 C210 90 170 90 120 60 C95 47 70 47 70 60 Z"
        stroke="url(#ar-inf)"
        strokeWidth="5"
        strokeLinecap="round"
        initial={reduceMotion ? { pathLength: 1, opacity: 1 } : { pathLength: 0, opacity: 0 }}
        whileInView={{ pathLength: 1, opacity: 1 }}
        viewport={{ once: true }}
        transition={reduceMotion ? { duration: 0 } : { duration: 1.8, ease: 'easeInOut' }}
      />
    </svg>
  );
}

/**
 * Cartão-retrato: usa a foto real (site.photos) quando houver; senão exibe um
 * monograma "AR" elegante sobre gradiente quente — placeholder honesto (nunca foto de terceiros).
 */
export function PortraitCard({ photo, className = '' }: { photo?: string; className?: string }) {
  return (
    <div className={`relative aspect-[4/5] w-full overflow-hidden rounded-3xl ${className}`}>
      {photo ? (
        <img src={photo} alt="Ana Rabottini" className="h-full w-full object-cover" />
      ) : (
        <div className="relative grid h-full w-full place-items-center bg-gradient-to-br from-brand-neon/20 via-brand-terra/15 to-brand-sage/15">
          <div className="absolute inset-0 bg-tech-grid opacity-40 [mask-image:radial-gradient(ellipse_at_center,black,transparent_75%)]" />
          <div className="relative text-center">
            <span className="font-display text-7xl font-extrabold tracking-tight text-brand-neon/80">AR</span>
            <p className="mt-2 text-xs font-semibold uppercase tracking-[0.25em] text-brand-muted">
              foto em breve
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
