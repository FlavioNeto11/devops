# Orchestration — public-homepage-canvas-ux-fixes

## Demanda resumida
Aplicar correcoes visuais na homepage publica Canvas do frontend:
- evitar que o primeiro passo/cena fique escondido atras do box de atividades no canto superior direito;
- corrigir exibicao do texto das etapas do Canvas (sem truncamento ilegivel);
- ajustar contraste de textos escuros em fundo escuro para garantir legibilidade.

## Classificacao obrigatoria
```yaml
orchestration:
  work_id: "public-homepage-canvas-ux-fixes"
  intent: "fix"
  complexity: "moderate"
  domains:
    - "frontend-ux"
    - "qa"
  first_agent: "frontend-vue-ux-mtr"
  phase_sequence:
    - phase: "06-frontend-ux"
      agent: frontend-vue-ux-mtr
      required: true
      reason: "Corrigir layout/contraste e ajustar composicao visual do Canvas e overlays."
    - phase: "09-qa-validation"
      agent: tester-qa-mtr
      required: true
      reason: "Validar legibilidade, ausencia de sobreposicao indevida e build compilavel."
```

## Criterios de pronto
- Nenhum elemento-chave da cena inicial fica oculto por box superior.
- Textos das etapas do Canvas aparecem completos e legiveis.
- Contraste de texto atende legibilidade visual em toda home publica.
- Build do frontend (`npm run build`) aprovado.

## Checkpoints esperados
- `docs/handoffs/public-homepage-canvas-ux-fixes/06-frontend-ux.md`
- `docs/handoffs/public-homepage-canvas-ux-fixes/09-qa-validation.md`
