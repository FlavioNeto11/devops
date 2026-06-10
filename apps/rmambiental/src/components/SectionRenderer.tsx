import { useCallback, useEffect, useMemo, useState, type CSSProperties } from 'react';
import { Link } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { MessageCircle, ArrowRight, Check, X, ChevronLeft, ChevronRight, Package, Landmark, Sparkles, HelpCircle } from 'lucide-react';
import { Reveal, SectionHeading, Counter } from './ui';
import { GridGlow, CoverageMap } from './backgrounds';
import ContactSection from './ContactSection';
import { resolveIcon } from '../lib/icons';
import { useSite } from '../lib/SiteContext';
import { mediaUrl, type Section } from '../lib/content';
import { asset, cn } from '../lib/utils';

type D = Record<string, any>;

function titleNode(h: D) {
  return <>{h.title}{h.titleAccent && <span className="text-gradient">{h.titleAccent}</span>}{h.titleTail || ''}</>;
}
function Heading({ h }: { h?: D }) {
  if (!h || (!h.title && !h.eyebrow && !h.subtitle)) return null;
  return <SectionHeading eyebrow={h.eyebrow} center={h.center} title={titleNode(h)} subtitle={h.subtitle} />;
}
function CtaButton({ b }: { b: D }) {
  const { whatsappUrl } = useSite();
  if (b.kind === 'proposal') return <a href={whatsappUrl()} target="_blank" rel="noopener noreferrer" className="btn-primary"><MessageCircle className="h-4 w-4" /> {b.label}</a>;
  if (b.href) return <a href={b.href} className="btn-ghost">{b.label}</a>;
  return <Link to="/contato" className="btn-ghost">{b.label}</Link>;
}
const wrap = (anchor: string | null | undefined, surface: boolean) => cn('relative overflow-hidden py-24', surface && 'bg-brand-surface/30');

// --------------------------------------------------------------------------- Hero
function HeroBlock({ d }: { d: D }) {
  const ind: D[] = d.indicators || [];
  return (
    <section id="inicio" className="relative overflow-hidden pt-[72px]">
      <div className="absolute inset-0" aria-hidden>
        <img src={asset('images/decor/canyon.jpg')} alt="" className="h-full w-full object-cover" />
        <div className="absolute inset-0 bg-gradient-to-b from-brand-bg/70 via-brand-bg/30 to-brand-bg" />
        <div className="absolute inset-0 bg-gradient-to-r from-brand-bg via-brand-bg/60 to-transparent" />
      </div>
      <GridGlow />
      <div className="container-wide relative grid items-center gap-14 py-20 lg:grid-cols-[1.05fr_0.95fr] lg:py-28">
        <div>
          {d.eyebrow && <span className="eyebrow">{d.eyebrow}</span>}
          <h1 className="mt-6 font-display text-4xl font-extrabold leading-[1.05] tracking-tight text-brand-text sm:text-5xl lg:text-[3.4rem]">
            {d.title}<span className="text-gradient">{d.titleAccent}</span>{d.titleTail}
          </h1>
          <p className="mt-6 max-w-xl text-base leading-relaxed text-brand-muted sm:text-lg">{d.intro}</p>
          <div className="mt-9 flex flex-wrap items-center gap-3">
            {d.primaryCta && (d.primaryCta.kind === 'proposal'
              ? <Link to="/contato" className="btn-primary">{d.primaryCta.label} <ArrowRight className="h-4 w-4" /></Link>
              : <a href={d.primaryCta.href} className="btn-primary">{d.primaryCta.label} <ArrowRight className="h-4 w-4" /></a>)}
            {d.secondaryCta && <a href={d.secondaryCta.href || '/rmambiental/solucoes'} className="btn-ghost">{d.secondaryCta.label}</a>}
          </div>
          {ind.length > 0 && (
            <div className="mt-12 grid max-w-lg grid-cols-3 gap-6 border-t border-brand-text/10 pt-7">
              {ind.map((t) => (
                <div key={t.title}><div className="font-display text-sm font-bold text-brand-neon">{t.title}</div><div className="mt-1 text-xs leading-snug text-brand-muted">{t.desc}</div></div>
              ))}
            </div>
          )}
        </div>
        <motion.div initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.8, delay: 0.2 }} className="relative mx-auto w-full max-w-md">
          <div className="glass relative rounded-3xl p-5 shadow-glass">
            <div className="absolute -inset-px rounded-3xl bg-gradient-to-br from-brand-neon/10 to-transparent" aria-hidden />
            <div className="relative aspect-[420/480] w-full"><CoverageMap className="h-full w-full" /></div>
            <div className="relative mt-2 flex items-center justify-between rounded-xl border border-brand-text/10 bg-black/20 px-4 py-3">
              <span className="text-xs uppercase tracking-widest text-brand-muted">Pontos de atuação</span>
              <span className="font-display text-sm font-bold text-brand-neon">Brasil · multirregião</span>
            </div>
          </div>
        </motion.div>
      </div>
    </section>
  );
}

// --------------------------------------------------------------------------- Section heading
function HeadingBlock({ d, anchor, surface }: { d: D; anchor?: string | null; surface: boolean }) {
  return <section id={anchor || undefined} className={cn('relative py-20', surface && 'bg-brand-surface/30')}><div className="container-wide"><Heading h={d} /></div></section>;
}

// --------------------------------------------------------------------------- Rich text
function RichTextBlock({ d, anchor, surface }: { d: D; anchor?: string | null; surface: boolean }) {
  return (
    <section id={anchor || undefined} className={wrap(anchor, surface)}>
      <div className="container-wide"><Reveal><div className="mx-auto max-w-3xl">
        {d.eyebrow && <span className="eyebrow">{d.eyebrow}</span>}
        {d.heading && <h2 className="mt-5 font-display text-3xl font-bold tracking-tight text-brand-text sm:text-4xl">{d.heading}</h2>}
        <div className="mt-5 space-y-4 text-base leading-relaxed text-brand-muted [&_strong]:text-brand-text [&_a]:text-brand-neon [&_ul]:list-disc [&_ul]:pl-5" dangerouslySetInnerHTML={{ __html: d.html || '' }} />
      </div></Reveal></div>
    </section>
  );
}

// --------------------------------------------------------------------------- Card grid
function CardGridBlock({ d, anchor, surface }: { d: D; anchor?: string | null; surface: boolean }) {
  const cards: D[] = d.cards || [];
  const cols = d.columns === 5 ? 'sm:grid-cols-3 lg:grid-cols-5' : d.columns === 4 ? 'sm:grid-cols-2 lg:grid-cols-4' : d.columns === 2 ? 'lg:grid-cols-2' : 'sm:grid-cols-2 lg:grid-cols-3';
  return (
    <section id={anchor || undefined} className={wrap(anchor, surface)}>
      <div className="container-wide">
        <Heading h={d.heading} />
        <div className={cn('mt-12 grid grid-cols-1 gap-5', cols)}>
          {cards.map((c, i) => {
            const Ico = resolveIcon(c.icon);
            return (
              <Reveal key={(c.title || '') + i} delay={(i % 4) * 0.06}>
                <div className={cn('group h-full rounded-2xl border border-brand-text/10 bg-brand-surface/60 p-6 transition-all duration-300 hover:-translate-y-1 hover:border-brand-neon/30 hover:bg-brand-surface', d.center && 'text-center')}>
                  <span className={cn('grid h-12 w-12 place-items-center rounded-xl bg-brand-neon/12 ring-1 ring-brand-neon/20 transition-colors group-hover:bg-brand-neon/20', d.center && 'mx-auto')}><Ico className="h-6 w-6 text-brand-neon" /></span>
                  <h3 className="mt-5 font-display text-lg font-bold text-brand-text">{c.title}</h3>
                  {c.desc && <p className="mt-2 text-sm leading-relaxed text-brand-muted">{c.desc}</p>}
                  {Array.isArray(c.bullets) && c.bullets.length > 0 && (
                    <ul className="mt-4 grid gap-2 text-left sm:grid-cols-2">
                      {c.bullets.map((b: string) => <li key={b} className="flex items-start gap-2 text-sm text-brand-muted"><Check className="mt-0.5 h-4 w-4 shrink-0 text-brand-neon/80" />{b}</li>)}
                    </ul>
                  )}
                </div>
              </Reveal>
            );
          })}
        </div>
      </div>
    </section>
  );
}

// --------------------------------------------------------------------------- Timeline
function TimelineBlock({ d, anchor, surface }: { d: D; anchor?: string | null; surface: boolean }) {
  const steps: D[] = d.steps || [];
  return (
    <section id={anchor || undefined} className={wrap(anchor, surface)}>
      <div className="container-wide">
        <Heading h={d.heading} />
        <div className="relative mx-auto mt-16 max-w-3xl">
          <div className="absolute bottom-0 left-[27px] top-2 w-px bg-gradient-to-b from-brand-neon/50 via-brand-text/10 to-transparent md:left-1/2" aria-hidden />
          <div className="space-y-8">
            {steps.map((s, i) => {
              const Ico = resolveIcon(s.icon);
              return (
                <motion.div key={(s.title || '') + i} initial={{ opacity: 0, x: -16 }} whileInView={{ opacity: 1, x: 0 }} viewport={{ once: true, margin: '-60px' }} transition={{ duration: 0.5, delay: i * 0.06 }} className="relative flex items-start gap-5 md:odd:flex-row-reverse md:odd:text-right">
                  <span className="relative z-10 grid h-14 w-14 shrink-0 place-items-center rounded-2xl border border-brand-neon/30 bg-brand-bg text-brand-neon shadow-glow"><Ico className="h-6 w-6" /><span className="absolute -right-1 -top-1 grid h-5 w-5 place-items-center rounded-full bg-brand-neon text-[11px] font-bold text-brand-onNeon">{i + 1}</span></span>
                  <div className="flex-1 rounded-2xl border border-white/10 bg-brand-surface/70 p-5 md:max-w-[44%]"><h3 className="font-display text-base font-bold text-brand-text">{s.title}</h3><p className="mt-1.5 text-sm leading-relaxed text-brand-muted">{s.desc}</p></div>
                  <div className="hidden flex-1 md:block" aria-hidden />
                </motion.div>
              );
            })}
          </div>
        </div>
      </div>
    </section>
  );
}

// --------------------------------------------------------------------------- Stats / authority
function StatsBlock({ d, anchor, surface }: { d: D; anchor?: string | null; surface: boolean }) {
  const stats: D[] = d.stats || [];
  const diffs: string[] = d.differentials || [];
  return (
    <section id={anchor || undefined} className={wrap(anchor, surface)}>
      <div className="absolute inset-0 bg-tech-grid opacity-30 [mask-image:radial-gradient(ellipse_at_center,black,transparent_80%)]" aria-hidden />
      <div className="container-wide relative grid gap-14 lg:grid-cols-2 lg:items-center">
        <div>
          <Heading h={d.heading} />
          {diffs.length > 0 && (
            <ul className="mt-8 space-y-3">
              {diffs.map((dd, i) => (
                <Reveal key={dd} delay={i * 0.06}><li className="flex items-start gap-3 text-sm text-brand-text/90"><span className="mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full bg-brand-neon/15"><Check className="h-3 w-3 text-brand-neon" /></span>{dd}</li></Reveal>
              ))}
            </ul>
          )}
        </div>
        <div className="grid grid-cols-2 gap-5">
          {stats.map((s, i) => (
            <Reveal key={(s.label || '') + i} delay={i * 0.08}>
              <div className="rounded-2xl border border-brand-text/10 bg-brand-surface/60 p-7 text-center">
                <div className="font-display text-4xl font-extrabold text-brand-text sm:text-5xl"><Counter to={Number(s.to) || 0} prefix={s.prefix || ''} /></div>
                <div className="mt-2 text-sm leading-snug text-brand-muted">{s.label}</div>
              </div>
            </Reveal>
          ))}
          {d.note && <p className="col-span-2 text-center text-xs text-brand-muted/70">{d.note}</p>}
        </div>
      </div>
    </section>
  );
}

// --------------------------------------------------------------------------- Gallery (lightbox)
function GalleryBlock({ d, anchor, surface }: { d: D; anchor?: string | null; surface: boolean }) {
  const photos: D[] = d.photos || [];
  const categories: string[] = d.categories || ['Todos'];
  const [filter, setFilter] = useState(categories[0] || 'Todos');
  const list = useMemo(() => (filter === (categories[0] || 'Todos') ? photos : photos.filter((p) => p.category === filter)), [filter, photos, categories]);
  const [index, setIndex] = useState<number | null>(null);
  const active = index === null ? null : list[index];
  const close = useCallback(() => setIndex(null), []);
  const prev = useCallback(() => setIndex((i) => (i === null ? i : (i - 1 + list.length) % list.length)), [list.length]);
  const next = useCallback(() => setIndex((i) => (i === null ? i : (i + 1) % list.length)), [list.length]);
  const src = (p: D) => (p.url ? mediaUrl(p.url) : asset('images/' + p.file));

  useEffect(() => {
    if (index === null) return undefined;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') close(); else if (e.key === 'ArrowLeft') prev(); else if (e.key === 'ArrowRight') next(); };
    window.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => { window.removeEventListener('keydown', onKey); document.body.style.overflow = ''; };
  }, [index, close, prev, next]);

  return (
    <section id={anchor || undefined} className={wrap(anchor, surface)}>
      <div className="container-wide">
        <Heading h={d.heading} />
        <Reveal>
          <div className="mt-10 flex flex-wrap justify-center gap-2.5">
            {categories.map((c) => (
              <button key={c} type="button" onClick={() => { setFilter(c); }} aria-pressed={filter === c}
                className={cn('rounded-full border px-4 py-2 text-sm font-medium transition-all', filter === c ? 'border-brand-neon/40 bg-brand-neon/15 text-brand-neon' : 'border-brand-text/10 text-brand-muted hover:border-brand-text/25')}>{c}</button>
            ))}
          </div>
        </Reveal>
        <div className="mt-10 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {list.map((p, i) => (
            <button key={p.file || i} type="button" onClick={() => setIndex(i)} className="group relative aspect-[4/3] overflow-hidden rounded-xl border border-brand-text/10">
              <img src={src(p)} alt={p.alt || ''} loading="lazy" className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-110" />
              <span className="absolute inset-0 bg-brand-ink/0 transition-colors group-hover:bg-brand-ink/20" />
            </button>
          ))}
        </div>
      </div>
      <AnimatePresence>
        {active && index !== null && (
          <motion.div className="fixed inset-0 z-[70] flex items-center justify-center p-4 sm:p-8" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <div className="absolute inset-0 bg-black/85 backdrop-blur-sm" onClick={close} />
            <button onClick={close} aria-label="Fechar" className="absolute right-4 top-4 z-10 grid h-11 w-11 place-items-center rounded-full bg-white/90 text-black"><X className="h-5 w-5" /></button>
            <button onClick={prev} aria-label="Anterior" className="absolute left-3 top-1/2 z-10 grid h-11 w-11 -translate-y-1/2 place-items-center rounded-full bg-white/90 text-black sm:left-6"><ChevronLeft className="h-5 w-5" /></button>
            <button onClick={next} aria-label="Próximo" className="absolute right-3 top-1/2 z-10 grid h-11 w-11 -translate-y-1/2 place-items-center rounded-full bg-white/90 text-black sm:right-6"><ChevronRight className="h-5 w-5" /></button>
            <motion.figure key={active.file} className="relative max-h-[85vh] max-w-4xl" initial={{ scale: 0.96 }} animate={{ scale: 1 }} onClick={(e) => e.stopPropagation()}>
              <img src={src(active)} alt={active.alt || ''} className="max-h-[80vh] w-auto rounded-xl" />
              <figcaption className="mt-3 text-center text-sm text-white/80">{active.category} · {active.alt}</figcaption>
            </motion.figure>
          </motion.div>
        )}
      </AnimatePresence>
    </section>
  );
}

// --------------------------------------------------------------------------- CTA
function CtaBlock({ d }: { d: D }) {
  const buttons: D[] = d.buttons || [];
  return (
    <section className="relative py-20">
      <div className="container-wide">
        <motion.div initial={{ opacity: 0, y: 24 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, margin: '-80px' }} transition={{ duration: 0.6 }} className="relative overflow-hidden rounded-[28px] shadow-glass">
          <div className="absolute inset-0" aria-hidden>
            <img src={asset('images/decor/costa.jpg')} alt="" className="h-full w-full object-cover" />
            <div className="absolute inset-0 bg-gradient-to-br from-brand-ink/92 via-brand-ink/82 to-brand-petrol/80" />
            <div className="absolute inset-0 bg-tech-grid opacity-15" />
          </div>
          <div className="relative max-w-3xl p-9 sm:p-14">
            <h2 className="font-display text-3xl font-extrabold leading-tight text-white sm:text-4xl">{d.title}</h2>
            {d.text && <p className="mt-4 text-base leading-relaxed text-white/85 sm:text-lg">{d.text}</p>}
            <div className="mt-9 flex flex-wrap gap-3">
              {buttons.map((b, i) => <CtaButton key={i} b={b} />)}
            </div>
          </div>
        </motion.div>
      </div>
    </section>
  );
}

// --------------------------------------------------------------------------- Services detail (/solucoes)
function DetailList({ title, icon: Ico, items }: { title: string; icon: any; items: string[] }) {
  return (
    <div>
      <h4 className="flex items-center gap-2 font-display text-sm font-bold text-brand-text"><Ico className="h-4 w-4 text-brand-neon" /> {title}</h4>
      <ul className="mt-3 space-y-2">
        {(items || []).map((it) => <li key={it} className="flex items-start gap-2 text-sm text-brand-muted"><Check className="mt-0.5 h-4 w-4 shrink-0 text-brand-neon/70" /><span>{it}</span></li>)}
      </ul>
    </div>
  );
}
function ServicesDetailBlock({ d }: { d: D }) {
  const groups: D[] = d.groups || [];
  const h: D = d.heading || {};
  return (
    <>
      <section className="relative overflow-hidden pt-[72px]">
        <GridGlow />
        <div className="container-wide relative py-16 lg:py-20">
          {h.eyebrow && <Reveal><span className="eyebrow">{h.eyebrow}</span></Reveal>}
          <Reveal delay={0.05}><h1 className="mt-5 max-w-3xl font-display text-4xl font-extrabold leading-[1.08] tracking-tight text-brand-text sm:text-5xl">{h.title}<span className="text-gradient">{h.titleAccent}</span>{h.titleTail}</h1></Reveal>
          {h.subtitle && <Reveal delay={0.1}><p className="mt-4 max-w-2xl text-base text-brand-muted sm:text-lg">{h.subtitle}</p></Reveal>}
          <div className="mt-8 flex flex-wrap gap-2">
            {groups.map((g) => { const Ico = resolveIcon(g.icon); return (
              <a key={g.id} href={`#${g.id}`} className="inline-flex items-center gap-2 rounded-full border border-brand-text/10 px-4 py-2 text-sm font-medium text-brand-muted transition-colors hover:border-brand-neon/40 hover:text-brand-text"><Ico className="h-4 w-4 text-brand-neon" />{g.title}</a>
            ); })}
          </div>
        </div>
      </section>
      {groups.map((g, idx) => { const Ico = resolveIcon(g.icon); return (
        <section key={g.id || idx} id={g.id} className={cn('relative py-20', idx % 2 === 1 && 'bg-brand-surface/30')}>
          <div className="container-wide">
            <Reveal>
              <div className="flex items-start gap-4">
                <span className="grid h-14 w-14 shrink-0 place-items-center rounded-2xl bg-gradient-to-br from-brand-neon/20 to-brand-petrol/30 ring-1 ring-brand-text/10"><Ico className="h-7 w-7 text-brand-neon" /></span>
                <div><h2 className="font-display text-2xl font-bold leading-tight text-brand-text sm:text-3xl">{g.title}</h2><p className="mt-1 text-sm text-brand-neon/90">{g.tagline}</p></div>
              </div>
            </Reveal>
            {g.summary && <Reveal delay={0.05}><p className="mt-6 max-w-3xl text-base leading-relaxed text-brand-muted">{g.summary}</p></Reveal>}
            <div className="mt-9 grid gap-6 lg:grid-cols-2">
              <Reveal delay={0.08}>
                <div className="h-full rounded-2xl border border-brand-text/10 bg-brand-surface/50 p-6">
                  <DetailList title="Escopo de atuação" icon={Check} items={g.items} />
                  {g.whenToHire && (
                    <div className="mt-6 rounded-xl border border-brand-neon/15 bg-brand-neon/[0.06] p-4">
                      <h4 className="flex items-center gap-2 font-display text-sm font-bold text-brand-text"><HelpCircle className="h-4 w-4 text-brand-neon" /> Quando contratar</h4>
                      <p className="mt-2 text-sm leading-relaxed text-brand-muted">{g.whenToHire}</p>
                    </div>
                  )}
                </div>
              </Reveal>
              <Reveal delay={0.12}>
                <div className="grid h-full content-start gap-6 rounded-2xl border border-brand-text/10 bg-brand-surface/50 p-6">
                  <DetailList title="Principais entregáveis" icon={Package} items={g.deliverables} />
                  <div className="grid gap-6 sm:grid-cols-2">
                    <DetailList title="Órgãos envolvidos" icon={Landmark} items={g.orgaos} />
                    <DetailList title="Benefícios" icon={Sparkles} items={g.benefits} />
                  </div>
                </div>
              </Reveal>
            </div>
            {Array.isArray(g.steps) && g.steps.length > 0 && (
              <Reveal delay={0.1}>
                <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                  {g.steps.map((s: D, i: number) => (
                    <div key={s.title || i} className="relative rounded-2xl border border-brand-text/10 bg-brand-bg/40 p-5">
                      <span className="font-display text-sm font-bold text-brand-neon">0{i + 1}</span>
                      <h4 className="mt-2 font-display text-sm font-bold text-brand-text">{s.title}</h4>
                      <p className="mt-1 text-xs leading-relaxed text-brand-muted">{s.desc}</p>
                    </div>
                  ))}
                </div>
              </Reveal>
            )}
            <Reveal delay={0.1}><Link to="/contato" className="btn-primary mt-9">Falar com um especialista <ArrowRight className="h-4 w-4" /></Link></Reveal>
          </div>
        </section>
      ); })}
    </>
  );
}

// --------------------------------------------------------------------------- Contact form (/contato)
function ContactFormBlock({ d }: { d: D }) {
  const h: D = d.heading || {};
  return (
    <>
      <section className="relative overflow-hidden pt-[72px]">
        <GridGlow />
        <div className="container-wide relative py-16 text-center lg:py-20">
          {h.eyebrow && <Reveal><span className="eyebrow">{h.eyebrow}</span></Reveal>}
          <Reveal delay={0.05}><h1 className="mx-auto mt-5 max-w-3xl font-display text-4xl font-extrabold leading-tight tracking-tight text-brand-text sm:text-5xl">{h.title}<span className="text-gradient">{h.titleAccent}</span>{h.titleTail}</h1></Reveal>
          {h.subtitle && <Reveal delay={0.1}><p className="mx-auto mt-4 max-w-2xl text-base text-brand-muted sm:text-lg">{h.subtitle}</p></Reveal>}
        </div>
      </section>
      <ContactSection />
    </>
  );
}

// --------------------------------------------------------------------------- dispatcher
export default function SectionRenderer({ sections }: { sections: Section[] }) {
  return (
    <>
      {sections.map((s, i) => {
        const d = (s.data || {}) as D;
        const surface = i % 2 === 1;
        const a = s.anchor;
        switch (s.kind) {
          case 'hero': return <HeroBlock key={s.id || i} d={d} />;
          case 'section-heading': return <HeadingBlock key={s.id || i} d={d} anchor={a} surface={surface} />;
          case 'rich-text': return <RichTextBlock key={s.id || i} d={d} anchor={a} surface={surface} />;
          case 'card-grid':
          case 'feature-grid': return <CardGridBlock key={s.id || i} d={d} anchor={a} surface={surface} />;
          case 'timeline': return <TimelineBlock key={s.id || i} d={d} anchor={a} surface={surface} />;
          case 'stats': return <StatsBlock key={s.id || i} d={d} anchor={a} surface={surface} />;
          case 'gallery': return <GalleryBlock key={s.id || i} d={d} anchor={a} surface={surface} />;
          case 'cta': return <CtaBlock key={s.id || i} d={d} />;
          case 'services-detail': return <ServicesDetailBlock key={s.id || i} d={d} />;
          case 'contact-form': return <ContactFormBlock key={s.id || i} d={d} />;
          default: return null;
        }
      })}
    </>
  );
}
