/** Concatena classes condicionais (mini-clsx, sem dependência externa). */
export function cn(...classes: Array<string | false | null | undefined>): string {
  return classes.filter(Boolean).join(' ');
}

/** Rola suavemente até um elemento por id (compensado pelo header via scroll-margin no CSS). */
export function scrollToId(id: string): void {
  const el = document.getElementById(id);
  if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
}
