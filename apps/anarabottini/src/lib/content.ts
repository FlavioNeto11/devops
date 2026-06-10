import type { SiteData } from './site';

// Tipos da árvore de conteúdo (espelham o que /devops/api/cms/public/<key> retorna).
export type Section = { id?: string; kind: string; anchor?: string | null; data: Record<string, unknown> };
export type Page = { slug: string; title: string; sections: Section[] };
export type ContentTree = { project?: { key: string; name?: string }; site: Partial<SiteData>; pages: Page[] };

// Endpoint público do CMS — mesma origem (dev.nvit.com.br). NÃO usar BASE_URL (=/anarabottini/).
const CMS_BASE = `${typeof location !== 'undefined' ? location.origin : ''}/devops/api/cms/public`;
const PORTAL_KEY = 'anarabottini';

/** Busca a árvore publicada do CMS (timeout curto). Lança em qualquer falha (o caller faz fallback). */
export async function fetchContent(): Promise<ContentTree> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 4000);
  try {
    const res = await fetch(`${CMS_BASE}/${PORTAL_KEY}`, { signal: ctrl.signal, headers: { Accept: 'application/json' } });
    if (!res.ok) throw new Error(`CMS ${res.status}`);
    const json = await res.json();
    const tree = json?.data as ContentTree;
    if (!tree || !Array.isArray(tree.pages)) throw new Error('CMS payload inválido');
    return tree;
  } finally {
    clearTimeout(t);
  }
}

/** Resolve a URL de uma mídia do CMS (fileId/url). */
export function mediaUrl(v?: string | null): string | undefined {
  if (!v) return undefined;
  if (/^https?:\/\//i.test(v) || v.startsWith('/')) return v;
  return `${CMS_BASE}/files/${v}`;
}

export function findPage(tree: ContentTree | null, slug: string): Page | undefined {
  return tree?.pages?.find((p) => p.slug === slug);
}
