import SectionRenderer from '../components/SectionRenderer';
import { useContentTree } from '../lib/SiteContext';
import { findPage } from '../lib/content';

/** Home renderizada a partir do conteúdo do CMS (com fallback embutido via ContentProvider). */
export default function Home() {
  const tree = useContentTree();
  const home = findPage(tree, 'home');
  return <SectionRenderer sections={home?.sections || []} />;
}
