import { z } from 'zod';

// ── Blueprint de provisionamento de organização ───────────────────────────────
// Estrutura inicial (áreas + templates + unidades) que o onboarding envia para
// bootstrapOrganization(). Pode vir do fluxo MANUAL (usuário monta) ou do
// rascunho da IA (POST /organizations/setup-draft) DEPOIS de revisado/edita do
// pelo humano. Aqui validamos apenas SHAPE e limites estruturais — nenhuma
// lista de segmentos ou mapa segmento→áreas vive no código (diretriz da
// plataforma: conteúdo é decisão do usuário/IA; o código executa o contrato).

const kebabKey = z.string().min(2).max(40).regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, 'key deve ser kebab-case (a-z, 0-9, hífens)');
const hexColor = z.string().regex(/^#[0-9a-fA-F]{6}$/, 'cor deve ser hex #rrggbb');

export const BlueprintTemplateSchema = z.object({
  name: z.string().min(3).max(120),
  description: z.string().max(300).optional(),
  defaultChecklist: z.array(z.string().min(2).max(160)).max(12).default([]),
  defaultPriority: z.enum(['baixa', 'media', 'alta', 'critica']).default('media'),
  defaultVisibility: z.enum(['inherited', 'restricted']).default('inherited'),
  suggestedSlaDays: z.number().int().min(0).max(90).optional(),
  specificFields: z.array(z.string().regex(/^[a-z][a-z0-9_]*$/).max(40)).max(8).optional(),
});

export const BlueprintAreaSchema = z.object({
  key: kebabKey,
  name: z.string().min(2).max(60),
  color: hexColor,
  visibilityDefault: z.enum(['inherited', 'restricted']).default('inherited'),
  // Semântica: omitido + key CANÔNICA → recebe os templates canônicos da key
  // (fluxo manual que mantém as áreas padrão); `[]` explícito → nenhum
  // template; key custom sem templates → nenhum.
  templates: z.array(BlueprintTemplateSchema).max(6).optional(),
});

export const BlueprintUnitSchema = z.object({
  name: z.string().min(1).max(100),
  code: z.string().max(20).optional(),
  address: z.string().max(255).optional(),
});

export const OrgBlueprintSchema = z.object({
  areas: z.array(BlueprintAreaSchema).min(1).max(10),
  units: z.array(BlueprintUnitSchema).max(5).default([]),
}).superRefine((bp, ctx) => {
  const keys = bp.areas.map((area) => area.key);
  if (new Set(keys).size !== keys.length) {
    ctx.addIssue({ code: 'custom', path: ['areas'], message: 'Chaves de área duplicadas' });
  }
});

export type OrgBlueprint = z.infer<typeof OrgBlueprintSchema>;
export type BlueprintArea = z.infer<typeof BlueprintAreaSchema>;
export type BlueprintTemplate = z.infer<typeof BlueprintTemplateSchema>;
