# Recursos de IA — Especificação

## Princípio de design

IA no MVP atua como **copiloto estruturado**, nunca como agente autônomo. Toda saída é um rascunho para revisão humana. A IA nunca persiste dados diretamente no banco.

**Detecção de atraso e inatividade é lógica SQL determinística** — IA entra depois só para explicar.

---

## Stack de IA

| Componente | Escolha | Motivo |
|---|---|---|
| LLM | OpenAI `gpt-4o-mini` (padrão) / `gpt-4o` (resumos) | Melhor relação custo/qualidade, structured outputs estritos |
| SDK | `openai` npm package (v4+) | Suporte nativo a structured outputs e function calling |
| Orquestração | Chamadas diretas à API (sem LangGraph no MVP) | LangGraph apenas se fluxos multi-step forem necessários |
| Prompts | Arquivos `.ts` versionados em `apps/api/src/ai/prompts/` | Versionamento no git, não hard-coded em handlers |
| Timeout | 10s para sync, 60s para jobs assíncronos | Evitar hanging de requests |

---

## Recurso 1: Criação de atividade por texto

### Fluxo

```
Usuário digita texto livre
        ↓
POST /ai/activities/draft
        ↓
API monta prompt com contexto (unidades, áreas, templates disponíveis)
        ↓
OpenAI structured output → JSON validado por Zod
        ↓
API retorna rascunho (não salvo)
        ↓
Usuário revisa, ajusta e confirma
        ↓
POST /activities (fluxo normal)
```

### Schema de saída (Zod + JSON Schema para OpenAI)

```typescript
// apps/api/src/ai/schemas/activity-draft.schema.ts
import { z } from 'zod';

export const ActivityDraftSchema = z.object({
  title: z.string().max(200),
  description: z.string().optional(),
  areaKey: z.string(), // chave da área sugerida
  templateName: z.string().optional(),
  priority: z.enum(['baixa', 'media', 'alta', 'critica']),
  suggestedDueDays: z.number().int().min(1).max(90),
  checklist: z.array(z.string()).max(10),
  metadata: z.record(z.string()).optional(),
  confidence: z.number().min(0).max(1), // confiança da sugestão
  reasoning: z.string().optional(), // explicação para o usuário
});
```

### Prompt base

```typescript
// apps/api/src/ai/prompts/activity-draft.prompt.ts
export function buildActivityDraftPrompt(input: {
  userText: string;
  organizationName: string;
  availableAreas: Array<{ key: string; name: string }>;
  availableTemplates: Array<{ name: string; areaKey: string }>;
}): string {
  return `Você é um assistente de gestão operacional para a organização "${input.organizationName}".

Analise o texto abaixo e crie um rascunho estruturado de atividade operacional.

TEXTO DO USUÁRIO:
"${input.userText}"

ÁREAS DISPONÍVEIS:
${input.availableAreas.map(a => `- ${a.key}: ${a.name}`).join('\n')}

TEMPLATES DISPONÍVEIS:
${input.availableTemplates.map(t => `- ${t.name} (área: ${t.areaKey})`).join('\n')}

INSTRUÇÕES:
- Escolha a área mais adequada para a situação descrita
- Se houver template compatível, sugira-o
- Defina prioridade com base na urgência e criticidade implícitas
- Crie um checklist prático (máx 8 itens) para executar a tarefa
- Sugira prazo em dias úteis
- Seja objetivo; não invente informações que não estão no texto
- confidence: 0.0 a 1.0 (quão certo está da classificação)`;
}
```

---

## Recurso 2: Checklist automático

### Fluxo

```
Usuário clica "Sugerir checklist" na atividade
        ↓
POST /ai/activities/checklist { activityId }
        ↓
API busca: título, descrição, área, template, metadata da atividade
        ↓
OpenAI retorna lista de itens sugeridos
        ↓
Usuário seleciona itens que quer adicionar (checkboxes)
        ↓
POST /checklists/:id/items (para cada item selecionado)
```

### Schema de saída

```typescript
export const ChecklistSuggestionSchema = z.object({
  items: z.array(z.object({
    text: z.string(),
    rationale: z.string().optional(), // por que este item é importante
    optional: z.boolean().default(false),
  })).max(12),
});
```

### Estratégia híbrida
Quando há template configurado com `config.defaultChecklist`, combinar:
1. Items do template (garantidos, sempre incluídos)
2. Items extras sugeridos pela IA (marcados como opcionais)

---

## Recurso 3: Resumo diário

### Fluxo (assíncrono)

```
Cron job às 07h por organização (BullMQ)
        ↓
Worker busca agregados do banco:
  - Atividades abertas por unidade
  - Novas desde ontem
  - Concluídas ontem
  - Atrasadas
  - Críticas abertas
  - Vencendo hoje
        ↓
POST /ai/summaries/daily (internamente no worker)
        ↓
OpenAI gera texto curto (máx 200 palavras)
        ↓
Enviar por e-mail/WhatsApp para gestores de unidade
```

### Schema de entrada para o LLM

```typescript
interface DailySummaryInput {
  unitName: string;
  date: string;
  stats: {
    totalOpen: number;
    newSince yesterday: number;
    completedYesterday: number;
    overdue: number;
    critical: number;
    dueToday: number;
    byArea: Array<{
      areaName: string;
      open: number;
      overdue: number;
    }>;
    topOverdue: Array<{ title: string; daysSince: number; areaName: string }>;
  };
}
```

### Observação importante
O resumo é gerado a partir de **dados do banco** — a IA só formata o texto. Nunca passar dados brutos de atividades restritas para o LLM. Usar apenas agregados e títulos públicos.

---

## Recurso 4: Análise de atraso

### Separação de responsabilidades

| Etapa | Responsável | Como |
|---|---|---|
| Detectar atividade atrasada | **SQL** | `due_at < now() AND status NOT IN ('concluido', 'cancelado')` |
| Detectar inatividade | **SQL** | `last_event_at < now() - interval '3 days'` |
| Flags visuais no dashboard | **Frontend** | A partir dos campos `isOverdue`, `daysSinceLastUpdate` |
| Explicar contexto do atraso | **IA** | Apenas quando gestor clica em "Analisar" |

### Schema de saída da análise

```typescript
export const DelayAnalysisSchema = z.object({
  summary: z.string().max(300),
  riskLevel: z.enum(['low', 'medium', 'high', 'critical']),
  possibleReasons: z.array(z.string()).max(4),
  suggestedActions: z.array(z.string()).max(4),
});
```

### Dados enviados ao LLM (nunca dados sensíveis)

```typescript
interface DelayAnalysisInput {
  activityTitle: string;
  areaName: string;
  priority: string;
  daysOverdue: number;
  daysSinceLastUpdate: number;
  checklistProgress: { done: number; total: number };
  recentCommentCount: number; // apenas contagem, não conteúdo
  hasAttachments: boolean;
}
```

---

## Tratamento de erros e fallback

```typescript
// apps/api/src/ai/ai.service.ts

async function callAiWithFallback<T>(
  fn: () => Promise<T>,
  fallback: T,
): Promise<T> {
  try {
    return await Promise.race([
      fn(),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('AI_TIMEOUT')), 10_000)
      ),
    ]);
  } catch (err) {
    logger.warn({ err }, 'AI call failed, returning fallback');
    return fallback;
  }
}
```

Fallback por recurso:
- **Draft de atividade**: formulário manual pré-preenchido com área genérica
- **Checklist**: apenas checklist do template (sem itens IA)
- **Resumo diário**: e-mail com tabela de dados brutos (sem texto gerado)
- **Análise de atraso**: mostrar apenas dados factuais (dias de atraso, progresso)

---

## Custos estimados (OpenAI gpt-4o-mini)

| Recurso | Tokens médios (in+out) | Custo estimado por chamada |
|---|---|---|
| Draft de atividade | ~800 tokens | ~$0.0004 |
| Checklist automático | ~400 tokens | ~$0.0002 |
| Resumo diário | ~1500 tokens | ~$0.0008 |
| Análise de atraso | ~600 tokens | ~$0.0003 |

Para 50 unidades com resumo diário + 20 drafts/dia: ~$1.50/dia.

---

## Segurança na integração com IA

- Nunca enviar IDs internos, emails, telefones ou dados sensíveis ao LLM
- Nunca enviar conteúdo de atividades com `visibility_mode = restricted`
- Sanitizar todos os inputs do usuário antes de incluir no prompt (prevenir prompt injection)
- Logar todas as chamadas IA com duração e status (sem logar conteúdo do prompt)
- Rate limit: máx 10 chamadas de draft/min por usuário
