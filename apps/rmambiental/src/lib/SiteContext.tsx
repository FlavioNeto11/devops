import React, { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { fetchContent, type ContentTree } from './content';
import { contentDefault } from '../data/content.default';
import { makeSiteApi, mergeSite, type SiteApi } from './site';

type LoadState = 'loading' | 'live' | 'fallback';
type Ctx = { tree: ContentTree; state: LoadState; siteApi: SiteApi };

const ContentCtx = createContext<Ctx | null>(null);

export function ContentProvider({ children }: { children: ReactNode }) {
  const [tree, setTree] = useState<ContentTree>(contentDefault);
  const [state, setState] = useState<LoadState>('loading');

  useEffect(() => {
    let alive = true;
    fetchContent()
      .then((t) => { if (alive) { setTree(t); setState('live'); } })
      .catch(() => { if (alive) setState('fallback'); });
    return () => { alive = false; };
  }, []);

  const siteApi = useMemo(() => makeSiteApi(mergeSite(tree.site)), [tree]);
  const value = useMemo(() => ({ tree, state, siteApi }), [tree, state, siteApi]);
  return <ContentCtx.Provider value={value}>{children}</ContentCtx.Provider>;
}

export function useSite(): SiteApi {
  const c = useContext(ContentCtx);
  return c ? c.siteApi : makeSiteApi(mergeSite(null));
}

export function useContentTree(): ContentTree {
  const c = useContext(ContentCtx);
  return c ? c.tree : contentDefault;
}
