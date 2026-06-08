# Wireframes Textuais — Telas Críticas

Cada tela tem duas versões: **Desktop** (≥768px) e **Mobile** (<768px).

**Regra de ouro**: implementar sempre as duas. Ver regras de responsividade em `CLAUDE.md`.

---

## 1. Visão por Unidade

Rota: `/units/:id`  
Acesso: `unit_manager`, `area_leader` (da unidade), `org_manager`, `owner`

### Desktop
```
┌─────────────────────────────────────────────────────────────────┐
│ [← SkyFit]  Vila Xavier                          [João ▼] [+]  │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  📊 Resumo do dia — Quarta, 14 Mai                              │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐       │
│  │ 18       │  │ 4 ⚠      │  │ 2 🔴     │  │ 3 📅     │       │
│  │ abertas  │  │ atrasadas│  │ críticas │  │ vencem hj│       │
│  └──────────┘  └──────────┘  └──────────┘  └──────────┘       │
│                                                                  │
│  Filtros: [Todas as áreas ▼] [Todos os status ▼] [Prioridade ▼]│
│           [Responsável ▼] [⚠ Atrasadas]                        │
│                                      [✨ Criar com IA] [+ Nova] │
│                                                                  │
│  ┌─ Administrativo (3) ─────────────────────────────────────┐  │
│  │  ┌────────────────────────────────────────────────────┐  │  │
│  │  │ Documentos vencendo            [media] [em andamento]│  │  │
│  │  │ Responsável: Maria  · Prazo: 16/05 · 2 itens       │  │  │
│  │  └────────────────────────────────────────────────────┘  │  │
│  └───────────────────────────────────────────────────────────┘  │
│                                                                  │
│  ┌─ Estrutura/Manutenção (4) ───────────────────────────────┐  │
│  │  ┌────────────────────────────────────────────────────┐  │  │
│  │  │ 🔴 Esteira 4 parada          [CRITICA] [em andamento]│  │  │
│  │  │ Responsável: João  · Prazo: 20/05 · 1/4 ✓          │  │  │
│  │  └────────────────────────────────────────────────────┘  │  │
│  └───────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
```

### Mobile (375px)
```
┌────────────────────────────┐
│ [☰] SkyFit         [+ Nova]│  ← top bar (md:hidden)
├────────────────────────────┤
│ Vila Xavier                │
│ Quarta, 14 Mai             │
│                            │
│  📊 Resumo                 │
│  ┌────────┐  ┌────────┐   │
│  │ 18     │  │ 4 ⚠    │   │  ← grid-cols-2
│  │ aberta │  │ atras. │   │
│  └────────┘  └────────┘   │
│  ┌────────┐  ┌────────┐   │
│  │ 2 🔴   │  │ 3 📅   │   │
│  │ crít.  │  │ hj     │   │
│  └────────┘  └────────┘   │
│                            │
│  [Filtros ▼] [⚠ Atras.]   │  ← flex-wrap
│  [✨ IA]                   │
│                            │
│  ▼ Administrativo (3)      │  ← colapsável
│  ┌──────────────────────┐  │
│  │ Documentos vencendo  │  │
│  │ [media] [em andamento│  │
│  │ Maria · 16/05 · 2 ✓  │  │
│  └──────────────────────┘  │
│                            │
│  ▼ Estrutura/Manut. (4)   │
│  ┌──────────────────────┐  │
│  │ 🔴 Esteira 4 parada  │  │
│  │ [CRITICA] [andamento]│  │
│  │ João · 20/05 · 1/4 ✓ │  │
│  └──────────────────────┘  │
└────────────────────────────┘
```

---

## 2. Painel Geral (Visão Rede)

Rota: `/dashboard`  
Acesso: `org_manager`, `owner`

### Desktop
```
┌─────────────────────────────────────────────────────────────────┐
│ SkyFit · Painel Geral                           [Ana ▼]        │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  KPIs — Hoje, 14 Mai 2024                                       │
│  ┌────────────────┐  ┌────────────────┐  ┌────────────────┐    │
│  │  7 🔴          │  │  41 ⚠          │  │  9 💰          │    │
│  │ Unidades c/   │  │ Atividades     │  │ Financeiro    │    │
│  │ atraso crítico│  │ atrasadas      │  │ vencendo hoje │    │
│  └────────────────┘  └────────────────┘  └────────────────┘    │
│  ┌────────────────┐                                             │
│  │  22 🔧         │                                             │
│  │ Manutenções   │                                             │
│  └────────────────┘                                             │
│                                                                  │
│  Unidade          Abertas  Atrasadas  Críticas  Sem resp.       │
│  ─────────────────────────────────────────────────────────────  │
│  🔴 Vila Xavier      18        4          2         1           │
│  🔴 Centro           24        6          1         0           │
│  ⚠  Shopping         13        2          0         2           │
│                                                                  │
│  ─── Atividades Atrasadas ─── [Analisar com IA] ─────────────   │
│  Esteira 4 parada    Vila Xavier  Manutenção  CRÍTICA  [Analisar]│
└─────────────────────────────────────────────────────────────────┘
```

### Mobile
```
┌────────────────────────────┐
│ [☰] Painel Geral          │
├────────────────────────────┤
│  ┌────────┐  ┌────────┐   │
│  │ 7 🔴   │  │ 41 ⚠   │   │  ← grid-cols-2
│  │ Unid.  │  │ Atras. │   │
│  └────────┘  └────────┘   │
│  ┌────────┐  ┌────────┐   │
│  │ 9 💰   │  │ 22 🔧  │   │
│  │ Finan. │  │ Manut. │   │
│  └────────┘  └────────┘   │
│                            │
│  ─── Por Unidade ───       │
│  [tabela scroll horizontal]│  ← overflow-x-auto
│  Unid. | Ab | At | Cr | Sr │
│  ──────────────────────    │
│  Vila X  18   4   2   1    │
│  Centro  24   6   1   0    │
│                            │
│  ─── Atrasadas ───         │
│  Esteira 4 parada          │
│  Vila Xavier · CRÍTICA     │
│  [🧠 Analisar]             │
└────────────────────────────┘
```

---

## 3. Tela de Atividade (Drawer/Modal)

Abre ao clicar em qualquer card de atividade.

### Desktop
```
┌─────────────────────────────────────────────────────────────────┐
│ ← Voltar                                           [⋮ Mais]    │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  Esteira 4 parada — solicitação de orçamento         [Editar]   │
│                                                                  │
│  Status: [Em andamento ▼]     Prioridade: [CRÍTICA ▼]          │
│                                                                  │
│  📍 Vila Xavier · Estrutura/Manutenção · Template: Chamado      │
│  👤 Responsável: João Silva                                     │
│  📅 Prazo: 20/05/2024 · Visibilidade: Herdada 🌐                │
│  ↻ Recorrente: semanal (Seg–Sex)                               │
│                                                                  │
│  ─── Checklist ─────────────────────── 1/4 ✓ ──────────────    │
│  ┌ Inspeção inicial ──────────────────────────────────────┐    │
│  │ ✓ Tirar fotos do equipamento                           │    │
│  │ ☐ Pedir 2 orçamentos de fornecedores                   │    │
│  └────────────────────────────────────────────────────────┘    │
│  [+ Adicionar bloco] [💡 Sugerir com IA]                       │
│                                                                  │
│  ─── Comentários ────────────────────────────────────────────   │
│  [Escrever comentário... @mencionar usuário    ] [Enviar]      │
│                                                                  │
│  Maria Santos · há 2h                                           │
│  Recebi orçamento do fornecedor A: R$ 2.800                     │
│                                                                  │
│  ─── Histórico ─────────────────────────────────────────────    │
│  [Ver linha do tempo completa →]                                │
└─────────────────────────────────────────────────────────────────┘
```

### Mobile (full-screen)
```
┌────────────────────────────┐
│ [✕ Fechar]      [⋮ Mais]  │  ← overlay full-screen
├────────────────────────────┤
│ Esteira 4 parada           │
│                            │
│ [Em andamento ▼][CRÍTICA ▼]│  ← lado a lado
│                            │
│ 📍 Vila Xavier             │
│ Estrutura/Manutenção       │
│ 👤 João Silva              │
│ 📅 20/05/2024              │
│                            │
│ ─ Checklist (1/4) ───────  │
│ ✓ Tirar fotos              │
│ ☐ Pedir orçamentos         │
│ [+ Bloco] [💡 IA]         │
│                            │
│ ─ Comentários ───────────  │
│ [Comentar...    ] [Enviar] │
│                            │
│ Maria · há 2h              │
│ Orçamento A: R$ 2.800      │
│                            │
│ [Ver histórico completo →] │
└────────────────────────────┘
```

---

## 4. Fluxo de Criação com IA

### Desktop
```
PASSO 1 — Texto livre
┌─────────────────────────────────────────────────────────────────┐
│ Criar atividade com IA                                          │
│                                                                  │
│ ┌─────────────────────────────────────────────────────────────┐ │
│ │ A recepção da Vila Xavier está com infiltração no teto.     │ │
│ │ Preciso de orçamento urgente para o conserto.               │ │
│ │                                                             │ │
│ └─────────────────────────────────────────────────────────────┘ │
│                                                [Analisar com IA] │
└─────────────────────────────────────────────────────────────────┘

PASSO 2 — Rascunho IA (editável)
┌─────────────────────────────────────────────────────────────────┐
│ Rascunho sugerido pela IA (revise e confirme)                   │
│                                                                  │
│ Título:      [Infiltração na recepção - orçamento urgente    ]  │
│ Área:        Estrutura/Manutenção  (confiança: 94%)             │
│ Prioridade:  Alta                                               │
│ Prazo:       em 3 dias úteis                                    │
│                                                                  │
│ Checklist:                                                      │
│ ✓ Tirar fotos da infiltração                                    │
│ ✓ Solicitar 2 orçamentos                                       │
│                                                                  │
│                              [Cancelar] [Confirmar e criar →]   │
└─────────────────────────────────────────────────────────────────┘
```

### Mobile
```
┌────────────────────────────┐
│ ✨ Criar com IA  [✕]      │
├────────────────────────────┤
│ Descreva a atividade...    │
│ ┌──────────────────────┐  │
│ │ Infiltração na recep-│  │
│ │ ção da Vila Xavier...│  │
│ └──────────────────────┘  │
│              [Analisar →]  │
│                            │
│ ─ Rascunho ─────────────  │
│ Título: [Infiltração na ] │
│ Área: Manutenção  (94%)   │
│ Prioridade: Alta           │
│ Prazo: 3 dias úteis        │
│                            │
│ Checklist (2 itens):       │
│ ✓ Tirar fotos              │
│ ✓ Solicitar orçamentos     │
│                            │
│ [Cancelar] [Confirmar →]  │
└────────────────────────────┘
```

---

## 5. Visão Pessoal

Rota: `/me`  
Acesso: qualquer usuário autenticado

### Desktop
```
┌─────────────────────────────────────────────────────────────────┐
│ Minhas atividades                                 [João Silva]  │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  [Hoje (3)] [Atrasadas (2)] [Esta semana (8)] [Aguard. retorno] │
│  ─────────                                                       │
│                                                                  │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │ 🔴 Esteira 4 parada       [CRITICA] [em andamento]      │   │
│  │ Vila Xavier · Manutenção  · Prazo: hoje                 │   │
│  └─────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
```

### Mobile
```
┌────────────────────────────┐
│ [☰] Minhas atividades     │
├────────────────────────────┤
│ Quarta, 14 de maio         │
│                            │
│ ← overflow scroll →        │
│ [Hoje(3)][Atras(2)][Semana]│  ← overflow-x-auto
│ [Aguardando retorno]       │
│ ─────────                  │
│                            │
│ ┌──────────────────────┐  │
│ │🔴 Esteira 4 parada   │  │
│ │[CRITICA][em andamento│  │
│ │Vila X · Manut. · hoje│  │
│ └──────────────────────┘  │
│                            │
│ ┌──────────────────────┐  │
│ │ Campanha de matrícula│  │
│ │[ALTA] · Centro · hoje│  │
│ └──────────────────────┘  │
└────────────────────────────┘
```

---

## 6. Wizard de Importação Trello

### Desktop
```
PASSO 1 — Fonte
┌─────────────────────────────────────────────────────────────────┐
│ Importar do Trello                                              │
│                                                                  │
│  ● Conectar conta Trello (recomendado)                         │
│    Importar boards diretamente via API                         │
│                                                                  │
│  ○ Upload de arquivo JSON                                       │
│    Exportar boards manualmente e fazer upload                  │
│                                                                  │
│                                    [Cancelar] [Continuar →]     │
└─────────────────────────────────────────────────────────────────┘

PASSO 3 — Preview + Wizard
┌─────────────────────────────────────────────────────────────────┐
│ Revisão do mapeamento                                           │
│                                                                  │
│ Resumo: 4 unidades · 23 áreas · 170 atividades                 │
│                                                                  │
│  "Janeiro 2024" → [Ignorar ▼]    "FEITO" → [Status: Concluído ▼]│
│  "Marketing"    → ✓ Área: Marketing (automático)               │
│                                                                  │
│                        [← Voltar] [Confirmar e importar →]     │
└─────────────────────────────────────────────────────────────────┘
```

### Mobile
```
┌────────────────────────────┐
│ Importar do Trello  [✕]   │
├────────────────────────────┤
│ Passo 1/5                  │
│                            │
│ ○ Conectar Trello (OAuth)  │
│   Importar via API         │
│                            │
│ ● Upload JSON              │
│   ┌──────────────────────┐ │
│   │  Arraste o arquivo   │ │
│   │  ou toque para subir │ │
│   └──────────────────────┘ │
│                            │
│              [Continuar →] │
├────────────────────────────┤
│ Passo 3/5 — Revisão        │
│                            │
│ 4 unid · 23 áreas · 170 at.│
│                            │
│ "Janeiro 2024"             │
│ → [Ignorar ▼]              │
│                            │
│ "FEITO"                    │
│ → [Status: Concluído ▼]    │
│                            │
│       [← Voltar][Confirmar]│
└────────────────────────────┘
```

---

## 7. Configuração de Recorrência

### Desktop
```
┌─────────────────────────────────────────────────────────────────┐
│ Configurar Recorrência                              [✕]        │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│ Frequência                                                      │
│  ○ Diária   ● Semanal   ○ Mensal   ○ Intervalo customizado     │
│                                                                  │
│ A cada  [1 ▼] semana(s)                                        │
│                                                                  │
│ Nos dias:                                                       │
│  ☐ Dom  ✓ Seg  ✓ Ter  ✓ Qua  ✓ Qui  ✓ Sex  ☐ Sáb             │
│                                                                  │
│ Modo de geração                                                 │
│  ● Gerar próxima ao concluir a atual                           │
│  ○ Pré-gerar as próximas [3 ▼] ocorrências                    │
│                                                                  │
│ Prévia: próxima ocorrência em 20/05/2024 (segunda)             │
│                                                                  │
│                              [Cancelar] [Salvar recorrência]    │
└─────────────────────────────────────────────────────────────────┘
```

### Mobile
```
┌────────────────────────────┐
│ Configurar Recorrência [✕]│
├────────────────────────────┤
│ Frequência:                │
│ [Diária][Semanal*][Mensal] │  ← botões segmentados
│ [Intervalo]                │
│                            │
│ A cada [1] semana(s)       │
│                            │
│ Nos dias:                  │
│ [D][S✓][T✓][Q✓][Q✓][S✓][S]│  ← badges toque
│                            │
│ Modo:                      │
│ ● Gerar ao concluir        │
│ ○ Pré-gerar [3] ocorrências│
│                            │
│ Próxima: 20/05/2024 (seg)  │
│                            │
│ [Cancelar]  [Salvar ↻]    │
└────────────────────────────┘
```

---

## 8. Layout Geral — Navegação

### Desktop (≥768px)
```
┌──────────┬──────────────────────────────────────────────────────┐
│ SIDEBAR  │  CONTEÚDO DA PÁGINA                                  │
│ (w-60 ou │                                                       │
│  w-14    │  p-6 space-y-6                                       │
│ collapsed│                                                       │
│ )        │                                                       │
│ relative │                                                       │
│          │                                                       │
└──────────┴──────────────────────────────────────────────────────┘
```

### Mobile (<768px)
```
┌────────────────────────────┐
│ TOP BAR (h-14, md:hidden)  │
│ [☰] NomeOrg               │
├────────────────────────────┤
│ CONTEÚDO DA PÁGINA         │
│ p-3 space-y-5              │
│                            │
│ (sidebar é overlay fixo    │
│  que aparece ao clicar ☰) │
└────────────────────────────┘

SIDEBAR OVERLAY (quando aberto):
┌────────────────────────────────────────────────────────────────┐
│ ████ SIDEBAR (w-60, fixed, z-50)  │ BACKDROP (bg-black/50)     │
│ (translate-x-0 quando open)       │ (clica para fechar)        │
└────────────────────────────────────────────────────────────────┘
```
