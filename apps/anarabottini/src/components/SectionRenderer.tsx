import { useMemo, useState, type CSSProperties } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ArrowRight, Check, Clock, Download, ExternalLink, Lock, Play, Clapperboard, Youtube, Instagram } from 'lucide-react';
import { Reveal, SectionHeading } from './ui';
import { GridGlow, PortraitCard, InfinityMotif } from './backgrounds';
import ProposalButton from './ProposalButton';
import Accordion from './Accordion';
import VideoLightbox from './VideoLightbox';
import PalestraModal from './PalestraModal';
import LeadForm from './LeadForm';
import { resolveIcon } from '../lib/icons';
import { resolveVideo } from '../lib/video';
import { useSite } from '../lib/SiteContext';
import { mediaUrl, type Section } from '../lib/content';
import { videoTipoLabel } from '../data/videos';
import { cn } from '../lib/utils';
import { SectionFrame, EditableText, ItemControls, AddButton, MediaSlot, useEditMode } from '../lib/cmsEdit';

type D = Record<string, any>;

// Título com acento em gradiente + cauda.
function titleNode(h: D) {
  return (
    <>
      {h.title}
      {h.titleAccent && <span className="text-gradient">{h.titleAccent}</span>}
      {h.titleTail || ''}
    </>
  );
}
// Cabeçalho de seção; em modo edição os textos viram editáveis in-place. `base`
// é o prefixo do caminho no `data` ('heading' quando h===d.heading; '' quando h===d).
function Heading({ h, base = 'heading' }: { h?: D; base?: string }) {
  const edit = useEditMode();
  if (!edit && (!h || (!h.title && !h.eyebrow && !h.subtitle))) return null;
  const hd: D = h || {};
  const p = (k: string) => (base ? `${base}.${k}` : k);
  if (edit) {
    return (
      <SectionHeading
        center={hd.center}
        eyebrow={<EditableText as="span" path={p('eyebrow')} value={hd.eyebrow || ''} placeholder="eyebrow" />}
        title={<><EditableText as="span" path={p('title')} value={hd.title || ''} placeholder="título" />{hd.titleAccent && <span className="text-gradient">{hd.titleAccent}</span>}{hd.titleTail || ''}</>}
        subtitle={<EditableText as="span" path={p('subtitle')} value={hd.subtitle || ''} placeholder="subtítulo" multiline />}
      />
    );
  }
  return <SectionHeading eyebrow={hd.eyebrow} center={hd.center} title={titleNode(hd)} subtitle={hd.subtitle} />;
}

const wrap = (anchor: string | null | undefined, surface: boolean, extra = '') =>
  cn('relative py-24', surface && 'bg-brand-surface2/50', extra);

// tipos aceitos no upload de materiais (espelha o allowlist do pm-api)
const DOC_ACCEPT = 'application/pdf,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.zip,.csv,.txt';
// vídeo: mimes + limite próprios (espelha o pm-api: vídeo até 50 MB)
const VIDEO_ACCEPT = 'video/mp4,video/webm,video/quicktime';
const VIDEO_MAX = 50 * 1024 * 1024;

/** Chip de status + slot de upload/biblioteca para o campo de vídeo de um item. */
function VideoChip({ path, value }: { path: string; value?: string }) {
  const v = resolveVideo(value);
  return (
    <MediaSlot compact path={path} accept={VIDEO_ACCEPT} maxSize={VIDEO_MAX} className="inline-flex w-fit rounded-full">
      <span className={cn('inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-semibold',
        v ? 'border-brand-neon/40 bg-brand-neon/12 text-brand-neon' : 'border-dashed border-brand-text/25 text-brand-muted')}>
        <Play className="h-3 w-3" /> {v ? (v.kind === 'youtube' ? 'Vídeo · YouTube' : 'Vídeo · arquivo') : 'Sem vídeo'}
      </span>
    </MediaSlot>
  );
}

// --------------------------------------------------------------------------- Hero
// Posições pré-definidas das labels flutuantes (floating[].position no CMS);
// sem position, mantém a ordem histórica por índice. Espelha o portal gêmeo
// (apps/rmambiental/src/components/SectionRenderer.tsx).
const FLOAT_POS: Record<string, CSSProperties> = {
  'top-left': { top: '6%', left: '-5%' },
  'top-right': { top: '8%', right: '-6%' },
  right: { top: '44%', right: '-6%' },
  left: { top: '44%', left: '-5%' },
  'bottom-left': { bottom: '8%', left: '-4%' },
  'bottom-right': { bottom: '10%', right: '-5%' },
};
const FLOAT_ORDER = ['top-left', 'right', 'bottom-left', 'top-right', 'bottom-right', 'left'];
const floatStyle = (f: D, i: number): CSSProperties => FLOAT_POS[f.position as string] || FLOAT_POS[FLOAT_ORDER[i % FLOAT_ORDER.length]];
// Fallback histórico: aparece no público enquanto o conteúdo do CMS não define
// floating (paridade com o portal gêmeo rmambiental).
const DEFAULT_FLOATING: D[] = [
  { icon: 'ShieldCheck', label: 'Adequação à NR-1', position: 'top-left' },
  { icon: 'Brain', label: 'Neurodiversidade', position: 'right' },
  { icon: 'HeartPulse', label: 'Saúde emocional', position: 'bottom-left' },
];

function HeroBlock({ d }: { d: D }) {
  const { site } = useSite();
  const edit = useEditMode();
  const allFloating: D[] = Array.isArray(d.floating) ? d.floating : (edit ? [] : DEFAULT_FLOATING);
  const floating: D[] = allFloating.filter((f: D) => f && f.visible !== false);
  return (
    <section id="inicio" className="relative overflow-hidden pt-[72px]">
      <GridGlow />
      <div className="container-wide relative grid items-center gap-14 py-20 lg:grid-cols-[1.05fr_0.95fr] lg:py-28">
        <div>
          {edit
            ? <EditableText as="span" className="eyebrow" path="eyebrow" value={d.eyebrow || ''} placeholder="eyebrow" />
            : d.eyebrow && <span className="eyebrow">{d.eyebrow}</span>}
          <p className="mt-6 font-display text-sm font-bold uppercase tracking-[0.3em] text-brand-neon">{d.name || site.name}</p>
          <p className="mt-1 text-sm font-medium text-brand-muted">{d.role || site.role}</p>
          <h1 className="mt-5 font-display text-4xl font-extrabold leading-[1.06] tracking-tight text-brand-text sm:text-5xl lg:text-[3.2rem]">
            {edit ? <EditableText as="span" path="title" value={d.title || ''} placeholder="título" /> : d.title}<span className="text-gradient">{d.titleAccent}</span>{d.titleTail}
          </h1>
          <p className="mt-6 max-w-xl text-base leading-relaxed text-brand-muted sm:text-lg">
            {edit ? <EditableText as="span" path="intro" value={d.intro || ''} placeholder="introdução" multiline /> : (d.intro || site.intro)}
          </p>
          <div className="mt-9 flex flex-wrap items-center gap-3">
            <ProposalButton label={d.primaryCta?.label || 'Solicitar proposta'} />
            {d.secondaryCta?.label && <a href={d.secondaryCta.href || '#palestras'} className="btn-ghost">{d.secondaryCta.label}</a>}
          </div>
          {Array.isArray(d.axes) && d.axes.length > 0 && (
            <div className="mt-12 grid max-w-lg grid-cols-3 gap-6 border-t border-brand-text/10 pt-7">
              {d.axes.map((a: D, i: number) => (
                <div key={a.title + i}>
                  <div className="font-display text-sm font-bold text-brand-neon">{edit ? <EditableText as="span" path={`axes.${i}.title`} value={a.title || ''} placeholder="título" /> : a.title}</div>
                  <div className="mt-1 text-xs leading-snug text-brand-muted">{edit ? <EditableText as="span" path={`axes.${i}.desc`} value={a.desc || ''} placeholder="descrição" multiline /> : a.desc}</div>
                </div>
              ))}
            </div>
          )}
        </div>
        <motion.div initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.8, delay: 0.2 }} className="relative mx-auto w-full max-w-sm">
          <div className="glass relative rounded-[2rem] p-4 shadow-glass">
            <div className="absolute -inset-px rounded-[2rem] bg-gradient-to-br from-brand-neon/12 to-transparent" aria-hidden />
            <MediaSlot site path="photos.hero" empty={!site.photos?.hero} accept="image/*" className="relative block rounded-3xl">
              <PortraitCard photo={mediaUrl(site.photos?.hero)} className="relative" />
            </MediaSlot>
            <div className="relative mt-3 flex items-center justify-between rounded-xl border border-brand-text/10 bg-brand-surface2/70 px-4 py-3">
              <span className="text-xs uppercase tracking-widest text-brand-muted">
                {edit ? <EditableText as="span" path="photoCaption" value={d.photoCaption || 'Palestrante corporativa'} placeholder="legenda" /> : (d.photoCaption || 'Palestrante corporativa')}
              </span>
              <span className="font-display text-sm font-bold text-brand-neon">{site.shortName}</span>
            </div>
          </div>
          {floating.map((f, i) => {
            const Ico = resolveIcon(f.icon);
            // idx = posição no array ORIGINAL: mantém o slot estável mesmo com
            // itens ocultos no meio (senão os demais "pulam" de posição).
            const idx = allFloating.indexOf(f);
            return (
              <motion.div key={(f.label || '') + i} className="absolute z-10 hidden items-center gap-2 rounded-xl border border-brand-text/10 bg-brand-surface/90 px-3.5 py-2.5 shadow-soft backdrop-blur-md sm:flex"
                style={floatStyle(f, idx)}
                initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6, delay: 0.55 + i * 0.18 }}>
                <span className="grid h-7 w-7 place-items-center rounded-lg bg-brand-neon/15"><Ico className="h-3.5 w-3.5 text-brand-neon" /></span>
                <span className="text-xs font-semibold text-brand-text">
                  {edit ? <EditableText as="span" path={`floating.${idx}.label`} value={f.label || ''} placeholder="label" /> : f.label}
                </span>
                {edit && <ItemControls path="floating" index={idx} count={allFloating.length} />}
              </motion.div>
            );
          })}
          {edit && (
            <div className="absolute -bottom-12 left-0">
              <AddButton path="floating" label="label flutuante" />
            </div>
          )}
        </motion.div>
      </div>
    </section>
  );
}

// --------------------------------------------------------------------------- Rich text
function RichTextBlock({ d, anchor, surface }: { d: D; anchor?: string | null; surface: boolean }) {
  const edit = useEditMode();
  return (
    <section id={anchor || undefined} className={wrap(anchor, surface)}>
      <div className="container-wide">
        <Reveal>
          <div className="mx-auto max-w-3xl">
            {edit
              ? <EditableText as="span" className="eyebrow" path="eyebrow" value={d.eyebrow || ''} placeholder="eyebrow" />
              : d.eyebrow && <span className="eyebrow">{d.eyebrow}</span>}
            {(edit || d.heading) && <h2 className="mt-5 font-display text-3xl font-bold leading-[1.12] tracking-tight text-brand-text sm:text-4xl">{edit ? <EditableText as="span" path="heading" value={d.heading || ''} placeholder="título" /> : d.heading}</h2>}
            <div className="prose-cms mt-5 space-y-4 text-base leading-relaxed text-brand-muted [&_strong]:text-brand-text [&_a]:text-brand-neon [&_ul]:list-disc [&_ul]:pl-5 [&_h2]:font-display [&_h2]:text-brand-text [&_h3]:font-display [&_h3]:text-brand-text"
              dangerouslySetInnerHTML={{ __html: d.html || '' }} />
          </div>
        </Reveal>
      </div>
    </section>
  );
}

// --------------------------------------------------------------------------- Section heading
function HeadingBlock({ d, anchor, surface }: { d: D; anchor?: string | null; surface: boolean }) {
  return (
    <section id={anchor || undefined} className={wrap(anchor, surface, 'py-20')}>
      <div className="container-wide"><Heading h={d} base="" /></div>
    </section>
  );
}

// --------------------------------------------------------------------------- Card grid
function CardGridBlock({ d, anchor, surface }: { d: D; anchor?: string | null; surface: boolean }) {
  const edit = useEditMode();
  const cards: D[] = d.cards || [];
  const cols = d.columns === 4 ? 'lg:grid-cols-4' : d.columns === 2 ? 'lg:grid-cols-2' : 'lg:grid-cols-3';
  const list = d.layout === 'list';
  return (
    <section id={anchor || undefined} className={wrap(anchor, surface)}>
      <div className="container-wide">
        <Heading h={d.heading} />
        <div className={cn('mt-12 grid gap-5 sm:grid-cols-2', cols)}>
          {cards.map((c, i) => {
            const Ico = resolveIcon(c.icon);
            const inner = (
              <div className={cn('group h-full rounded-3xl border border-brand-text/10 bg-brand-surface/70 p-6 shadow-card transition-all duration-300 hover:-translate-y-1 hover:border-brand-neon/30', d.heading?.center && 'text-center')}>
                <ItemControls path="cards" index={i} count={cards.length} />
                <span className={cn('grid h-12 w-12 place-items-center rounded-2xl bg-brand-neon/12 ring-1 ring-brand-text/10', d.heading?.center && 'mx-auto')}><Ico className="h-6 w-6 text-brand-neon" /></span>
                {(edit || c.tag) && <span className="mt-3 inline-block rounded-full bg-brand-neon/12 px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wider text-brand-neon">{edit ? <EditableText as="span" path={`cards.${i}.tag`} value={c.tag || ''} placeholder="tag" /> : c.tag}</span>}
                <h3 className="mt-4 font-display text-base font-bold text-brand-text">{edit ? <EditableText as="span" path={`cards.${i}.title`} value={c.title || ''} placeholder="título" /> : c.title}</h3>
                {c.subtitle && <p className="mt-0.5 text-sm italic text-brand-muted">{c.subtitle}</p>}
                {(edit || c.desc) && <p className="mt-2 text-sm leading-relaxed text-brand-muted">{edit ? <EditableText as="span" path={`cards.${i}.desc`} value={c.desc || ''} placeholder="descrição" multiline /> : c.desc}</p>}
                {Array.isArray(c.bullets) && c.bullets.length > 0 && (
                  <ul className="mt-3 grid gap-1.5 text-left">
                    {c.bullets.map((b: string) => <li key={b} className="flex items-start gap-2 text-sm text-brand-muted"><Check className="mt-0.5 h-4 w-4 shrink-0 text-brand-neon/80" />{b}</li>)}
                  </ul>
                )}
                {c.href && <a href={c.href} className="mt-4 inline-flex items-center gap-1.5 text-sm font-semibold text-brand-neon">Ver mais <ArrowRight className="h-4 w-4" /></a>}
              </div>
            );
            return <Reveal key={c.title + i} delay={(i % 4) * 0.06} className={cn(list ? 'sm:col-span-2 lg:col-span-3' : '', edit && 'cms-item')}>{inner}</Reveal>;
          })}
        </div>
        <AddButton path="cards" label="Adicionar card" />
      </div>
    </section>
  );
}

// --------------------------------------------------------------------------- Timeline
function TimelineBlock({ d, anchor, surface }: { d: D; anchor?: string | null; surface: boolean }) {
  const edit = useEditMode();
  const steps: D[] = d.steps || [];
  return (
    <section id={anchor || undefined} className={wrap(anchor, surface)}>
      <div className="container-wide">
        <Heading h={d.heading} />
        <div className="relative mt-14">
          <div className="absolute bottom-2 left-[27px] top-2 w-px bg-gradient-to-b from-brand-neon/50 via-brand-text/10 to-transparent md:left-1/2" aria-hidden />
          <div className="space-y-8">
            {steps.map((s, i) => {
              const Ico = resolveIcon(s.icon);
              return (
                <motion.div key={s.title + i} initial={{ opacity: 0, x: -16 }} whileInView={{ opacity: 1, x: 0 }} viewport={{ once: true, margin: '-60px' }} transition={{ duration: 0.5, delay: i * 0.06 }}
                  className={cn('relative flex items-start gap-5 md:odd:flex-row-reverse md:odd:text-right', edit && 'cms-item')}>
                  <ItemControls path="steps" index={i} count={steps.length} />
                  <span className="relative z-10 grid h-14 w-14 shrink-0 place-items-center rounded-2xl border border-brand-neon/30 bg-brand-bg text-brand-neon shadow-glow">
                    <Ico className="h-6 w-6" />
                    <span className="absolute -right-1 -top-1 grid h-5 w-5 place-items-center rounded-full bg-brand-neon text-[11px] font-bold text-brand-onNeon">{i + 1}</span>
                  </span>
                  <div className="flex-1 rounded-2xl border border-brand-text/10 bg-brand-surface/70 p-5 shadow-soft md:max-w-[44%]">
                    <h3 className="font-display text-base font-bold text-brand-text">{edit ? <EditableText as="span" path={`steps.${i}.title`} value={s.title || ''} placeholder="título" /> : s.title}</h3>
                    <p className="mt-1.5 text-sm leading-relaxed text-brand-muted">{edit ? <EditableText as="span" path={`steps.${i}.desc`} value={s.desc || ''} placeholder="descrição" multiline /> : s.desc}</p>
                  </div>
                </motion.div>
              );
            })}
          </div>
        </div>
        <AddButton path="steps" label="Adicionar etapa" />
      </div>
    </section>
  );
}

// --------------------------------------------------------------------------- Accordion (FAQ)
function AccordionBlock({ d, anchor, surface }: { d: D; anchor?: string | null; surface: boolean }) {
  const items = (d.items || []).map((it: D) => ({ q: it.q, a: it.a }));
  return (
    <section id={anchor || undefined} className={wrap(anchor, surface)}>
      <div className="container-wide">
        <Heading h={d.heading} />
        <div className="mx-auto mt-12 max-w-3xl"><Reveal><Accordion items={items} /></Reveal></div>
      </div>
    </section>
  );
}

// --------------------------------------------------------------------------- Video gallery
/** Miniatura de um vídeo: YouTube usa a thumb remota; arquivo/vazio, tile escuro. */
function VideoThumb({ value }: { value?: string }) {
  const v = resolveVideo(value);
  if (v?.kind === 'youtube') {
    return <img src={`https://img.youtube.com/vi/${v.id}/hqdefault.jpg`} alt="" loading="lazy" className="absolute inset-0 h-full w-full object-cover transition-transform duration-500 group-hover:scale-105" />;
  }
  return <span className="absolute inset-0 bg-gradient-to-br from-brand-ink via-brand-ink/90 to-brand-neon/20" aria-hidden />;
}

function VideoGalleryBlock({ d, anchor, surface }: { d: D; anchor?: string | null; surface: boolean }) {
  const { site, hasYoutube, hasInstagram } = useSite();
  const edit = useEditMode();
  const raw: D[] = d.items || [];
  const all: D[] = raw.map((v: D, i: number) => ({ id: v.id || `v${i}`, youtubeId: v.youtubeId ?? v.videoId ?? '', title: v.title, tipo: v.tipo || 'palestra' }));
  const disponiveis = all.filter((v) => (v.youtubeId || '').trim().length > 0);
  const [index, setIndex] = useState<number | null>(null);
  const vk = (j: number) => ('videoId' in (raw[j] || {}) ? 'videoId' : 'youtubeId');

  if (edit) {
    return (
      <section id={anchor || undefined} className={wrap(anchor, surface)}>
        <div className="container-wide">
          <Heading h={d.heading} />
          <div className="mt-14 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {all.map((v, i) => (
              <div key={v.id + i} className="cms-item group relative aspect-video w-full overflow-hidden rounded-2xl border border-brand-text/10 bg-brand-surface text-left shadow-card">
                <ItemControls path="items" index={i} count={all.length} />
                <MediaSlot path={`items.${i}.${vk(i)}`} accept={VIDEO_ACCEPT} maxSize={VIDEO_MAX} className="block h-full w-full">
                  <VideoThumb value={v.youtubeId} />
                  <span className="absolute inset-0 bg-gradient-to-t from-brand-ink/65 via-transparent to-transparent" aria-hidden />
                  <span className="absolute left-3 top-3 rounded-full bg-brand-surface/85 px-2.5 py-0.5 text-[11px] font-semibold text-brand-neon">{videoTipoLabel[v.tipo as keyof typeof videoTipoLabel] || v.tipo}</span>
                  <span className="absolute inset-0 grid place-items-center"><span className="grid h-14 w-14 place-items-center rounded-full bg-brand-neon/95 text-brand-onNeon shadow-glow"><Play className="h-6 w-6 translate-x-0.5" fill="currentColor" /></span></span>
                </MediaSlot>
                <span className="absolute inset-x-3 bottom-3 line-clamp-2 text-sm font-semibold text-white">
                  <EditableText as="span" path={`items.${i}.title`} value={v.title || ''} placeholder="título do vídeo" />
                </span>
              </div>
            ))}
          </div>
          <AddButton path="items" label="Adicionar vídeo" />
        </div>
      </section>
    );
  }

  return (
    <section id={anchor || undefined} className={wrap(anchor, surface)}>
      <div className="container-wide">
        <Heading h={d.heading} />
        {disponiveis.length > 0 ? (
          <div className="mt-14 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {disponiveis.map((v, i) => (
              <Reveal key={v.id} delay={(i % 3) * 0.07}>
                <button type="button" onClick={() => setIndex(i)} className="group relative block aspect-video w-full overflow-hidden rounded-2xl border border-brand-text/10 bg-brand-surface text-left shadow-card">
                  <VideoThumb value={v.youtubeId} />
                  <span className="absolute inset-0 bg-gradient-to-t from-brand-ink/65 via-transparent to-transparent" aria-hidden />
                  <span className="absolute left-3 top-3 rounded-full bg-brand-surface/85 px-2.5 py-0.5 text-[11px] font-semibold text-brand-neon">{videoTipoLabel[v.tipo as keyof typeof videoTipoLabel] || v.tipo}</span>
                  <span className="absolute inset-0 grid place-items-center"><span className="grid h-14 w-14 place-items-center rounded-full bg-brand-neon/95 text-brand-onNeon shadow-glow transition-transform duration-200 group-hover:scale-110"><Play className="h-6 w-6 translate-x-0.5" fill="currentColor" /></span></span>
                  <span className="absolute inset-x-3 bottom-3 line-clamp-2 text-sm font-semibold text-white">{v.title}</span>
                </button>
              </Reveal>
            ))}
          </div>
        ) : (
          <Reveal>
            <div className="mt-12 overflow-hidden rounded-3xl border border-brand-text/10 bg-brand-surface/70 p-8 text-center shadow-card sm:p-12">
              <span className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-brand-neon/12 text-brand-neon"><Clapperboard className="h-7 w-7" /></span>
              <h3 className="mt-5 font-display text-xl font-bold text-brand-text">Vídeos em breve</h3>
              <p className="mx-auto mt-3 max-w-xl text-sm leading-relaxed text-brand-muted">Em breve, trechos de palestras, entrevistas e depoimentos estarão disponíveis aqui. Enquanto isso, fale comigo{hasYoutube || hasInstagram ? ' ou acompanhe os conteúdos nas redes' : ''}.</p>
              <div className="mt-7 flex flex-wrap items-center justify-center gap-3">
                <ProposalButton label="Solicitar proposta" />
                {hasYoutube && <a href={site.media.youtube} target="_blank" rel="noopener noreferrer" className="btn-ghost"><Youtube className="h-4 w-4" /> YouTube</a>}
                {hasInstagram && <a href={site.social.instagram} target="_blank" rel="noopener noreferrer" className="btn-ghost"><Instagram className="h-4 w-4" /> Instagram</a>}
              </div>
            </div>
          </Reveal>
        )}
      </div>
      <VideoLightbox videos={disponiveis as any} index={index} onClose={() => setIndex(null)} onIndex={setIndex} />
    </section>
  );
}

// --------------------------------------------------------------------------- Materials
function MaterialsBlock({ d, anchor, surface }: { d: D; anchor?: string | null; surface: boolean }) {
  const edit = useEditMode();
  const items: D[] = d.items || [];
  const KIND_LABEL: Record<string, string> = { pdf: 'PDF', link: 'Link', form: 'Formulário' };
  return (
    <section id={anchor || undefined} className={wrap(anchor, surface)}>
      <div className="container-wide">
        <Heading h={d.heading} />
        <div className="mt-14 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {items.map((m, i) => {
            const Ico = resolveIcon(m.icon);
            const ready = m.available && (m.url || '').trim().length > 0;
            const href = mediaUrl(m.url);
            return (
              <Reveal key={(m.title || '') + i} delay={(i % 4) * 0.06} className={cn(edit && 'cms-item')}>
                <div className="flex h-full flex-col rounded-3xl border border-brand-text/10 bg-brand-surface/70 p-6 shadow-card">
                  <ItemControls path="items" index={i} count={items.length} />
                  <MediaSlot compact path={`items.${i}.url`} accept={DOC_ACCEPT} className="inline-grid w-fit rounded-2xl">
                    <span className="grid h-12 w-12 place-items-center rounded-2xl bg-brand-neon/12 ring-1 ring-brand-text/10"><Ico className="h-6 w-6 text-brand-neon" /></span>
                  </MediaSlot>
                  <span className="mt-4 inline-flex w-fit rounded-full bg-brand-surface2/80 px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wider text-brand-muted">{KIND_LABEL[m.kind] || m.kind}</span>
                  <h3 className="mt-3 font-display text-base font-bold leading-snug text-brand-text">{edit ? <EditableText as="span" path={`items.${i}.title`} value={m.title || ''} placeholder="título" /> : m.title}</h3>
                  <p className="mt-2 flex-1 text-sm leading-relaxed text-brand-muted">{edit ? <EditableText as="span" path={`items.${i}.desc`} value={m.desc || ''} placeholder="descrição" multiline /> : m.desc}</p>
                  <div className="mt-5">
                    {ready ? (
                      <a href={href} target={m.kind === 'pdf' ? undefined : '_blank'} rel="noopener noreferrer" {...(m.kind === 'pdf' ? { download: '' } : {})} className="inline-flex items-center gap-2 text-sm font-semibold text-brand-neon transition-all hover:gap-2.5">
                        {m.kind === 'pdf' ? <Download className="h-4 w-4" /> : <ExternalLink className="h-4 w-4" />}{m.kind === 'pdf' ? 'Baixar' : 'Acessar'}
                      </a>
                    ) : (
                      <span className="inline-flex items-center gap-2 text-sm font-medium text-brand-muted/70"><Lock className="h-4 w-4" /> Em breve</span>
                    )}
                  </div>
                </div>
              </Reveal>
            );
          })}
        </div>
        <AddButton path="items" label="Adicionar material" />
      </div>
    </section>
  );
}

// --------------------------------------------------------------------------- Palestras
function PalestrasBlock({ d, anchor, surface }: { d: D; anchor?: string | null; surface: boolean }) {
  const edit = useEditMode();
  const cats: D[] = d.categorias || [{ id: 'todas', label: 'Todas' }];
  const raw: D[] = d.items || [];
  const items: D[] = raw.map((p: D) => ({ ...p, videoId: p.videoId ?? p.youtubeId ?? '' }));
  const [filtro, setFiltro] = useState('todas');
  const [selected, setSelected] = useState<D | null>(null);
  // em edição mostra TODOS (índices casam com items.<i> do CMS); público filtra por categoria
  const lista = useMemo(() => (edit || filtro === 'todas' ? items : items.filter((p) => p.categoria === filtro)), [edit, filtro, items]);
  const vk = (j: number) => ('videoId' in (raw[j] || {}) ? 'videoId' : 'youtubeId');
  return (
    <section id={anchor || undefined} className={wrap(anchor, surface)}>
      <div className="container-wide">
        <Heading h={d.heading} />
        <Reveal>
          <div className="mt-10 flex flex-wrap gap-2.5">
            {cats.map((c) => (
              <button key={c.id} type="button" onClick={() => setFiltro(c.id)} aria-pressed={filtro === c.id}
                className={cn('rounded-full border px-4 py-2 text-sm font-medium transition-all', filtro === c.id ? 'border-brand-neon/40 bg-brand-neon/15 text-brand-neon' : 'border-brand-text/12 text-brand-muted hover:border-brand-text/25 hover:text-brand-text')}>{c.label}</button>
            ))}
          </div>
        </Reveal>
        {edit ? (
          /* versão de edição: sem animações de layout; cards com controles, textos
             inline e chip de vídeo (upload/biblioteca). "Ver detalhes" pré-visualiza o modal. */
          <div className="mt-10 grid gap-6 lg:grid-cols-2">
            {lista.map((p, i) => {
              const Ico = resolveIcon(p.icon);
              return (
                <div key={(p.id || '') + i} className="cms-item group relative flex h-full flex-col overflow-hidden rounded-3xl border border-brand-text/10 bg-brand-surface/70 p-7 text-left shadow-card sm:p-8">
                  <ItemControls path="items" index={i} count={lista.length} />
                  <div className="absolute right-0 top-0 h-40 w-40 translate-x-12 -translate-y-12 rounded-full bg-brand-terra/10 blur-3xl" />
                  <div className="relative">
                    <div className="flex items-start gap-4">
                      <span className="grid h-14 w-14 shrink-0 place-items-center rounded-2xl bg-gradient-to-br from-brand-neon/20 to-brand-terra/20 ring-1 ring-brand-text/10"><Ico className="h-7 w-7 text-brand-neon" /></span>
                      <div>
                        {p.tag && <span className="mb-1.5 inline-block rounded-full bg-brand-neon/12 px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wider text-brand-neon">{p.tag}</span>}
                        <h3 className="font-display text-xl font-bold leading-tight text-brand-text"><EditableText as="span" path={`items.${i}.title`} value={p.title || ''} placeholder="título" /></h3>
                        {p.subtitle && <p className="mt-1 text-sm italic text-brand-muted">{p.subtitle}</p>}
                      </div>
                    </div>
                    <p className="mt-5 text-sm leading-relaxed text-brand-muted"><EditableText as="span" path={`items.${i}.objetivo`} value={p.objetivo || ''} placeholder="objetivo" multiline /></p>
                    <div className="mt-5 flex flex-wrap gap-2">
                      {(p.temas || []).slice(0, 4).map((t: string) => <span key={t} className="rounded-full border border-brand-text/10 bg-brand-surface2/70 px-3 py-1 text-xs text-brand-text">{t}</span>)}
                      {(p.temas || []).length > 4 && <span className="rounded-full px-2 py-1 text-xs text-brand-muted">+{p.temas.length - 4}</span>}
                    </div>
                    <div className="mt-5 flex flex-wrap items-center gap-3">
                      <VideoChip path={`items.${i}.${vk(i)}`} value={p.videoId} />
                      <button type="button" className="inline-flex items-center gap-1.5 text-sm font-semibold text-brand-neon"
                        onClick={(e) => { e.stopPropagation(); setSelected(p); }}>
                        Ver detalhes <ArrowRight className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <motion.div layout className="mt-10 grid gap-6 lg:grid-cols-2">
            <AnimatePresence mode="popLayout">
              {lista.map((p, i) => {
                const Ico = resolveIcon(p.icon);
                return (
                  <motion.button key={p.id} type="button" layout onClick={() => setSelected(p)} initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, scale: 0.97 }} transition={{ duration: 0.35, delay: (i % 2) * 0.05 }} whileHover={{ y: -6 }}
                    className="group relative flex h-full flex-col overflow-hidden rounded-3xl border border-brand-text/10 bg-brand-surface/70 p-7 text-left shadow-card sm:p-8">
                    <div className="absolute right-0 top-0 h-40 w-40 translate-x-12 -translate-y-12 rounded-full bg-brand-terra/10 blur-3xl" />
                    <div className="relative">
                      <div className="flex items-start gap-4">
                        <span className="grid h-14 w-14 shrink-0 place-items-center rounded-2xl bg-gradient-to-br from-brand-neon/20 to-brand-terra/20 ring-1 ring-brand-text/10"><Ico className="h-7 w-7 text-brand-neon" /></span>
                        <div>
                          {p.tag && <span className="mb-1.5 inline-block rounded-full bg-brand-neon/12 px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wider text-brand-neon">{p.tag}</span>}
                          <h3 className="font-display text-xl font-bold leading-tight text-brand-text">{p.title}</h3>
                          {p.subtitle && <p className="mt-1 text-sm italic text-brand-muted">{p.subtitle}</p>}
                        </div>
                      </div>
                      <p className="mt-5 text-sm leading-relaxed text-brand-muted">{p.objetivo}</p>
                      <div className="mt-5 flex flex-wrap gap-2">
                        {(p.temas || []).slice(0, 4).map((t: string) => <span key={t} className="rounded-full border border-brand-text/10 bg-brand-surface2/70 px-3 py-1 text-xs text-brand-text">{t}</span>)}
                        {(p.temas || []).length > 4 && <span className="rounded-full px-2 py-1 text-xs text-brand-muted">+{p.temas.length - 4}</span>}
                      </div>
                      <span className="mt-6 inline-flex items-center gap-1.5 text-sm font-semibold text-brand-neon transition-all group-hover:gap-2.5">Ver detalhes <ArrowRight className="h-4 w-4" /></span>
                    </div>
                  </motion.button>
                );
              })}
            </AnimatePresence>
          </motion.div>
        )}
        <AddButton path="items" label="Adicionar palestra" />
      </div>
      <PalestraModal palestra={selected as any} onClose={() => setSelected(null)} />
    </section>
  );
}

// --------------------------------------------------------------------------- Testimonials
function TestimonialsBlock({ d, anchor, surface }: { d: D; anchor?: string | null; surface: boolean }) {
  const edit = useEditMode();
  const all: D[] = d.items || [];
  const items: D[] = edit ? all : all.filter((t: D) => (t.quote || '').trim());
  if (!edit && !items.length) return null;
  return (
    <section id={anchor || undefined} className={wrap(anchor, surface)}>
      <div className="container-wide">
        <Heading h={d.heading} />
        <div className="mt-12 grid gap-5 md:grid-cols-2 lg:grid-cols-3">
          {items.map((t, i) => (
            <Reveal key={i} delay={(i % 3) * 0.07} className={cn(edit && 'cms-item')}>
              <figure className="h-full rounded-3xl border border-brand-text/10 bg-brand-surface/70 p-7 shadow-card">
                <ItemControls path="items" index={i} count={items.length} />
                <blockquote className="text-sm leading-relaxed text-brand-text">“{edit ? <EditableText as="span" path={`items.${i}.quote`} value={t.quote || ''} placeholder="depoimento" multiline /> : t.quote}”</blockquote>
                <figcaption className="mt-5 text-sm"><span className="font-display font-bold text-brand-text">{edit ? <EditableText as="span" path={`items.${i}.author`} value={t.author || ''} placeholder="autor" /> : t.author}</span>{(edit || t.role) && <span className="block text-brand-muted">{edit ? <EditableText as="span" path={`items.${i}.role`} value={t.role || ''} placeholder="cargo" /> : t.role}</span>}</figcaption>
              </figure>
            </Reveal>
          ))}
        </div>
        <AddButton path="items" label="Adicionar depoimento" />
      </div>
    </section>
  );
}

// --------------------------------------------------------------------------- CTA
function CtaBlock({ d }: { d: D }) {
  const edit = useEditMode();
  const buttons: D[] = d.buttons || [];
  return (
    <section id="cta" className="relative py-24">
      <div className="container-wide">
        <Reveal>
          <div className="relative overflow-hidden rounded-[2.5rem] border border-brand-text/10 bg-gradient-to-br from-brand-surface to-brand-surface2 px-7 py-14 text-center shadow-card sm:px-12 sm:py-16">
            <InfinityMotif className="pointer-events-none absolute -left-8 -top-6 h-32 w-64 opacity-25" />
            <InfinityMotif className="pointer-events-none absolute -bottom-8 -right-6 h-32 w-64 rotate-180 opacity-20" />
            <div className="relative mx-auto max-w-2xl">
              <h2 className="font-display text-3xl font-bold leading-[1.12] tracking-tight text-brand-text sm:text-4xl">{edit ? <EditableText as="span" path="title" value={d.title || ''} placeholder="título" /> : d.title}<span className="text-gradient">{d.titleAccent}</span>{d.titleTail}</h2>
              {(edit || d.text) && <p className="mt-5 text-base leading-relaxed text-brand-muted sm:text-lg">{edit ? <EditableText as="span" path="text" value={d.text || ''} placeholder="texto" multiline /> : d.text}</p>}
              <div className="mt-9 flex flex-wrap items-center justify-center gap-3">
                {buttons.map((b, i) => b.kind === 'proposal'
                  ? <ProposalButton key={i} label={b.label} />
                  : <a key={i} href={b.href || '#'} className="btn-ghost">{b.label}</a>)}
              </div>
            </div>
          </div>
        </Reveal>
      </div>
    </section>
  );
}

// --------------------------------------------------------------------------- bloco por kind
function renderBlock(s: Section, i: number) {
  const d = (s.data || {}) as D;
  const surface = i % 2 === 1; // ritmo visual
  const a = s.anchor;
  switch (s.kind) {
    case 'hero': return <HeroBlock d={d} />;
    case 'rich-text': return <RichTextBlock d={d} anchor={a} surface={surface} />;
    case 'section-heading': return <HeadingBlock d={d} anchor={a} surface={surface} />;
    case 'card-grid':
    case 'feature-grid': return <CardGridBlock d={d} anchor={a} surface={surface} />;
    case 'timeline': return <TimelineBlock d={d} anchor={a} surface={surface} />;
    case 'accordion': return <AccordionBlock d={d} anchor={a} surface={surface} />;
    case 'video-gallery': return <VideoGalleryBlock d={d} anchor={a} surface={surface} />;
    case 'materials': return <MaterialsBlock d={d} anchor={a} surface={surface} />;
    case 'palestras': return <PalestrasBlock d={d} anchor={a} surface={surface} />;
    case 'testimonials': return <TestimonialsBlock d={d} anchor={a} surface={surface} />;
    case 'cta': return <CtaBlock d={d} />;
    case 'lead-form': return <section id={a || 'contato'} className={wrap(a, surface)}><div className="container-wide"><Heading h={d.heading} /><div className="mx-auto mt-8 max-w-3xl"><LeadForm variant="page" /></div></div></section>;
    default: return null;
  }
}

// --------------------------------------------------------------------------- dispatcher
export default function SectionRenderer({ sections }: { sections: Section[] }) {
  const count = sections.length;
  return (
    <>
      {sections.map((s, i) => {
        const block = renderBlock(s, i);
        if (!block) return null;
        return <SectionFrame key={s.id || i} section={s} index={i} count={count}>{block}</SectionFrame>;
      })}
    </>
  );
}
