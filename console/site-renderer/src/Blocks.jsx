import React from 'react';
import { resolveIcon } from './icons.js';
import { SectionFrame, EditableText, ItemControls, AddButton, MediaSlot, useEditMode } from './cmsEdit.jsx';

/**
 * Blocks — um renderer por `kind` (kinds GENÉRICOS do CMS + hero + image).
 * Kind desconhecido é ignorado (portal nunca quebra por causa de um bloco novo).
 * Em modo edição (console) cada texto vira editável in-place, listas ganham
 * controles por item + "adicionar", e mídia ganha upload no lugar.
 * O HTML de rich-text vem do editor/IA do próprio CMS (mesma origem, autenticado).
 */
const cx = (...a) => a.filter(Boolean).join(' ');

function Title({ h, base = '' }) {
  const edit = useEditMode();
  const p = (k) => (base ? `${base}.${k}` : k);
  if (edit) {
    return (
      <>
        <EditableText as="span" path={p('title')} value={h?.title || ''} placeholder="título" />
        <span className="sr-accent"><EditableText as="span" path={p('titleAccent')} value={h?.titleAccent || ''} placeholder="destaque" /></span>
        <EditableText as="span" path={p('titleTail')} value={h?.titleTail || ''} placeholder="" />
      </>
    );
  }
  if (!h) return null;
  return (
    <>
      {h.title}
      {h.titleAccent && <span className="sr-accent">{h.titleAccent}</span>}
      {h.titleTail || ''}
    </>
  );
}

function Heading({ h, base = 'heading' }) {
  const edit = useEditMode();
  if (!edit && (!h || (!h.title && !h.eyebrow && !h.subtitle))) return null;
  const hd = h || {};
  const p = (k) => (base ? `${base}.${k}` : k);
  return (
    <div className={cx('sr-heading', hd.center && 'is-center')}>
      {(edit || hd.eyebrow) && (
        <span className="sr-eyebrow">
          {edit ? <EditableText as="span" path={p('eyebrow')} value={hd.eyebrow || ''} placeholder="eyebrow" /> : hd.eyebrow}
        </span>
      )}
      {(edit || hd.title) && <h2><Title h={hd} base={base} /></h2>}
      {(edit || hd.subtitle) && (
        <p className="sr-sub">
          {edit ? <EditableText as="span" path={p('subtitle')} value={hd.subtitle || ''} placeholder="subtítulo" multiline /> : hd.subtitle}
        </p>
      )}
    </div>
  );
}

// CTA "proposal" → WhatsApp/e-mail do site; sem contato, rola para o rodapé.
function ctaHref(b, site) {
  if (b?.href) return b.href;
  const c = site?.contact || {};
  if (c.whatsapp) return `https://wa.me/${String(c.whatsapp).replace(/\D/g, '')}`;
  if (c.email) return `mailto:${c.email}`;
  return '#contato';
}

function Hero({ d, site }) {
  const edit = useEditMode();
  const ind = d.indicators || [];
  return (
    <section className="sr-hero">
      <div className="sr-container">
        {(edit || d.eyebrow) && (
          <span className="sr-eyebrow">
            {edit ? <EditableText as="span" path="eyebrow" value={d.eyebrow || ''} placeholder="eyebrow" /> : d.eyebrow}
          </span>
        )}
        <h1><Title h={d} /></h1>
        {(edit || d.intro) && (
          <p className="sr-hero__intro">
            {edit ? <EditableText as="span" path="intro" value={d.intro || ''} placeholder="introdução" multiline /> : d.intro}
          </p>
        )}
        <div className="sr-hero__ctas">
          {(edit || d.primaryCta?.label) && (
            <a className="sr-btn sr-btn--primary" href={edit ? undefined : ctaHref(d.primaryCta, site)} onClick={edit ? (e) => e.preventDefault() : undefined}>
              {edit ? <EditableText as="span" path="primaryCta.label" value={d.primaryCta?.label || ''} placeholder="botão principal" /> : d.primaryCta.label}
            </a>
          )}
          {(edit || d.secondaryCta?.label) && (
            <a className="sr-btn" href={edit ? undefined : ctaHref(d.secondaryCta, site)} onClick={edit ? (e) => e.preventDefault() : undefined}>
              {edit ? <EditableText as="span" path="secondaryCta.label" value={d.secondaryCta?.label || ''} placeholder="botão secundário" /> : d.secondaryCta.label}
            </a>
          )}
        </div>
        {(ind.length > 0 || edit) && (
          <div className="sr-hero__ind">
            {ind.map((t, i) => (
              <div key={i} className="cms-item">
                <strong>{edit ? <EditableText as="span" path={`indicators.${i}.title`} value={t.title || ''} placeholder="título" /> : t.title}</strong>
                <span>{edit ? <EditableText as="span" path={`indicators.${i}.desc`} value={t.desc || ''} placeholder="descrição" /> : t.desc}</span>
                <ItemControls path="indicators" index={i} count={ind.length} />
              </div>
            ))}
            <AddButton path="indicators" label="indicador" />
          </div>
        )}
      </div>
    </section>
  );
}

function CardGrid({ d }) {
  const edit = useEditMode();
  const cards = d.cards || [];
  const cols = Math.min(Math.max(Number(d.columns) || 3, 1), 4);
  return (
    <section className="sr-block">
      <div className="sr-container">
        <Heading h={d.heading} />
        <div className="sr-grid" style={{ '--cols': cols }}>
          {cards.map((c, i) => {
            const Ico = resolveIcon(c.icon);
            return (
              <article key={i} className="sr-card cms-item">
                <span className="sr-card__icon"><Ico size={20} /></span>
                <h3>{edit ? <EditableText as="span" path={`cards.${i}.title`} value={c.title || ''} placeholder="título" /> : c.title}</h3>
                {(edit || c.desc) && <p>{edit ? <EditableText as="span" path={`cards.${i}.desc`} value={c.desc || ''} placeholder="descrição" multiline /> : c.desc}</p>}
                <ItemControls path="cards" index={i} count={cards.length} />
              </article>
            );
          })}
        </div>
        <AddButton path="cards" label="card" />
      </div>
    </section>
  );
}

function Timeline({ d }) {
  const edit = useEditMode();
  const steps = d.steps || [];
  return (
    <section className="sr-block">
      <div className="sr-container">
        <Heading h={d.heading} />
        <ol className="sr-timeline">
          {steps.map((s, i) => {
            const Ico = resolveIcon(s.icon);
            return (
              <li key={i} className="cms-item">
                <span className="sr-timeline__n"><Ico size={16} /></span>
                <div>
                  <h3>{edit ? <EditableText as="span" path={`steps.${i}.title`} value={s.title || ''} placeholder="etapa" /> : s.title}</h3>
                  {(edit || s.desc) && <p>{edit ? <EditableText as="span" path={`steps.${i}.desc`} value={s.desc || ''} placeholder="descrição" multiline /> : s.desc}</p>}
                </div>
                <ItemControls path="steps" index={i} count={steps.length} />
              </li>
            );
          })}
        </ol>
        <AddButton path="steps" label="etapa" />
      </div>
    </section>
  );
}

function Accordion({ d }) {
  const edit = useEditMode();
  const items = d.items || [];
  return (
    <section className="sr-block">
      <div className="sr-container sr-narrow">
        <Heading h={d.heading} />
        {items.map((it, i) => (
          <details key={i} className="sr-faq cms-item" open={edit || undefined}>
            <summary>{edit ? <EditableText as="span" path={`items.${i}.q`} value={it.q || ''} placeholder="pergunta" /> : it.q}</summary>
            <p>{edit ? <EditableText as="span" path={`items.${i}.a`} value={it.a || ''} placeholder="resposta" multiline /> : it.a}</p>
            <ItemControls path="items" index={i} count={items.length} />
          </details>
        ))}
        <AddButton path="items" label="pergunta" />
      </div>
    </section>
  );
}

function Testimonials({ d }) {
  const edit = useEditMode();
  const items = d.items || [];
  return (
    <section className="sr-block">
      <div className="sr-container">
        <Heading h={d.heading} />
        <div className="sr-grid" style={{ '--cols': Math.min(items.length, 3) || 1 }}>
          {items.map((t, i) => (
            <blockquote key={i} className="sr-quote cms-item">
              <p>“{edit ? <EditableText as="span" path={`items.${i}.quote`} value={t.quote || ''} placeholder="depoimento" multiline /> : t.quote}”</p>
              <footer>
                {edit ? <EditableText as="span" path={`items.${i}.author`} value={t.author || ''} placeholder="autor" /> : t.author}
                {(edit || t.role) && <> · {edit ? <EditableText as="span" path={`items.${i}.role`} value={t.role || ''} placeholder="papel" /> : t.role}</>}
              </footer>
              <ItemControls path="items" index={i} count={items.length} />
            </blockquote>
          ))}
        </div>
        <AddButton path="items" label="depoimento" />
      </div>
    </section>
  );
}

function Logos({ d }) {
  const edit = useEditMode();
  const items = d.items || [];
  return (
    <section className="sr-block">
      <div className="sr-container">
        <Heading h={d.heading} />
        <div className="sr-logos">
          {items.map((l, i) => (
            <span key={i} className="cms-item">
              <MediaSlot path={`items.${i}.logoUrl`} empty={!l.logoUrl} compact className="sr-logos__slot">
                {l.logoUrl
                  ? <img src={l.logoUrl} alt={l.name || ''} loading="lazy" />
                  : <span className="sr-logos__name">{edit ? <EditableText as="span" path={`items.${i}.name`} value={l.name || ''} placeholder="marca" /> : l.name}</span>}
              </MediaSlot>
              <ItemControls path="items" index={i} count={items.length} />
            </span>
          ))}
        </div>
        <AddButton path="items" label="logo" />
      </div>
    </section>
  );
}

function Stats({ d }) {
  const edit = useEditMode();
  const listKey = Array.isArray(d.stats) ? 'stats' : 'items';
  const list = d.stats || d.items || [];
  return (
    <section className="sr-block">
      <div className="sr-container">
        <Heading h={d.heading} />
        <div className="sr-stats">
          {list.map((s, i) => (
            <div key={i} className="cms-item">
              <strong>{edit ? <EditableText as="span" path={`${listKey}.${i}.value`} value={s.value || s.title || ''} placeholder="número" /> : (s.value || s.title)}</strong>
              <span>{edit ? <EditableText as="span" path={`${listKey}.${i}.label`} value={s.label || s.desc || ''} placeholder="rótulo" /> : (s.label || s.desc)}</span>
              <ItemControls path={listKey} index={i} count={list.length} />
            </div>
          ))}
        </div>
        <AddButton path={listKey} label="número" />
      </div>
    </section>
  );
}

function VideoGallery({ d }) {
  const edit = useEditMode();
  const vids = (d.items || []).filter((v) => v.youtubeId || edit);
  if (!vids.length && !edit) return null;
  return (
    <section className="sr-block">
      <div className="sr-container">
        <Heading h={d.heading} />
        <div className="sr-grid" style={{ '--cols': Math.min(Math.max(vids.length, 1), 2) }}>
          {vids.map((v, i) => (
            <div key={i} className="sr-video cms-item">
              {v.youtubeId
                ? <iframe src={`https://www.youtube-nocookie.com/embed/${v.youtubeId}`} title={v.title || 'Vídeo'} loading="lazy" allowFullScreen
                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" />
                : <div className="sr-video__empty">defina o youtubeId no painel</div>}
              {(edit || v.title) && <p>{edit ? <EditableText as="span" path={`items.${i}.title`} value={v.title || ''} placeholder="título do vídeo" /> : v.title}</p>}
              <ItemControls path="items" index={i} count={vids.length} />
            </div>
          ))}
        </div>
        <AddButton path="items" label="vídeo" />
      </div>
    </section>
  );
}

function Materials({ d }) {
  const edit = useEditMode();
  const items = d.items || [];
  return (
    <section className="sr-block">
      <div className="sr-container sr-narrow">
        <Heading h={d.heading} />
        <ul className="sr-materials">
          {items.map((m, i) => {
            const Ico = resolveIcon(m.icon || 'FileText');
            return (
              <li key={i} className="cms-item">
                <span className="sr-card__icon"><Ico size={18} /></span>
                <div>
                  <h3>{edit ? <EditableText as="span" path={`items.${i}.title`} value={m.title || ''} placeholder="material" /> : m.title}</h3>
                  {(edit || m.desc) && <p>{edit ? <EditableText as="span" path={`items.${i}.desc`} value={m.desc || ''} placeholder="descrição" /> : m.desc}</p>}
                </div>
                {m.url && m.available !== false && <a className="sr-btn" href={m.url} target="_blank" rel="noopener noreferrer">Baixar</a>}
                <ItemControls path="items" index={i} count={items.length} />
              </li>
            );
          })}
        </ul>
        <AddButton path="items" label="material" />
      </div>
    </section>
  );
}

function ImageBlock({ d }) {
  const edit = useEditMode();
  return (
    <section className="sr-block">
      <div className={cx('sr-container', !d.full && 'sr-narrow')}>
        <MediaSlot path="url" empty={!d.url} className="sr-image">
          {d.url
            ? <img src={d.url} alt={d.alt || d.caption || ''} loading="lazy" />
            : <div className="sr-image__empty" />}
        </MediaSlot>
        {(edit || d.caption) && (
          <p className="sr-image__caption">
            {edit ? <EditableText as="span" path="caption" value={d.caption || ''} placeholder="legenda (opcional)" /> : d.caption}
          </p>
        )}
      </div>
    </section>
  );
}

function Cta({ d, site }) {
  const edit = useEditMode();
  const buttons = d.buttons || [];
  return (
    <section className="sr-block">
      <div className="sr-container">
        <div className="sr-cta">
          <h2><Title h={d} /></h2>
          {(edit || d.text) && <p>{edit ? <EditableText as="span" path="text" value={d.text || ''} placeholder="texto de apoio" multiline /> : d.text}</p>}
          <div className="sr-hero__ctas" style={{ justifyContent: 'center' }}>
            {buttons.map((b, i) => (
              <span key={i} className="cms-item">
                <a className={cx('sr-btn', i === 0 && 'sr-btn--invert')} href={edit ? undefined : ctaHref(b, site)} onClick={edit ? (e) => e.preventDefault() : undefined}>
                  {edit ? <EditableText as="span" path={`buttons.${i}.label`} value={b.label || ''} placeholder="botão" /> : b.label}
                </a>
                <ItemControls path="buttons" index={i} count={buttons.length} />
              </span>
            ))}
            <AddButton path="buttons" label="botão" />
          </div>
        </div>
      </div>
    </section>
  );
}

function RichText({ d }) {
  const edit = useEditMode();
  return (
    <section className="sr-block">
      <div className="sr-container sr-narrow">
        {(edit || d.eyebrow) && (
          <span className="sr-eyebrow">
            {edit ? <EditableText as="span" path="eyebrow" value={d.eyebrow || ''} placeholder="eyebrow" /> : d.eyebrow}
          </span>
        )}
        {(edit || d.heading) && (
          <h2 className="sr-rich__h">
            {edit ? <EditableText as="span" path="heading" value={d.heading || ''} placeholder="título" /> : d.heading}
          </h2>
        )}
        {/* HTML do editor/IA do próprio CMS; edição do corpo no painel (clique na moldura) */}
        <div className="sr-rich" dangerouslySetInnerHTML={{ __html: d.html || '' }} />
      </div>
    </section>
  );
}

const KINDS = {
  hero: Hero,
  'section-heading': ({ d }) => <section className="sr-block"><div className="sr-container"><Heading h={d} base="" /></div></section>,
  'rich-text': RichText,
  'card-grid': CardGrid,
  'feature-grid': CardGrid,
  timeline: Timeline,
  accordion: Accordion,
  testimonials: Testimonials,
  logos: Logos,
  stats: Stats,
  'video-gallery': VideoGallery,
  materials: Materials,
  image: ImageBlock,
  cta: Cta,
};

export default function Blocks({ sections, site }) {
  const count = sections.length;
  return (
    <>
      {sections.map((s, i) => {
        const K = KINDS[s.kind];
        if (!K) return null;
        return (
          <SectionFrame key={s.id || i} section={s} index={i} count={count}>
            <div id={s.anchor || undefined}>
              <K d={s.data || {}} site={site} />
            </div>
          </SectionFrame>
        );
      })}
    </>
  );
}
