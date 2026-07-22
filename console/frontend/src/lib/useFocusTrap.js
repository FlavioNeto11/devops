import { useEffect, useRef } from 'react';

/**
 * useFocusTrap — trap de foco acessível para diálogos (modais e drawers).
 *
 * Ao montar: guarda o elemento que tinha o foco e move o foco para DENTRO do
 * container (respeitando um autoFocus já existente). Enquanto aberto, Tab/Shift+Tab
 * ciclam apenas nos focáveis do diálogo (não escapam para o fundo inerte). Ao
 * desmontar: devolve o foco ao controle que abriu o diálogo.
 *
 * O efeito roda UMA vez (deps [ref], ref estável) — re-renders (ex.: snapshots SSE,
 * carga de tasks) não re-executam o foco inicial nem roubam o foco do usuário.
 *
 * @param {React.RefObject<HTMLElement>} ref  container do diálogo (role="dialog").
 * @param {{ getInitialFocus?: (root: HTMLElement) => HTMLElement|null }} [opts]
 *   getInitialFocus escolhe o alvo do foco inicial; por padrão, o primeiro focável.
 */
const FOCUSABLE = [
  'a[href]', 'area[href]',
  'input:not([disabled]):not([type="hidden"])',
  'select:not([disabled])', 'textarea:not([disabled])',
  'button:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
  '[contenteditable="true"]',
].join(',');

export function useFocusTrap(ref, { getInitialFocus } = {}) {
  // getInitialFocus costuma ser uma arrow inline (identidade nova a cada render);
  // guardamos num ref para o efeito de montagem não depender dela.
  const getInitialRef = useRef(getInitialFocus);
  useEffect(() => { getInitialRef.current = getInitialFocus; });

  useEffect(() => {
    const root = ref.current;
    if (!root) return undefined;
    const prevFocused = document.activeElement;

    const focusables = () => Array.from(root.querySelectorAll(FOCUSABLE))
      .filter((el) => el === document.activeElement
        || el.offsetWidth > 0 || el.offsetHeight > 0 || el.getClientRects().length > 0);

    // Foco inicial (após a animação de entrada), só se nada dentro já tem foco.
    const t = setTimeout(() => {
      const node = ref.current;
      if (!node || node.contains(document.activeElement)) return;
      const target = (getInitialRef.current && getInitialRef.current(node))
        || focusables()[0] || node;
      if (target && target.focus) target.focus();
    }, 30);

    const onKeyDown = (e) => {
      if (e.key !== 'Tab') return;
      const els = focusables();
      if (!els.length) { e.preventDefault(); return; }
      const first = els[0];
      const last = els[els.length - 1];
      const active = document.activeElement;
      if (e.shiftKey) {
        if (active === first || !root.contains(active)) { e.preventDefault(); last.focus(); }
      } else if (active === last || !root.contains(active)) {
        e.preventDefault();
        first.focus();
      }
    };
    root.addEventListener('keydown', onKeyDown);

    return () => {
      clearTimeout(t);
      root.removeEventListener('keydown', onKeyDown);
      // Devolve o foco ao controle que abriu o diálogo (se ainda existir no DOM).
      if (prevFocused && prevFocused.focus && document.contains(prevFocused)) {
        prevFocused.focus();
      }
    };
    // ref é estável → monta uma vez.
  }, [ref]);
}
