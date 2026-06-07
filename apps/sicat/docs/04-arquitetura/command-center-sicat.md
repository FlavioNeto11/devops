# Arquitetura alvo — Command Center SICAT (base estrutural)

> Documento de arquitetura conceitual. Define a **base estrutural** do
> futuro chat orquestrador do SICAT. **Nenhuma camada de IA generativa
> é introduzida nesta etapa.** O objetivo é estabelecer registry de
> comandos, contratos read-only previsíveis e UI palette, de forma que
> uma futura camada generativa possa ser acoplada sem reescrita.

## 1. Escopo desta etapa

Está incluído:

- definição do **registry de comandos** que o Command Center poderá
  invocar;
- definição da **paleta UI** (Vue) reservada para invocação rápida;
- definição dos **hooks read-only** que a camada generativa consumirá
  (overview, jobs/search, audit/search);
- definição dos **requisitos de segurança e RBAC** para qualquer
  invocação automatizada futura.

Está fora:

- modelos de IA generativa, prompts, agentes ou orquestração de LLM;
- endpoints `/v1/ai/*`, `/v1/chat/*` ou similares;
- streaming de respostas geradas;
- qualquer integração com provedores externos de IA.

A fase 05 (`frontend-vue-ux-mtr`) entrega o módulo
`frontend/src/modules/command-center/` com o registry e a paleta UI
funcionando localmente, sem backend generativo.

## 2. Registry de comandos

O registry é uma estrutura declarativa que enumera, para cada operação
operável pelo Command Center, os metadados necessários para invocação
segura.

### 2.1 Shape proposto

```ts
type CommandDescriptor = {
  id: string;                 // ex: 'manifest.submit'
  title: string;              // label humano
  description: string;        // descrição curta
  category: 'manifest' | 'cdf' | 'cetesb' | 'jobs' | 'audit' | 'reports';
  endpoint: {
    method: 'GET' | 'POST' | 'DELETE';
    path: string;             // ex: '/v1/manifestos/:id/submit'
  };
  async: boolean;             // true => retorna 202 + jobId
  idempotent: boolean;        // requer Idempotency-Key
  parameters: CommandParameterDescriptor[];
  rbac: {
    requiredRoles?: string[];
    requiredPermissions?: string[];
  };
  audit: {
    correlationIdRequired: true;
  };
  source: 'static' | 'generated';
};
```

`source: 'generated'` reserva espaço para popular o registry a partir
de `src/generated/operations.ts` em uma evolução futura. Nesta etapa,
o registry pode ser estático em `frontend/src/modules/command-center/`.

### 2.2 Comandos iniciais

Conjunto mínimo coberto pelo registry inicial (todos já existentes ou
planejados pelo Centro Operacional):

- `manifest.submit`, `manifest.print`, `manifest.cancel`,
  `manifest.receive`, `manifest.replicate`;
- `cdf.generate`, `cdf.download`, `cdf.list`;
- `catalog.sync`;
- `cetesb.accounts.list`, `cetesb.accounts.activate`;
- `jobs.search`, `jobs.events`, `jobs.retry`;
- `audit.search`, `audit.byCorrelationId`;
- `reports.mtrs`, `reports.mtrs.export`;
- `operations.overview`.

Cada entrada referencia o endpoint REST canônico e nunca duplica
lógica.

## 3. Paleta UI

Componente Vue 3 reservado em `frontend/src/modules/command-center/`:

- atalho de teclado global (`Ctrl+K`/`Cmd+K`);
- pesquisa fuzzy sobre `title`, `description` e `id`;
- preview do endpoint, parâmetros e RBAC necessário;
- execução respeita RBAC do usuário SICAT corrente;
- comandos assíncronos exibem `jobId` retornado e link direto para o
  jobs-console.

A paleta NÃO interpreta linguagem natural nesta etapa — apenas casa
texto contra o registry.

## 4. Hooks read-only para futura camada generativa

Os endpoints abaixo são desenhados para serem seguros para uma camada
generativa consumir sem efeitos colaterais:

- `GET /v1/operations/overview`
- `GET /v1/jobs/search`
- `GET /v1/jobs/:id/events`
- `GET /v1/audit/search`
- `GET /v1/audit/:correlationId`
- `GET /v1/cetesb/accounts/health`
- `GET /v1/cetesb/sessions/health`
- `GET /v1/reports/mtrs`

Requisitos arquiteturais:

- todos retornam JSON estruturado e estável;
- todos respeitam paginação consistente;
- nenhum executa ação mutável;
- todos preservam `correlationId` no response.

Esses contratos formam a "biblioteca de leitura" que uma camada
generativa pode consultar para responder perguntas operacionais sem
disparar comandos.

## 5. Segurança e governança

Pré-requisitos não negociáveis para qualquer evolução futura
generativa:

- toda invocação passa pelo middleware `sicatAuthMiddleware`;
- toda invocação respeita o RBAC declarado no `CommandDescriptor`;
- toda invocação gera `correlationId` único e fica auditada em
  `audit_log`/`exchanges`;
- comandos mutáveis exigem confirmação explícita do usuário antes da
  execução, mesmo quando sugeridos pela camada generativa;
- nenhum prompt ou resposta gerada substitui validações existentes
  (`manifest-validator`, `idempotency-service`).

## 6. Roadmap de evolução (fora desta entrega)

Após a baseline do Centro Operacional estar consolidada e os hooks
read-only publicados, possíveis evoluções futuras (cada uma se torna
um `work_id` próprio):

1. **Indexação semântica** dos endpoints e da documentação para um
   provedor de IA escolhido na ocasião.
2. **Camada de intenção**: tradução de linguagem natural para
   `CommandDescriptor` + parâmetros, com confirmação humana.
3. **Streaming de respostas** sobre os endpoints read-only.
4. **Sugestões proativas** baseadas em telemetria
   (ex: "DLQ de `manifest.submit` está crescendo — investigar?").

Nenhuma dessas evoluções é compromisso desta entrega.

## 7. Decisões registradas

- Command Center é base estrutural; não há backend de IA acoplado.
- Registry vive no frontend nesta etapa; pode migrar para backend
  quando houver demanda real.
- Hooks read-only são parte do Centro Operacional; o Command Center
  apenas os referencia.
- Nenhum endpoint `/v1/ai/*` é introduzido.
