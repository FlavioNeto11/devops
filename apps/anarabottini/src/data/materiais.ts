import { BookOpen, FileText, ListChecks, CalendarHeart, type LucideIcon } from 'lucide-react';

export type MaterialKind = 'pdf' | 'link' | 'form';

export type Recurso = {
  id: string;
  icon: LucideIcon;
  title: string;
  desc: string;
  kind: MaterialKind;
  /** PDF: nome do arquivo em public/materiais/ (servido em /anarabottini/materiais/...).
   *  link/form: URL completa. Vazio + available:false → estado "Em breve". */
  url: string;
  available: boolean;
};

export const materialKindLabel: Record<MaterialKind, string> = {
  pdf: 'PDF',
  link: 'Link',
  form: 'Formulário',
};

/**
 * Recursos/materiais para download ou acesso. PLACEHOLDERS: ao disponibilizar um
 * material, coloque o PDF em `public/materiais/` (ou uma URL externa), preencha
 * `url` e marque `available: true`. Enquanto isso, os cards mostram "Em breve".
 * Nada de conteúdo inventado — títulos descrevem materiais a serem produzidos.
 */
export const materiais: Recurso[] = [
  {
    id: 'ebook-nr1',
    icon: BookOpen,
    title: 'E-book: NR-1 e riscos psicossociais',
    desc: 'Visão geral didática das novas exigências e do que RH e SESMT precisam endereçar.',
    kind: 'pdf',
    url: '',
    available: false,
  },
  {
    id: 'guia-riscos',
    icon: FileText,
    title: 'Guia de riscos psicossociais',
    desc: 'Os principais fatores (sobrecarga, assédio, metas abusivas…) e os sinais de atenção.',
    kind: 'pdf',
    url: '',
    available: false,
  },
  {
    id: 'checklist-rh',
    icon: ListChecks,
    title: 'Checklist preventivo para o RH',
    desc: 'Pontos práticos para iniciar ações educativas de prevenção na sua empresa.',
    kind: 'pdf',
    url: '',
    available: false,
  },
  {
    id: 'calendario-campanhas',
    icon: CalendarHeart,
    title: 'Calendário de campanhas de saúde emocional',
    desc: 'Datas e ideias para Setembro Amarelo, Dia da Mulher e outras ações ao longo do ano.',
    kind: 'pdf',
    url: '',
    available: false,
  },
];

export const hasAnyMaterial = materiais.some((m) => m.available && m.url.trim().length > 0);
