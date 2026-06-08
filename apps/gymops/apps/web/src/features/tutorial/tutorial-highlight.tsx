'use client';

import { useEffect, useState } from 'react';

interface HighlightRect {
  top: number;
  left: number;
  width: number;
  height: number;
}

interface Props {
  target?: string;
}

/**
 * Desenha um recorte (4 overlays escuros ao redor + anel pulsante) sobre o
 * elemento `data-tutorial="..."` indicado. Se o elemento não existir, não
 * renderiza nada e deixa o overlay central cuidar.
 *
 * Atualiza posição em scroll/resize, sem polling.
 */
export function TutorialHighlight({ target }: Props) {
  const [rect, setRect] = useState<HighlightRect | null>(null);

  useEffect(() => {
    if (!target || typeof document === 'undefined') {
      setRect(null);
      return;
    }

    const update = () => {
      const el = document.querySelector(`[data-tutorial="${target}"]`);
      if (!el) {
        setRect(null);
        return;
      }
      const r = el.getBoundingClientRect();
      // padding de 6px para um halo confortável
      setRect({ top: r.top - 6, left: r.left - 6, width: r.width + 12, height: r.height + 12 });
      // garantir visibilidade
      el.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    };

    update();
    const id = window.setInterval(update, 500);
    window.addEventListener('resize', update);
    window.addEventListener('scroll', update, true);
    return () => {
      window.clearInterval(id);
      window.removeEventListener('resize', update);
      window.removeEventListener('scroll', update, true);
    };
  }, [target]);

  if (!rect) {
    // sem target → overlay opaco simples
    return <div className="fixed inset-0 z-[60] bg-black/55 pointer-events-auto" aria-hidden="true" />;
  }

  return (
    <div className="fixed inset-0 z-[60] pointer-events-none" aria-hidden="true">
      {/* 4 retângulos escuros cobrindo tudo menos o highlight */}
      <div className="absolute bg-black/55" style={{ top: 0, left: 0, right: 0, height: Math.max(0, rect.top) }} />
      <div className="absolute bg-black/55" style={{ top: rect.top + rect.height, left: 0, right: 0, bottom: 0 }} />
      <div className="absolute bg-black/55" style={{ top: rect.top, left: 0, width: Math.max(0, rect.left), height: rect.height }} />
      <div className="absolute bg-black/55" style={{ top: rect.top, left: rect.left + rect.width, right: 0, height: rect.height }} />
      {/* anel pulsante */}
      <div
        className="absolute rounded-md ring-2 ring-primary ring-offset-2 ring-offset-transparent animate-pulse"
        style={{ top: rect.top, left: rect.left, width: rect.width, height: rect.height }}
      />
    </div>
  );
}

/**
 * Calcula a posição preferida do step-card baseado no rect do highlight.
 * Retorna estilos CSS absolutos prontos para um wrapper fixo.
 */
export function useStepCardPosition(
  target: string | undefined,
  placement: 'top' | 'bottom' | 'left' | 'right' | 'center' | undefined,
): React.CSSProperties {
  const [style, setStyle] = useState<React.CSSProperties>({
    left: '50%',
    top: '50%',
    transform: 'translate(-50%, -50%)',
  });

  useEffect(() => {
    if (!target || placement === 'center' || typeof document === 'undefined') {
      setStyle({ left: '50%', top: '50%', transform: 'translate(-50%, -50%)' });
      return;
    }

    const update = () => {
      const el = document.querySelector(`[data-tutorial="${target}"]`);
      if (!el) {
        setStyle({ left: '50%', top: '50%', transform: 'translate(-50%, -50%)' });
        return;
      }
      const r = el.getBoundingClientRect();
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      const cardW = Math.min(360, vw - 32);
      const cardH = 220; // estimativa, basta para reposicionar
      const gap = 14;

      const candidates: Array<{ p: typeof placement; left: number; top: number }> = [];

      if (placement === 'bottom' || !placement) {
        candidates.push({ p: 'bottom', left: r.left + r.width / 2 - cardW / 2, top: r.bottom + gap });
      }
      if (placement === 'top') {
        candidates.push({ p: 'top', left: r.left + r.width / 2 - cardW / 2, top: r.top - cardH - gap });
      }
      if (placement === 'right') {
        candidates.push({ p: 'right', left: r.right + gap, top: r.top + r.height / 2 - cardH / 2 });
      }
      if (placement === 'left') {
        candidates.push({ p: 'left', left: r.left - cardW - gap, top: r.top + r.height / 2 - cardH / 2 });
      }
      // fallbacks
      candidates.push({ p: 'bottom', left: r.left + r.width / 2 - cardW / 2, top: r.bottom + gap });
      candidates.push({ p: 'top', left: r.left + r.width / 2 - cardW / 2, top: r.top - cardH - gap });

      const fits = candidates.find(
        (c) => c.left >= 8 && c.left + cardW <= vw - 8 && c.top >= 8 && c.top + cardH <= vh - 8,
      );
      const chosen = fits ?? candidates[0];
      if (!chosen) {
        setStyle({ left: '50%', top: '50%', transform: 'translate(-50%, -50%)' });
        return;
      }
      setStyle({
        left: Math.max(8, Math.min(vw - cardW - 8, chosen.left)),
        top: Math.max(8, Math.min(vh - cardH - 8, chosen.top)),
        width: cardW,
      });
    };

    update();
    const id = window.setInterval(update, 500);
    window.addEventListener('resize', update);
    window.addEventListener('scroll', update, true);
    return () => {
      window.clearInterval(id);
      window.removeEventListener('resize', update);
      window.removeEventListener('scroll', update, true);
    };
  }, [target, placement]);

  return style;
}
