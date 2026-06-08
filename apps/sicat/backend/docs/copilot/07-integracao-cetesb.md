# Integração CETESB

## Base da integração

- base URL configurável por env
- modo `real` obrigatório
- implementação real centralizada em `src/gateways/cetesb-gateway.js`

## Fonte da verdade

- evidência original obrigatória: `docs/cetesb/`
- sempre priorizar os HARs de `docs/cetesb/` para decisões de payload, parsing e fluxo
- quando houver inferência, registrar explicitamente como inferência

## Endpoints observados nos HARs

- `POST /api/mtr/carregaDadosLogin`
- `PUT /api/mtr/manifesto`
- `GET /api/mtr/imprimir/imprimeManifesto/{hash}`
- `POST /api/mtr/manifesto/cancelaManifesto`
- `GET /api/mtr/pesquisaManifesto/...`
- `GET /api/mtr/pesquisaParceiro/...`
- `GET /api/mtr/pesquisaParceiroByCodigo/...`
- `GET /api/mtr/consultaParceiro/J/{documento}`
- múltiplos endpoints de catálogo
- `POST /api/cadastro/salvarAcesso`

## Estado atual da autenticação

- JWT pode ser persistido no `sessionContext`
- bootstrap pode ocorrer com credenciais + recaptcha token (opcional)
- renovação controlada é tentada quando o token está perto de expirar
- header efetivo do portal oficial não foi comprovado de forma definitiva pelos HARs
- por isso existe modo configurável para enviar `x-access-token`, `Authorization: Bearer` ou ambos

### recaptchaToken: Campo Opcional

**Evidência HAR**: Análise de `docs/cetesb/mtr.cetesb.sp.gov.br_*.har` mostra que CETESB **não valida** `recaptchaToken` via API backend.

**Comportamento validado**:

- ✅ `recaptchaToken: ""` (string vazia) → aceito pela CETESB
- ✅ `recaptchaToken: undefined` (ausente) → aceito pela CETESB
- ✅ `recaptchaToken: "valor"` (presente) → aceito mas **não validado** pela CETESB

**Implementação**:

- Campo marcado como **opcional** no OpenAPI (`POST /v1/auth/login`)
- Gateway aceita string vazia: `String(metadata.recaptchaToken || input.recaptchaToken || '')`
- Validadores não forçam recaptcha como obrigatório
- Frontend pode gerar token reCAPTCHA para validação client-side, mas backend aceita qualquer valor

## Atualizações recentes (DL-017 — 2026-03-09)

- gateway real com retry transitório para timeout/rede/`408`/`429`/`5xx`
- sem retry para falhas definitivas (`400`/`401`/`403`/`404`)
- rastreabilidade de tentativas (`attempt`, `maxAttempts`) nas exchanges sanitizadas
- suporte a propagação de `X-Correlation-Id` quando disponível
- refresh de sessão registra `lastBootstrapTrace` em `session_context.metadata`
- `fetchCatalogs` agora é resiliente a falha parcial: um catálogo pode falhar sem interromper os demais

## Atualizações recentes (DL-037 — 2026-03-10)

- **Submit manifesto**: `src/gateways/cetesb-gateway.js` passou a resolver `parceiroAcesso` com consulta prévia em `/api/mtr/manifesto/listaResponsavelRecebimento/{generatorCode}` antes do `PUT /api/mtr/manifesto`.
- **Objetivo do ajuste**: reduzir falha de negócio da CETESB em cenários onde `paaCodigo/paaNome` do contexto não corresponde ao responsável esperado para o gerador.
- **Fallback implementado**: em falha da consulta auxiliar, mantém `userAccessCode/userName` do `sessionContext` para não bloquear fluxo por indisponibilidade parcial.
- **Validação executada**: fluxo real completo (`login`, `session-context`, `create`, `submit`, `print`, download PDF) validado com sucesso via `tests/manual/test-full-flow-with-login.js`.
- **Evidência de runtime**: após ajuste, submissão e impressão foram concluídas para manifesto real com status final `printed`.

### Comportamento implementado vs. hipótese (DL-037)

#### Implementado e validado

- resolução dinâmica de `parceiroAcesso` para submit
- tolerância com fallback quando endpoint auxiliar falha
- sucesso ponta a ponta em teste real

#### Hipótese operacional registrada

- erros `401` em retries tardios de jobs antigos podem ocorrer por sessão/token envelhecido, mesmo com payload corrigido.
- ação recomendada: rebootstrap de sessão e novo submit com contexto fresco em vez de insistir em replay de job antigo.

## Validação de Payload ✅ NOVO (2026-03-08)

- payloads são validados **antes** de enviar para CETESB
- validação centralizada em `src/lib/validators/manifest-validator.js`
- baseada na análise do HAR real (`docs/cetesb/mtr.cetesb.sp.gov.br_gerar_mtr.har`)

**Campos validados (shape interno pré-mapeamento CETESB):**

- Manifesto: responsibleName, manifestType, expeditionDate, state
- Parceiros: generator, carrier, receiver (parCodigo obrigatório)
- Resíduos: lista não vazia + campos obrigatórios por item
- Autenticação: recaptcha é enviado quando disponível no payload/contexto, sem bloqueio rígido no contrato interno
- Armazenamento temporário: parceiros quando hasTemporaryStorage=true

**Normalizações:**

- `manDataExpedicao`: previne duplicação de timestamp
- Verifica se data já contém `T` antes de adicionar `T03:00:00.000Z`

**Benefícios:**

- Fail fast com mensagens claras
- Reduz chamadas inválidas à CETESB
- Lista completa de erros em uma única resposta
- 26 testes unitários (100% aprovados)

**Documentação:** `docs/copilot/validadores/cetesb/validacao-sequencia-mtr.md`, DL-008

## Auditoria de coerência HAR (DL-017 HANDOFF 3)

- relatório canônico: `docs/copilot/validadores/cetesb/AUDITORIA-HANDOFF-3-DL-017.md`
- evidência utilizada: `docs/cetesb/*.har`
- resultado: gateway/contrato/examples aderentes; ajuste aplicado apenas no validador interno de manifesto

## Fatos vs inferências

### Fatos observados

- login retorna JWT
- submit grava manifesto
- impressão usa hash
- cancel depende de identificadores externos
- pesquisa de manifesto ajuda a resolver ids externos

### Inferências operacionais

- melhor estratégia de header para chamadas subsequentes
- melhor heurística para localizar manifesto recém submetido em pesquisa
- conjunto exato de parâmetros opcionais de alguns endpoints de catálogo

## Regra para futuras mudanças

Sempre registrar se a mudança veio de:

- HAR observado
- teste real
- hipótese técnica
- documentação oficial

