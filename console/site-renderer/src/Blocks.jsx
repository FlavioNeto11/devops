import React from 'react';
import { resolveIcon } from './icons.js';

/**
 * Blocks — um renderer por `kind` (kinds GENÉRICOS do CMS + hero). Kind
 * desconhecido é ignorado (portal nunca quebra por causa de um bloco novo).
 * O HTML de rich-text vem do editor/IA do próprio CMS (mesma origem, autenticado).
 */
const cx = (...a) => a.filter(Boolean).join(' ');

function Title({ h }) {
  if (!h) return null;
  return (
    <>
      {h.title}
      {h.titleAccent && <span className="sr-accent">{h.titleAccent}</span>}
      {h.titleTail || ''}
    </>
  );
}

function Heading({ h }) {
  if (!h || (!h.title && !h.eyebrow && !h.subtitle)) return null;
  return (
    <div className={cx('sr-heading', h.center && 'is-center')}>
      {h.eyebrow && <span className="sr-eyebrow">{h.eyebrow}</span>}
      {h.title && <h2><Title h={h} /></h2>}
      {h.subtitle && <p className="sr-sub">{h.subtitle}</p>}
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
  return (
    <section className="sr-hero">
      <div className="sr-container">
        {d.eyebrow && <span className="sr-eyebrow">{d.eyebrow}</span>}
        <h1><Title h={d} /></h1>
        {d.intro && <p className="sr-hero__intro">{d.intro}</p>}
        <div className="sr-hero__ctas">
          {d.primaryCta?.label && <a className="sr-btn sr-btn--primary" href={ctaHref(d.primaryCta, site)}>{d.primaryCta.label}</a>}
          {d.secondaryCta?.label && <a className="sr-btn" href={ctaHref(d.secondaryCta, site)}>{d.secondaryCta.label}</a>}
        </div>
        {Array.isArray(d.indicators) && d.indicators.length > 0 && (
          <div className="sr-hero__ind">
            {d.indicators.map((t, i) => (
              <div key={i}><strong>{t.title}</strong><span>{t.desc}</span></div>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}

function CardGrid({ d }) {
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
              <article key={i} className="sr-card">
                <span className="sr-card__icon"><Ico size={20} /></span>
                <h3>{c.title}</h3>
                {c.desc && <p>{c.desc}</p>}
              </article>
            );
          })}
        </div>
      </div>
    </section>
  );
}

function Timeline({ d }) {
  return (
    <section className="sr-block">
      <div className="sr-container">
        <Heading h={d.heading} />
        <ol className="sr-timeline">
          {(d.steps || []).map((s, i) => {
            const Ico = resolveIcon(s.icon);
            return (
              <li key={i}>
                <span className="sr-timeline__n"><Ico size={16} /></span>
                <div><h3>{s.title}</h3>{s.desc && <p>{s.desc}</p>}</div>
              </li>
            );
          })}
        </ol>
      </div>
    </section>
  );
}

function Accordion({ d }) {
  return (
    <section className="sr-block">
      <div className="sr-container sr-narrow">
        <Heading h={d.heading} />
        {(d.items || []).map((it, i) => (
          <details key={i} className="sr-faq">
            <summary>{it.q}</summary>
            <p>{it.a}</p>
          </details>
        ))}
      </div>
    </section>
  );
}

function Testimonials({ d }) {
  return (
    <section className="sr-block">
      <div className="sr-container">
        <Heading h={d.heading} />
        <div className="sr-grid" style={{ '--cols': Math.min((d.items || []).length, 3) || 1 }}>
          {(d.items || []).map((t, i) => (
            <blockquote key={i} className="sr-quote">
              <p>“{t.quote}”</p>
              <footer>{t.author}{t.role ? ` · ${t.role}` : ''}</footer>
            </blockquote>
          ))}
        </div>
      </div>
    </section>
  );
}

function Logos({ d }) {
  return (
    <section className="sr-block">
      <div className="sr-container">
        <Heading h={d.heading} />
        <div className="sr-logos">
          {(d.items || []).map((l, i) => (
            l.logoUrl
              ? <img key={i} src={l.logoUrl} alt={l.name || ''} loading="lazy" />
              : <span key={i} className="sr-logos__name">{l.name}</span>
          ))}
        </div>
      </div>
    </section>
  );
}

function Stats({ d }) {
  return (
    <section className="sr-block">
      <div className="sr-container">
        <Heading h={d.heading} />
        <div className="sr-stats">
          {(d.stats || d.items || []).map((s, i) => (
            <div key={i}><strong>{s.value || s.title}</strong><span>{s.label || s.desc}</span></div>
          ))}
        </div>
      </div>
    </section>
  );
}

function VideoGallery({ d }) {
  const vids = (d.items || []).filter((v) => v.youtubeId);
  if (!vids.length) return null;
  return (
    <section className="sr-block">
      <div className="sr-container">
        <Heading h={d.heading} />
        <div className="sr-grid" style={{ '--cols': Math.min(vids.length, 2) }}>
          {vids.map((v, i) => (
            <div key={i} className="sr-video">
              <iframe
                src={`https://www.youtube-nocookie.com/embed/${v.youtubeId}`}
                title={v.title || 'Vídeo'} loading="lazy" allowFullScreen
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
              />
              {v.title && <p>{v.title}</p>}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function Materials({ d }) {
  return (
    <section className="sr-block">
      <div className="sr-container sr-narrow">
        <Heading h={d.heading} />
        <ul className="sr-materials">
          {(d.items || []).map((m, i) => {
            const Ico = resolveIcon(m.icon || 'FileText');
            return (
              <li key={i}>
                <span className="sr-card__icon"><Ico size={18} /></span>
                <div><h3>{m.title}</h3>{m.desc && <p>{m.desc}</p>}</div>
                {m.url && m.available !== false && <a className="sr-btn" href={m.url} target="_blank" rel="noopener noreferrer">Baixar</a>}
              </li>
            );
          })}
        </ul>
      </div>
    </section>
  );
}

function Cta({ d, site }) {
  return (
    <section className="sr-block">
      <div className="sr-container">
        <div className="sr-cta">
          <h2><Title h={d} /></h2>
          {d.text && <p>{d.text}</p>}
          <div className="sr-hero__ctas">
            {(d.buttons || []).map((b, i) => (
              <a key={i} className={cx('sr-btn', i === 0 && 'sr-btn--invert')} href={ctaHref(b, site)}>{b.label}</a>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

function RichText({ d }) {
  return (
    <section className="sr-block">
      <div className="sr-container sr-narrow">
        {d.eyebrow && <span className="sr-eyebrow">{d.eyebrow}</span>}
        {d.heading && <h2 className="sr-rich__h">{d.heading}</h2>}
        {/* HTML do editor/IA do próprio CMS (origem autenticada da plataforma) */}
        <div className="sr-rich" dangerouslySetInnerHTML={{ __html: d.html || '' }} />
      </div>
    </section>
  );
}

const KINDS = {
  hero: Hero,
  'section-heading': ({ d }) => <section className="sr-block"><div className="sr-container"><Heading h={d} /></div></section>,
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
  cta: Cta,
};

export default function Blocks({ sections, site }) {
  return (
    <>
      {sections.map((s, i) => {
        const K = KINDS[s.kind];
        if (!K) return null;
        return (
          <div key={s.id || i} id={s.anchor || undefined}>
            <K d={s.data || {}} site={site} />
          </div>
        );
      })}
    </>
  );
}
