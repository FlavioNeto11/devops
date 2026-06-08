import { motion, useInView, animate } from 'framer-motion';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { cn } from '../lib/utils';

type RevealProps = { children: ReactNode; delay?: number; y?: number; className?: string };

/** Wrapper de scroll-reveal (entra ao aparecer no viewport). */
export function Reveal({ children, delay = 0, y = 26, className }: RevealProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-80px' }}
      transition={{ duration: 0.6, delay, ease: [0.22, 0.61, 0.36, 1] }}
      className={className}
    >
      {children}
    </motion.div>
  );
}

/** Contador numérico animado quando entra na tela. */
export function Counter({
  to,
  prefix = '',
  suffix = '',
  duration = 1.8,
}: {
  to: number;
  prefix?: string;
  suffix?: string;
  duration?: number;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true, margin: '-60px' });
  const [val, setVal] = useState(0);
  useEffect(() => {
    if (!inView) return;
    const controls = animate(0, to, {
      duration,
      ease: 'easeOut',
      onUpdate: (v) => setVal(Math.round(v)),
    });
    return () => controls.stop();
  }, [inView, to, duration]);
  return (
    <span ref={ref}>
      {prefix}
      {val}
      {suffix}
    </span>
  );
}

/** Cabeçalho de seção padronizado (eyebrow + título + subtítulo). */
export function SectionHeading({
  eyebrow,
  title,
  subtitle,
  center,
  className,
}: {
  eyebrow?: string;
  title: ReactNode;
  subtitle?: ReactNode;
  center?: boolean;
  className?: string;
}) {
  return (
    <div className={cn(center && 'mx-auto text-center', 'max-w-3xl', className)}>
      {eyebrow && (
        <Reveal>
          <span className="eyebrow">{eyebrow}</span>
        </Reveal>
      )}
      <Reveal delay={0.05}>
        <h2 className="mt-5 font-display text-3xl font-bold leading-[1.1] tracking-tight text-brand-text sm:text-4xl lg:text-[2.7rem]">
          {title}
        </h2>
      </Reveal>
      {subtitle && (
        <Reveal delay={0.1}>
          <p className="mt-4 text-base leading-relaxed text-brand-muted sm:text-lg">{subtitle}</p>
        </Reveal>
      )}
    </div>
  );
}
