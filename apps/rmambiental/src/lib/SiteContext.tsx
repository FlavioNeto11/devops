import React, { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { fetchContent, type ContentTree } from './content';
import { contentDefault } from '../data/content.default';
import { makeSiteApi, mergeSite, type SiteApi } from './site';
import { useEditMode, useEditTree, wantsEdit } from './cmsEdit';

type LoadState = 'loading' | 'live' | 'fallback';
type Ctx = { tree: ContentTree; state: LoadState; siteApi: SiteApi };

const ContentCtx = createContext<Ctx | null>(null);

/** Default-first; em modo de edição usa a árvore EDITÁVEL injetada pelo console
 *  (postMessage) no lugar do endpoint público. */
export function ContentProvider({ children }: { children: ReactNode }) {
  const editMode = useEditMode();
  const editTree = useEditTree();
  const [tree, setTree] = useState<ContentTree>(contentDefault);
  const [state, setState] = useState<LoadState>('loading');

  useEffect(() => {
    if (wantsEdit()) { setState('live'); return undefined; }
    let alive = true;
    fetchContent()
      .then((t) => { if (alive) { setTree(t); setState('live'); } })
      .catch(() => { if (alive) setState('fallback'); });
    return () => { alive = false; };
  }, []);

  const effective = (editMode && editTree) ? editTree : tree;
  const siteApi = useMemo(() => makeSiteApi(mergeSite(effective.site)), [effective]);
  const value = useMemo(() => ({ tree: effective, state, siteApi }), [effective, state, siteApi]);
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
