import type { BlueprintArea, BlueprintTemplate, BlueprintUnit } from '@/lib/profile-api';

export type SetupMode = 'ai' | 'manual';

export type SetupStep =
  | 'mode'      // escolha IA × manual
  | 'describe'  // (ai) descrição do negócio
  | 'review'    // (ai) proposta editável
  | 'org'       // (manual) nome + slug
  | 'areas'     // (manual) áreas editáveis
  | 'owner'     // conta do administrador
  | 'units'     // (manual) unidades 0-5
  | 'confirm';  // resumo + criar

/** Área em edição no wizard (templates sempre materializados na UI). */
export interface EditableArea extends Omit<BlueprintArea, 'templates'> {
  templates: BlueprintTemplate[];
  /** true = veio do catálogo canônico e NÃO foi alterada estruturalmente
   *  (key mantida) → o backend completa com os templates canônicos. */
  canonical: boolean;
}

export interface WizardState {
  mode: SetupMode | null;
  // org
  orgName: string;
  slug: string;
  slugManual: boolean;
  // ai
  businessDescription: string;
  segmentLabel: string | null;
  confidence: number | null;
  reasoning: string | null;
  aiProposed: boolean;
  // estrutura
  areas: EditableArea[];
  areasDirty: boolean;
  units: BlueprintUnit[];
  // owner
  ownerName: string;
  ownerEmail: string;
  ownerPassword: string;
  confirmPassword: string;
}

export const PALETTE = ['#6366f1', '#ec4899', '#f59e0b', '#10b981', '#3b82f6', '#8b5cf6', '#ef4444', '#14b8a6', '#f97316', '#06b6d4'];

/**
 * Espelho de EXIBIÇÃO do catálogo canônico do backend
 * (apps/api/src/lib/bootstrap-organization.ts — fonte da verdade). Usado só
 * para o passo manual mostrar as áreas padrão; os templates canônicos são
 * anexados pelo BACKEND quando a key canônica vai sem `templates`.
 */
export const CANONICAL_AREAS_DISPLAY: Array<Omit<EditableArea, 'templates' | 'canonical'> & { templateCount: number }> = [
  { key: 'administrativo', name: 'Administrativo',       color: '#6366f1', visibilityDefault: 'inherited',  templateCount: 4 },
  { key: 'marketing',      name: 'Marketing',            color: '#ec4899', visibilityDefault: 'inherited',  templateCount: 4 },
  { key: 'coordenacao',    name: 'Coordenação',          color: '#f59e0b', visibilityDefault: 'inherited',  templateCount: 4 },
  { key: 'manutencao',     name: 'Estrutura/Manutenção', color: '#10b981', visibilityDefault: 'inherited',  templateCount: 4 },
  { key: 'financeiro',     name: 'Financeiro',           color: '#3b82f6', visibilityDefault: 'restricted', templateCount: 4 },
  { key: 'lider',          name: 'Liderança',            color: '#8b5cf6', visibilityDefault: 'restricted', templateCount: 4 },
];

export function toSlug(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replaceAll(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

export function toKebabKey(value: string): string {
  return toSlug(value).slice(0, 40);
}

export const INITIAL_WIZARD: WizardState = {
  mode: null,
  orgName: '',
  slug: '',
  slugManual: false,
  businessDescription: '',
  segmentLabel: null,
  confidence: null,
  reasoning: null,
  aiProposed: false,
  areas: [],
  areasDirty: false,
  units: [],
  ownerName: '',
  ownerEmail: '',
  ownerPassword: '',
  confirmPassword: '',
};
