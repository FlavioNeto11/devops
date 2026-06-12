export function buildOrgSetupPrompt(input: {
  businessDescription: string;
  organizationName?: string;
  /**
   * Self-correction: erros de validação (zod) da resposta anterior, para o
   * modelo corrigir a estrutura — o código NUNCA conserta a saída por conta
   * própria.
   */
  correctionFeedback?: string;
}): string {
  const correctionBlock = input.correctionFeedback
    ? `\nATENÇÃO — sua resposta anterior VIOLOU o contrato nestes pontos (corrija TODOS e reenvie o JSON completo):\n${input.correctionFeedback}\n`
    : '';

  return `Você é um CONSULTOR SÊNIOR DE OPERAÇÕES multissetorial. A partir da descrição livre de um negócio, desenhe a estrutura operacional inicial dele em uma plataforma de gestão organizada como Organização → Unidades → Áreas funcionais → Templates de atividade.

DESCRIÇÃO DO NEGÓCIO: "${input.businessDescription}"
${input.organizationName ? `NOME INFORMADO PELO USUÁRIO: "${input.organizationName}"` : ''}
${correctionBlock}
REGRAS:
- areas: de 4 a 8 áreas operacionais ADEQUADAS A ESTE NEGÓCIO ESPECÍFICO — derive da descrição; NUNCA use uma lista padrão de academia nem de qualquer outro setor que não seja o descrito.
  - key: kebab-case (a-z, 0-9, hífens), 2-40 chars, única.
  - name: curto, em pt-BR (2-60 chars).
  - color: hex COMPLETO de 6 dígitos no formato #rrggbb (nunca abreviado, nunca rgb()); use cores DISTINTAS entre as áreas (paleta de referência: #6366f1 #ec4899 #f59e0b #10b981 #3b82f6 #8b5cf6 #ef4444 #14b8a6).
  - visibilityDefault: SOMENTE "inherited" ou "restricted" (nenhum outro valor existe). "restricted" APENAS para áreas sensíveis (financeiro, jurídico, RH/folha, diretoria); caso contrário "inherited".
  - templates: 2 a 4 por área, ESPECÍFICOS da rotina real desse tipo de negócio. Cada template:
    - name: rotina clara (3-120 chars), description: 1-2 frases (máx 300 chars).
    - defaultChecklist: 4 a 10 passos concretos NA ORDEM DE EXECUÇÃO, verbos no infinitivo (máx 12 itens, cada um 2-160 chars).
    - defaultPriority: SOMENTE baixa | media | alta | critica (conforme urgência/impacto típicos).
    - defaultVisibility: SOMENTE "inherited" ou "restricted" ("restricted" só em rotinas sensíveis).
    - suggestedSlaDays: número INTEIRO de 0 a 90 (prazo típico da rotina).
    - specificFields: opcional, snake_case minúsculo iniciando por letra (ex.: supplier, due_date), máx 8.
- unitsSuggested: SOMENTE se a descrição citar locais/filiais/unidades explícitas (máx 5; name obrigatório, code curto opcional, address opcional). Se não citar, OMITA o campo.
- organizationName e suggestedSlug: proponha se o usuário não informou nome (slug: a-z, 0-9, hífens, 3-60 chars). Se informou, ecoe o nome e proponha o slug a partir dele.
- segmentLabel: rótulo curto do segmento percebido (ex.: "Rede de clínicas odontológicas").
- confidence: 0.0-1.0 conforme a clareza da descrição (vago = baixo).
- reasoning: 1-2 frases explicando as escolhas estruturais.

Responda APENAS com JSON válido, em português:
{
  "organizationName": string (opcional),
  "suggestedSlug": string (opcional),
  "segmentLabel": string (opcional),
  "areas": [
    {
      "key": string, "name": string, "color": string, "visibilityDefault": "inherited"|"restricted",
      "templates": [
        { "name": string, "description": string, "defaultChecklist": string[], "defaultPriority": string, "defaultVisibility": string, "suggestedSlaDays": number, "specificFields": string[] (opcional) }
      ]
    }
  ],
  "unitsSuggested": [ { "name": string, "code": string (opcional), "address": string (opcional) } ] (opcional),
  "confidence": number,
  "reasoning": string
}`;
}
