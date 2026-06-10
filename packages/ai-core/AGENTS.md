# AGENTS — @flavioneto11/ai-core

> Contrato de operação deste pacote para agentes (Claude/Copilot). Contexto da plataforma:
> [`../../CLAUDE.md`](../../CLAUDE.md) · regras de libs: [`shared-libraries-and-versioning.md`](../../docs/standards/shared-libraries-and-versioning.md).

## O que é
Núcleo da plataforma de IA (plano "Re-engenharia da camada de IA", F0+): contrato de tools com
authz/dry-run/confirmação, métricas `ai_*`, tracer plugável (Langfuse default/LangSmith via env),
KPIs canônicos e harness de eval. Consumido por SICAT e GymOps via vendoring `.tgz`.

## Fronteiras
- **Seguro**: adicionar função compatível (MINOR), corrigir bug (PATCH), ampliar testes/docs.
- **Com aprovação**: mudar contrato público (`AiTool`, nomes de métricas `ai_*`, ids de KPI) — são
  consumidos por dashboards/evals/apps; exige bump SemVer + CHANGELOG + re-vendoring nos apps.
- **Proibido**: adicionar dependência de runtime (clientes são estruturais/peers opcionais);
  importar código de app; chaves/segredos em código ou teste.

## Invariantes (HARD)
1. Telemetria NUNCA derruba o caminho de IA (falhas viram no-op).
2. `authorize` decide por **identidade/escopo**, jamais por canal.
3. Mutação sem `confirmedToolCallId` nunca executa de verdade (dry-run/preview ou
   `AiToolConfirmationRequiredError`); `R4` exige confirmação sempre.
4. `node --test` verde antes de versionar; tipos `index.d.ts` sincronizados à mão.

## Ao subir versão
`npm version` → CHANGELOG → `scripts/vendor-packages.ps1` → commitar os `.tgz` nos apps
consumidores (réplica manual — fonte de drift se esquecida).
