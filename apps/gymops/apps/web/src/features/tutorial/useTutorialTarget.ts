'use client';

/**
 * Hook utilitário para gerar o atributo `data-tutorial`.
 * Uso:
 *   const targetProps = useTutorialTarget('dashboard-kpis');
 *   <section {...targetProps}>...</section>
 *
 * Em código real é comum apenas escrever `data-tutorial="..."` direto.
 * Este hook existe para padronizar e facilitar troca para outro mecanismo
 * (ex: ref tracking) no futuro sem refatorar todos os componentes.
 */
export function useTutorialTarget(target: string): { 'data-tutorial': string } {
  return { 'data-tutorial': target };
}
