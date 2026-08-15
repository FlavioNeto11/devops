import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import swaggerUi from 'swagger-ui-express';

import { loadOpenApiSpec, getOpenApiYamlText } from './lib/openapi.js';
import { requestContextMiddleware } from './middlewares/request-context.js';
import { authMiddleware } from './middlewares/auth.js';
import { sicatAuthMiddleware } from './middlewares/sicat-auth.js';
import { notFoundMiddleware } from './middlewares/not-found.js';
import { errorHandlerMiddleware } from './middlewares/error-handler.js';
import { createSystemRouter } from './routes/system-routes.js';
import { createApiRouter } from './routes/api-routes.js';
import { createConversationRouter } from './routes/conversation-routes.js';
import { createAiControlRouter } from './routes/ai-control-routes.js';
import { createChannelWebhookRouter } from './routes/channel-webhook-routes.js';
import { captureChannelRawBody, isChannelRequestUrl } from './lib/raw-body.js';
import healthRoutes from './routes/health-routes.js';

export function createApp() {
  const app = express();
  const openApiSpec = loadOpenApiSpec();

  app.disable('x-powered-by');
  app.use(helmet({
    crossOriginResourcePolicy: false,
    referrerPolicy: { policy: 'no-referrer-when-downgrade' }
  }));
  app.use(cors({
    origin: [
      'http://localhost:5173',
      'http://127.0.0.1:5173',
      'http://localhost:5174',
      'http://127.0.0.1:5174',
      'http://localhost:3000'
    ],
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
    allowedHeaders: ['Content-Type', 'Authorization', 'Idempotency-Key', 'X-Correlation-Id'],
    maxAge: 3600
  }));
  // O `verify` guarda o corpo BRUTO das rotas de canal externo (HMAC da Meta é sobre os bytes
  // exatos). Extraído para `lib/raw-body.ts` porque o router de canal monta um SEGUNDO parser
  // (`express.urlencoded`, para o Twilio) e os dois têm de capturar pela MESMA regra.
  app.use(express.json({ limit: '2mb', verify: captureChannelRawBody }));
  app.use(morgan('dev', {
    // O `:url` do morgan loga `originalUrl` COM query string, e o GET de verificação do Meta carrega
    // `hub.verify_token` ali — que iria para stdout → Promtail → Loki. (O access log do Traefik
    // registra a URI antes do app e está fora do alcance deste skip: trate
    // `WHATSAPP_META_VERIFY_TOKEN` como segredo de uso único e rotacione após a verificação.)
    skip: (req) => req.method === 'GET' && isChannelRequestUrl(req.url)
  }));
  app.use(requestContextMiddleware);
  app.use(authMiddleware);

  // Contrato interno FECHADO. As três superfícies servem o MESMO documento — fechar só o `.yaml` e o
  // `.json` seria teatro, porque o Swagger UI monta a página a partir do spec já carregado em memória
  // e não passa por aquelas rotas. Por isso as três levam o mesmo gate, na mesma mudança.
  //
  // `swaggerUi.serve` é `[swaggerInitFn, swaggerAssetMiddleware()]`: os assets próprios do Swagger UI
  // (`/docs/swagger-ui.css`, `/docs/swagger-ui-bundle.js`, …) saem do MESMO mount `/docs`, então o
  // middleware posicionado antes dele cobre página e assets de uma vez — não há rota irmã aberta.
  //
  // Consequência aceita: `/docs` deixa de ser navegável no browser, porque `<link>`/`<script>` não
  // carregam header `Authorization` nas subrequisições. Quem precisa do contrato busca o spec com
  // token (`curl -H "Authorization: Bearer …" …/openapi.yaml`). Era um documento com CNPJ, CPF,
  // endereço e nome de pessoa reais servido anonimamente na internet.
  app.get('/openapi.yaml', sicatAuthMiddleware, (_req, res) => {
    res.type('text/yaml').send(getOpenApiYamlText());
  });

  app.get('/openapi.json', sicatAuthMiddleware, (_req, res) => {
    res.json(openApiSpec);
  });

  app.use('/docs', sicatAuthMiddleware, swaggerUi.serve, swaggerUi.setup(openApiSpec, { explorer: true }));
  app.use('/health', healthRoutes);  // Rotas de health e observabilidade
  app.use(createSystemRouter(openApiSpec));
  app.use(createApiRouter());
  app.use(createConversationRouter());
  app.use(createAiControlRouter());
  // Canal externo (Meta/Twilio): público por contrato, autenticado por HMAC na própria rota.
  app.use(createChannelWebhookRouter());
  app.use(notFoundMiddleware);
  app.use(errorHandlerMiddleware);

  return app;
}
