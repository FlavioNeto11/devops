import SectionRenderer from '../components/SectionRenderer';
import { useContentTree } from '../lib/SiteContext';
import { findPage } from '../lib/content';

/** /solucoes renderizada a partir do CMS (página 'solucoes'), com fallback embutido. */
export default function Solucoes() {
  const tree = useContentTree();
  const page = findPage(tree, 'solucoes');
  return <SectionRenderer sections={page?.sections || []} />;
}
