<!-- markdownlint-disable MD013 -->

# Runbook — Exposição de credenciais reais no repositório

> Achado durante a validação E2E (DL-100 / `docs/qa/e2e-validacao-real-gerador.md`):
> dados reais da conta de teste (CNPJ, CPF, e-mail, **senha CETESB**) estão
> presentes em arquivos **versionados** (capturas HAR de login, fixtures de teste,
> examples, docs legados). Condição **pré-existente**, independente da refatoração.

> **Remote afetado:** `origin = github.com/FlavioNeto11/sicat`. Como os segredos
> provavelmente já foram **publicados** (history/forks/caches do GitHub), a
> **rotação da senha CETESB é obrigatória e é o fix real** — scrub de arquivo
> sozinho não basta.

## Como detectar (gate com baseline — já ativo)

```bash
npm run scan:secrets            # falha apenas em exposições NOVAS (fora do baseline)
node scripts/security/scan-secrets.mjs --all   # auditoria completa (ignora baseline)
```

O scanner (`scripts/security/scan-secrets.mjs`) varre apenas arquivos rastreados
pelo git e reporta — **sem imprimir os valores** — quais arquivos contêm os
literais sensíveis da conta de teste (lidos de `.env.e2e`) e padrões genéricos
(JWT, campos de senha em JSON/HAR).

- **Baseline** (`scripts/security/secrets-baseline.json`, só caminhos) tolera as
  exposições legadas conhecidas (~290 ocorrências) para não travar commits, mas
  **falha em qualquer exposição nova** — já plugado em `npm run quality:gate`
  (logo, no `pre-push`).
- Após remediar, reduza o baseline: `node scripts/security/scan-secrets.mjs --update-baseline`.

## Kit de remediação preparado

Já foi gerado (localmente, **não versionado**) o mapa de substituição para o
`git filter-repo`: `scripts/security/.secrets-replacements.txt` (real → placeholders
válidos: CNPJ/CPF de teste, e-mail `@example.test`, senha redigida).

## Remediação (ordem recomendada)

1. **Rotacionar a senha CETESB** no portal oficial. Enquanto a senha antiga
   estiver no histórico git, considere-a comprometida — a rotação é o passo nº 1.
2. **Scrub do working tree** — substituir valores reais por placeholders nos
   arquivos atuais:
   - `docs/cetesb/*.har` (capturas de login contêm senha/CPF/CNPJ no corpo);
   - `tests/fixtures/**`, `examples/**`, `tests/manual/**`, docs legados.
   - Atenção: alguns validadores dependem do **formato** (não do valor real) —
     rode `npm run validate:openapi` e a suíte de testes após o scrub para
     garantir que placeholders não quebraram contratos/HAR-validators.
3. **Purga do histórico** (recomendado — o repo tem remote no GitHub). Operação
   **destrutiva** (reescreve todos os hashes; exige `--force` e coordenação com
   clones/forks/CI/branch-protection). Use o mapa já preparado:

   ```bash
   pip install git-filter-repo                 # não vem com o git por padrão
   git filter-repo --replace-text scripts/security/.secrets-replacements.txt
   # revise; rode a suíte e o quality gate
   npm run quality:gate
   git push --force-with-lease origin main     # SÓ após rotacionar a senha + avisar o time
   node scripts/security/scan-secrets.mjs --all   # confirmar zero ocorrências
   node scripts/security/scan-secrets.mjs --update-baseline   # zerar o baseline
   ```

   > Atenção: `--replace-text` é literal por linha. Validar que os
   > placeholders (CNPJ/CPF de teste válidos) não quebram validadores de HAR/contrato.
4. **Gate de CI**: já feito — `npm run scan:secrets` está em `quality:gate`
   (executado no `pre-push`), com baseline para não travar pelas exposições legadas.
5. **Higiene de PII**: padronizar fixtures/examples com documentos/e-mails
   fictícios (ex.: CNPJ `00.000.000/0001-00`, e-mail `@example.test`).

## Boas práticas adotadas nesta validação E2E

- Credenciais reais ficaram apenas em `.env.e2e` (não versionado — `.gitignore: .env.*`).
- Screenshots e `results.json` em `frontend/test-results/e2e-gerador/` (não versionado).
- Scripts de E2E não têm segredos hardcoded (leem de env).
- Evidências visuais têm CPF/CNPJ/e-mail/nome **mascarados** no DOM antes do screenshot.
