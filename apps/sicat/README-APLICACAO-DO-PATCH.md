# Patch — camada conversacional do SICAT (primeira onda sem WhatsApp)

Este pacote atualiza a trilha da camada conversacional para refletir a estrategia correta da primeira onda:

- popup interno na plataforma
- homepage comunicando o diferencial
- app light tipo chat
- WhatsApp fora do escopo imediato

## O que este patch ajusta

1. Corrige o handoff `conversacional-operacional-ia` para deixar claro que WhatsApp nao faz parte da primeira onda.
2. Corrige o runbook para que as fases 6 e 7 virem:
   - fase 6: hardening, testes, telemetria, readiness
   - fase 7: segunda onda futura com WhatsApp
3. Adiciona dois documentos canonicos:
   - `docs/copilot/conversacional/13-inapp-popup-experience.md`
   - `docs/copilot/conversacional/14-light-app-experience.md`
4. Adiciona prompts ajustados para o fluxo correto.

## Como aplicar

Extraia este pacote na raiz do repositorio `sicat`, preservando a estrutura de pastas.

Depois revise especialmente:
- `docs/handoffs/conversacional-operacional-ia/README.md`
- `docs/handoffs/conversacional-operacional-ia/05-copilot-runbook.md`
- `docs/copilot/16-camada-conversacional.md`
- `docs/copilot/conversacional/13-inapp-popup-experience.md`
- `docs/copilot/conversacional/14-light-app-experience.md`
- `.github/prompts/*camada-conversacional*`

## Sequencia recomendada apos aplicar

1. `planejar-camada-conversacional-sicat`
2. `executar-camada-conversacional-sicat` com foco na fase 2 backend conversacional
3. `implementar-camada-conversacional-fase` com `fase_id = 3`
4. `incorporar-camada-conversacional-homepage`
5. `implementar-camada-conversacional-fase` com `fase_id = 5`
6. `executar-camada-conversacional-sicat` com foco na fase 6 hardening

## Observacao de seguranca

Nao mantenha segredos reais em:
- handoffs
- prompts
- docs
- `.env.example`

Use placeholders e rotacione qualquer chave que tenha sido exposta.
