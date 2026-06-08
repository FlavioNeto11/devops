/**
 * GALERIA — fotos REAIS dos trabalhos da RM Ambiental Brasil, importadas da página de
 * galeria do site atual (/projects-6 — "fotos que fazem parte da história da empresa").
 * Arquivos em public/images/gallery. Categorias inferidas pelo conteúdo de cada foto;
 * ajuste livremente. Para adicionar novas fotos, basta colocar o arquivo e uma entrada aqui.
 */
export type GalleryCategory =
  | 'Obras & Terraplanagem'
  | 'Supressão & Vegetação'
  | 'Britagem & Mineração'
  | 'Monitoramento'
  | 'Serviços técnicos';

export type GalleryPhoto = { file: string; category: GalleryCategory; alt: string };

export const galleryCategories = [
  'Todos',
  'Obras & Terraplanagem',
  'Supressão & Vegetação',
  'Britagem & Mineração',
  'Monitoramento',
  'Serviços técnicos',
] as const;

export const galleryPhotos: GalleryPhoto[] = [
  { file: 'gallery/g01.jpg', category: 'Obras & Terraplanagem', alt: 'Escavadeira e caminhão na limpeza de terreno urbano' },
  { file: 'gallery/g12.jpg', category: 'Obras & Terraplanagem', alt: 'Demolição e terraplanagem com escavadeira' },
  { file: 'gallery/g17.jpg', category: 'Obras & Terraplanagem', alt: 'Terraplanagem com escavadeira de esteira' },
  { file: 'gallery/g19.jpg', category: 'Obras & Terraplanagem', alt: 'Carregamento de caminhão durante terraplanagem' },
  { file: 'gallery/g21.jpg', category: 'Obras & Terraplanagem', alt: 'Escavadeira e caminhão em obra urbana' },
  { file: 'gallery/g11.jpg', category: 'Obras & Terraplanagem', alt: 'Remoção de tocos e escavação de terreno' },
  { file: 'gallery/g02.jpg', category: 'Supressão & Vegetação', alt: 'Supressão de árvore com escavadeira' },
  { file: 'gallery/g18.jpg', category: 'Supressão & Vegetação', alt: 'Supressão de árvore em área urbana' },
  { file: 'gallery/g05.jpg', category: 'Supressão & Vegetação', alt: 'Toras de madeira após supressão vegetal' },
  { file: 'gallery/g14.jpg', category: 'Supressão & Vegetação', alt: 'Transporte de resíduos vegetais' },
  { file: 'gallery/g22.jpg', category: 'Supressão & Vegetação', alt: 'Corte e carregamento de madeira' },
  { file: 'gallery/g10.jpg', category: 'Supressão & Vegetação', alt: 'Remoção de vegetação e limpeza de terreno urbano' },
  { file: 'gallery/g03.jpg', category: 'Britagem & Mineração', alt: 'Esteiras transportadoras de agregados em pedreira' },
  { file: 'gallery/g20.jpg', category: 'Britagem & Mineração', alt: 'Britador de mandíbulas em operação' },
  { file: 'gallery/g09.jpg', category: 'Britagem & Mineração', alt: 'Beneficiamento de agregados em pedreira' },
  { file: 'gallery/g23.jpg', category: 'Britagem & Mineração', alt: 'Pilhas de agregados e esteiras em pedreira' },
  { file: 'gallery/g06.jpg', category: 'Monitoramento', alt: 'Coleta de amostras ambientais em campo' },
  { file: 'gallery/g15.jpg', category: 'Monitoramento', alt: 'Coleta de água próxima à rede de drenagem' },
  { file: 'gallery/g13.jpg', category: 'Monitoramento', alt: 'Vistoria técnica em área de vegetação' },
  { file: 'gallery/g04.jpg', category: 'Monitoramento', alt: 'Instalação de equipamento técnico em campo' },
  { file: 'gallery/g07.jpg', category: 'Serviços técnicos', alt: 'Serviço técnico especializado em campo' },
  { file: 'gallery/g08.jpg', category: 'Serviços técnicos', alt: 'Serviço técnico em via pública' },
  { file: 'gallery/g24.jpg', category: 'Obras & Terraplanagem', alt: 'Escavadeira e caçamba na movimentação de material em área rural' },
  { file: 'gallery/g25.jpg', category: 'Obras & Terraplanagem', alt: 'Terraplanagem e limpeza de lote urbano' },
];
