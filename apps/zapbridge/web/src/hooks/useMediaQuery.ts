import { useEffect, useState } from 'react';

export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(
    () => typeof window !== 'undefined' && window.matchMedia(query).matches,
  );
  useEffect(() => {
    const m = window.matchMedia(query);
    const on = () => setMatches(m.matches);
    m.addEventListener('change', on);
    on();
    return () => m.removeEventListener('change', on);
  }, [query]);
  return matches;
}

// Desktop = 2 colunas (estilo WhatsApp Web). Abaixo disso, 1 coluna (mobile).
export const useIsDesktop = () => useMediaQuery('(min-width: 900px)');
