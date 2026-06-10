import SectionRenderer from '../components/SectionRenderer';
import { useContentTree } from '../lib/SiteContext';
import { findPage } from '../lib/content';

/** /contato renderizada a partir do CMS (página 'contato'), com fallback embutido. */
export default function Contato() {
  const tree = useContentTree();
  const page = findPage(tree, 'contato');
  return <SectionRenderer sections={page?.sections || []} />;
}
