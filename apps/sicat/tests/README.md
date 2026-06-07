# Estratégia de testes

Esta pasta contém a suíte de testes automatizados do backend MTR CETESB.

## Fonte da verdade CETESB

- Cenários de integração devem ser orientados por evidências em `docs/cetesb/`.
- Ao criar novos testes de gateway/fluxo real, referenciar o HAR correspondente.

## Organização

```text
tests/
├── api/                    # Testes de rotas HTTP e contrato
│   └── manifest-submit.test.js
├── integration/            # Fluxos com serviços, Postgres e jobs
│   └── manifest-submit-service.test.js
├── worker/                 # Processamento assíncrono e handlers
│   └── manifest-submit-handler.test.js
├── fixtures/               # Dados de apoio para testes
│   ├── manifests.js
│   ├── session-contexts.js
│   └── jobs.js
├── manifest-submit.md      # Documentação e validação manual
├── manifest-submit-summary.md  # Resumo da cobertura
└── README.md              # Este arquivo
```

## Tipos de testes

### API (`tests/api/`)

Testes de rotas HTTP que validam:

- Contratos de request/response
- Códigos de status HTTP
- Validações de entrada
- Idempotência
- Propagação de headers (correlationId, idempotency-key)

**Execução**: `npm run test:api`

### Integração (`tests/integration/`)

Testes de serviços com persistência real:

- Criação e atualização de entidades
- Validações de negócio
- Persistência em Postgres
- Fluxos completos entre camadas

**Execução**: `npm run test:integration`

### Worker (`tests/worker/`)

Testes de processamento assíncrono:

- Handlers de jobs
- Mudanças de status
- Retry e idempotência
- Integração com gateway isolada por doubles de teste
- Auditoria

**Execução**: `npm run test:worker`

## Comandos disponíveis

```powershell
# Executar todos os testes
npm test

# Executar por categoria
npm run test:api
npm run test:integration
npm run test:worker

# Executar testes de um endpoint específico
npm run test:manifest:submit

# Executar arquivo específico
node --test tests/api/manifest-submit.test.js

# Executar com filtro de nome
node --test --test-name-pattern="idempotência" tests/api/manifest-submit.test.js

# Script completo com setup
pwsh scripts/test-manifest-submit.ps1
```

## Pré-requisitos

1. **Banco de dados rodando**

   ```powershell
   docker-compose up -d postgres
   ```

2. **Migrações executadas**

   ```powershell
   npm run migrate
   ```

3. **API rodando** (para testes de API)

   ```powershell
   npm run dev
   ```

4. **Worker rodando** (para testes end-to-end completos)

   ```powershell
   npm run worker
   ```

## Fixtures

Dados de teste reutilizáveis em `fixtures/`:

- `manifests.js` - Manifestos em diferentes estados
- `session-contexts.js` - Contextos de sessão ativos/expirados
- `jobs.js` - Jobs em diferentes estados de processamento

Importar assim:

```javascript
import { validManifestDraft } from '../fixtures/manifests.js';
```

## Cobertura atual

### ✅ Implementado

- `/v1/manifestos/:id/submit` - 27 testes (API + integração + worker)
- `GET /v1/manifestos` - fallback CETESB + upsert local (integração)

### 📋 Planejado (próximos passos)

1. `/v1/session-contexts` (POST, GET)
2. `/v1/manifestos` (POST, GET)
3. `/v1/manifestos/:id/print` (POST)
4. `/v1/manifestos/:id/cancel` (POST)
5. `/v1/catalog-sync` (POST)
6. `/v1/cadastros` (POST, GET)

Veja `manifest-submit.md` como exemplo de documentação para novos endpoints.

## Boas práticas

1. **Nomenclatura clara**: nome do teste deve descrever o comportamento esperado
2. **Isolamento**: cada teste limpa e cria seus próprios dados
3. **Fixtures reutilizáveis**: evite duplicar dados de teste
4. **Assertions específicas**: valide exatamente o que importa
5. **Isolamento quando necessário**: dependências externas devem ser isoladas em testes unitários
6. **Documentação**: mantenha `.md` atualizado com validações manuais

## Limitações e riscos

### Não coberto por testes automatizados

- reCAPTCHA (não automatizável)
- Renovação de token em tempo real
- Concorrência com múltiplos workers
- Performance sob alta carga
- Mudanças no contrato da CETESB
- Rate limiting externo
- Falhas de rede intermitentes

### Estratégia de mitigação

- Smoke tests periódicos contra ambiente staging
- Monitoramento de métricas em produção
- Alertas para padrões anormais de erro
- Documentação de comportamentos observados da CETESB

## Contribuindo

Ao adicionar testes para novo endpoint:

1. Crie fixtures se necessário
2. Implemente testes de API (rotas HTTP)
3. Implemente testes de integração (serviço)
4. Implemente testes de worker (se assíncrono)
5. Documente comandos e validações em `.md`
6. Adicione script npm em `package.json`
7. Atualize este README

Veja `manifest-submit-summary.md` como referência.
