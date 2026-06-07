# Skill: CETESB Evidence Validation

## Objetivo
Padronizar validação de coerência entre implementação e evidência real em `docs/cetesb/`.

## Aplicável quando
- Auditar coerência entre HAR e OpenAPI/examples/código
- Verificar se novo HAR foi integrado completamente
- Investigar divergência entre hipótese e evidência
- Validar payload antes de enviar para CETESB
- Testar fluxo real contra evidência documentada

## Passos padrão

### 1. Inventário de HARs
```bash
ls -la docs/cetesb/*.har
```

Para cada HAR:
- Nome da operação (ex: login, gerar_mtr, imprimir, cancelar, criar_cadastro)
- Extrair via HAR viewer ou script:
  - Request: method, path, headers, body
  - Response: status code, headers, body
  - Cookies (especialmente autenticação)

### 2. Mapeamento em src/lib/cetesb-source-of-truth.js
```javascript
// Verificar se cada operação tem referência:
const cetesbEvidenceMapping = {
  'post_v1_session-contexts': 'mtr.cetesb.sp.gov.br_login.har',
  'post_v1_manifestos': 'mtr.cetesb.sp.gov.br_gerar_mtr.har',
  'post_v1_manifestos_id_print': 'mtr.cetesb.sp.gov.br_imprimir_mtr.har',
  'post_v1_manifestos_id_cancel': 'mtr.cetesb.sp.gov.br_cancelar_mtr.har',
  'post_v1_cadastros': 'mtr.cetesb.sp.gov.br_criar_cadastro.har',
};

// Verificar se arquivo existe em docs/cetesb/:
const requiredHarFiles = [
  'mtr.cetesb.sp.gov.br_login.har',
  'mtr.cetesb.sp.gov.br_gerar_mtr.har',
  'mtr.cetesb.sp.gov.br_imprimir_mtr.har',
  'mtr.cetesb.sp.gov.br_cancelar_mtr.har',
  'mtr.cetesb.sp.gov.br_criar_cadastro.har',
];
```

### 3. Validação de OpenAPI
```bash
# Executar validação que inclui source-of-truth:
npm run validate:openapi

# Verificar se schemas em openapi/ cobrem campos do HAR:
# - Headers obrigatórios
# - Status codes esperados
# - Request/response body structure
# - Campos obrigatórios vs opcionais
```

### 4. Validação de Examples
```bash
# Verificar se exemplos existem:
ls -la examples/ | grep "post_v1_manifestos"
ls -la examples/ | grep "post_v1_cadastros"

# Verificar se conteúdo é válido JSON e reflete HAR:
cat examples/post_v1_manifestos_request.json | jq .
cat examples/post_v1_manifestos_response.json | jq .
```

### 5. Validação de Validadores
```javascript
// Em src/lib/validators/manifest-validator.js, verificar:
// - Campos obrigatórios conforme HAR
// - Padrão de valores (formato de data, enums, etc)
// - Mensagens de erro claras
// - Normalização de dados (ex: timestamps)

// Executar testes:
npm run test -- --grep "manifest-validator"
```

### 6. Validação de Gateway
```javascript
// Em src/gateways/cetesb-gateway.js, verificar:
// - Mapeamento correto de request headers (Content-Type, Authorization)
// - Parsing correto de response (status code, body structure)
// - Tratamento de cookies/sessions
// - Tratamento de erros conforme respostas observadas

// Executar integração (se ambiente de teste disponível):
npm run test:integration -- --grep "cetesb"
```

### 7. Validação de Testes
```bash
# Verificar se testes cobrem:
# - Cenários de sucesso (conforme HAR)
# - Cenários de erro (conforme HAR)
# - Edge cases observados

npm run test:integration
npm run test:worker -- --grep "manifest|cadastro"
```

### 8. Auditoria de Coerência Automática
```bash
# Executar suite de validação:
npm run validate:cetesb-source
npm run test:source-of-truth

# Resultado esperado:
# [ok] Política de fonte da verdade CETESB validada com sucesso
# ✔ 2/2 testes passando
```

## Checklist de validação

Quando validar nova feature ou integração:

- [ ] HAR relevante existe em `docs/cetesb/`
- [ ] HAR está mapeado em `src/lib/cetesb-source-of-truth.js`
- [ ] OpenAPI contém endpoint correspondente
- [ ] OpenAPI schema corresponde a estrutura do HAR
- [ ] Examples existem e refletem HAR
- [ ] Validadores cobrem campos obrigatórios do HAR
- [ ] Gateway mapeia headers, body e cookies corretamente
- [ ] Testes cobrem sucesso + falha conforme HAR
- [ ] `npm run validate:cetesb-source` passa
- [ ] `npm run test:source-of-truth` passa
- [ ] Decision-log atualizado com referência ao HAR

## Interpretação de HAR

Estrutura básica:
```json
{
  "log": {
    "version": "1.2",
    "creator": { "name": "...", "version": "..." },
    "entries": [
      {
        "request": {
          "method": "POST",
          "url": "https://mtr.cetesb.sp.gov.br/...",
          "headers": [...],
          "postData": { "text": "...", "mimeType": "..." }
        },
        "response": {
          "status": 200,
          "statusText": "OK",
          "headers": [...],
          "content": { "text": "...", "mimeType": "..." }
        }
      }
    ]
  }
}
```

Quando analisar HAR:
1. Extrair **operation** do URL
2. Extrair **request structure** (body JSON)
3. Extrair **response structure** (body JSON)
4. Notar **headers importantes** (Content-Type, Authorization, X-CSRF)
5. Registrar **status codes** (sucesso + erro)
6. Registrar **cookies** (especialmente Session/Auth)

## Cenários comuns

### Novo campo em HAR
```
1. Atualizar src/lib/validators/ se campo é obrigatório
2. Atualizar openapi/ schema
3. Atualizar examples/
4. Atualizar gateway mapping se necessário
5. Adicionar test caso se é campo crítico
6. Executar validate:cetesb-source + test:source-of-truth
7. Registrar em decision-log
```

### HAR mostra erro inesperado
```
1. Extrair status code e response body do HAR
2. Verificar se erro é esperado (validação CETESB)
3. Verificar se erro é transiente (timeout, rate limit)
4. Adicionar caso de erro em openapi/
5. Adicionar validação preventiva se possível
6. Registrar em decision-log (por que erro ocorre)
7. Escalar para integrador-cetesb-mtr se for bug de integração
```

### HAR de contexto diferente
```
1. Documentar raiz do HAR (versão, data, sessão)
2. Comparar com HAR anterior da mesma operação
3. Se comportamento diverge → verificar causa
4. Se causa é válida → registrar variação em decision-log
5. Se causa é bug → escalar para CETESB
```

## Referências
- `docs/cetesb/README.md` - índice de HARs
- `docs/copilot/07-integracao-cetesb.md` - guia de integração
- `docs/copilot/13-decision-log.md` - histórico de decisões
- `src/lib/cetesb-source-of-truth.js` - mapeamento central
- `scripts/validate-cetesb-source-of-truth.js` - validação automática

