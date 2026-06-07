import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import swaggerUi from 'swagger-ui-express';

import { loadOpenApiSpec, getOpenApiYamlText } from './lib/openapi.js';
import { requestContextMiddleware } from './middlewares/request-context.js';
import { authMiddleware } from './middlewares/auth.js';
import { notFoundMiddleware } from './middlewares/not-found.js';
import { errorHandlerMiddleware } from './middlewares/error-handler.js';
import { createSystemRouter } from './routes/system-routes.js';
import { createApiRouter } from './routes/api-routes.js';
import { createConversationRouter } from './routes/conversation-routes.js';
import { createAiControlRouter } from './routes/ai-control-routes.js';
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
  app.use(express.json({ limit: '2mb' }));
  app.use(morgan('dev'));
  app.use(requestContextMiddleware);
  app.use(authMiddleware);

  app.get('/openapi.yaml', (_req, res) => {
    res.type('text/yaml').send(getOpenApiYamlText());
  });

  app.get('/openapi.json', (_req, res) => {
    res.json(openApiSpec);
  });

  app.use('/docs', swaggerUi.serve, swaggerUi.setup(openApiSpec, { explorer: true }));
  app.use('/health', healthRoutes);  // Rotas de health e observabilidade
  app.use(createSystemRouter(openApiSpec));
  app.use(createApiRouter());
  app.use(createConversationRouter());
  app.use(createAiControlRouter());
  app.use(notFoundMiddleware);
  app.use(errorHandlerMiddleware);

  return app;
}
