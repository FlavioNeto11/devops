# Fonte da verdade CETESB (evidência **local**)

Esta pasta é a **fonte original de evidência real** da integração CETESB. As capturas `.har` são
de **sessões autenticadas reais** e contêm **tokens (JWT) e dados pessoais (CPF/CNPJ)** — por isso
**NÃO são versionadas** (este repositório é público). Os `.har` ficam **apenas localmente** nesta
pasta e estão no `.gitignore` (`*.har`).

> ⚠️ **Nunca** comitar `.har` (nem outro dump de sessão) neste repo. Se precisar compartilhar uma
> evidência, **redija** antes (remova `Authorization`, `Cookie`/`Set-Cookie`, e corpo com token e
> CPF/CNPJ) ou guarde fora do git.

## Evidências esperadas (locais, não versionadas)

Coloque/gere estes arquivos nesta pasta a partir das suas próprias sessões CETESB:

- `mtr.cetesb.sp.gov.br_login.har`
- `mtr.cetesb.sp.gov.br_criar_cadastro.har`
- `mtr.cetesb.sp.gov.br_gerar_mtr.har`
- `mtr.cetesb.sp.gov.br_imprimir_mtr.har`
- `mtr.cetesb.sp.gov.br_cancelar_mtr.har`
- `mtr.cetesb.sp.gov.br_recebimento_mtr.har`
- `mtr.cetesb.sp.gov.br_gerar_cdf_mtr.har`
- `mtr.cetesb.sp.gov.br_baixar_cdf_mtr.har`

> Como obter: no navegador autenticado na CETESB, DevTools → Network → "Export HAR" do fluxo
> desejado, salvando com o nome acima. Os HARs foram **removidos do histórico** do git em 2026-06
> (continham tokens/PII num repo público) — ver [`../../../../SECURITY.md`](../../../../SECURITY.md).

## Quem depende destes arquivos (e falha sem eles)

Estes 5 casos leem os `.har` desta pasta. **Em clone limpo — e no CI — eles falham por
arquivo ausente. É intencional**: a evidência é PII e não pode ser versionada. Não são
marcados como `skip` nem apoiados em HAR sintético, porque os asserts congelam o formato
**real** da API da CETESB; um fixture inventado transformaria a guarda em teatro.

| Caso de teste | Arquivo |
|---|---|
| `docs/cetesb contém todos HARs obrigatórios` | `backend/tests/unit/cetesb-source-of-truth.test.js` |
| `HAR gerar_mtr expõe endpoint dedicado de listagem de MTR provisório` | idem |
| `HAR imprimir_mtr fixa campos provisórios no payload de manifesto` | idem |
| `HAR gerar_mtr fixa discriminador tipoManifesto no body de criação` | idem |
| `validateHarGatewayStructure valida estrutura real do repositório` | `backend/tests/unit/har-gateway-structural-validator.test.js` |

Também dependem os scripts `backend/scripts/validate-cetesb-source-of-truth.js` e
`backend/scripts/validate-har-gateway-structure.js` (`npm run validate:cetesb-source`).

> **Ancoragem de caminho.** `docs/` mora na **raiz do app** (`apps/sicat/docs`), enquanto
> `src/`, `tests/`, `openapi/` e `storage/` moram em `apps/sicat/backend/`. Como a suíte roda
> com `cwd = backend/`, **nenhum `process.cwd()` único resolve as duas árvores**: quem procura
> esta pasta ancora o caminho no **arquivo-fonte** (`import.meta.url`), nunca no processo.
> Copiar os `.har` para `backend/docs/cetesb` é contorno por-máquina — **não faça**.

## Regra obrigatória

Toda decisão de contrato, payload, parsing, validação e mapeamento de integração deve priorizar as
evidências desta pasta. Em divergência entre hipótese e evidência:

1. prevalece a evidência em `docs/cetesb/`;
2. a hipótese é registrada como hipótese na documentação técnica;
3. OpenAPI/examples/código/testes são realinhados.

## Uso por camada

- `openapi/`: exemplos e schemas alinhados com os HARs
- `examples/`: payloads representativos derivados dos HARs
- `src/gateways/`: mapeamentos e transformações orientados por evidência
- `tests/`: cenários de sucesso/falha baseados nos fluxos observados
- `scripts/`: validações automáticas de aderência à fonte da verdade
