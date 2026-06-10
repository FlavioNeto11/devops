import type { SiteData } from './site';

// status/visible só existem na árvore EDITÁVEL injetada em modo de edição.
export type Section = { id?: string; kind: string; anchor?: string | null; data: Record<string, unknown>; status?: string; visible?: boolean };
export type Page = { slug: string; title: string; sections: Section[]; status?: string };
export type ContentTree = { project?: { key: string; name?: string }; site: Partial<SiteData>; pages: Page[] };

const CMS_BASE = `${typeof location !== 'undefined' ? location.origin : ''}/devops/api/cms/public`;
const PORTAL_KEY = 'rmambiental';

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

export function mediaUrl(v?: string | null): string | undefined {
  if (!v) return undefined;
  if (/^https?:\/\//i.test(v) || v.startsWith('/')) return v;
  return `${CMS_BASE}/files/${v}`;
}

export function findPage(tree: ContentTree | null, slug: string): Page | undefined {
  return tree?.pages?.find((p) => p.slug === slug);
}
