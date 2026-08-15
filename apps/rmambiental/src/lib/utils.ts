/** Concatena classes condicionais (mini-clsx, sem dependência externa). */
export function cn(...classes: Array<string | false | null | undefined>): string {
  return classes.filter(Boolean).join(' ');
}

/** Rola até um elemento por id (compensado pelo header via scroll-margin no CSS).
 *  Respeita prefers-reduced-motion: sem animação quando o usuário pediu menos movimento. */
export function scrollToId(id: string): void {
  const el = document.getElementById(id);
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (el) el.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' });
}

/** Resolve um caminho de asset estático (public/) respeitando o base path /rmambiental/. */
export function asset(path: string): string {
  return import.meta.env.BASE_URL + path.replace(/^\//, '');
}
