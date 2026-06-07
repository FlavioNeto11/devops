import { AppError } from '../lib/problem.js';
import { createPrefixedId } from '../lib/ids.js';
import { buildCommandAccepted } from '../lib/command-response.js';
import { nowIso } from '../lib/time.js';
import { createCatalogSyncRequest, getCatalog, updateCatalogSyncRequest, replaceCatalogVersion } from '../repositories/catalog-repo.js';
import { insertJob } from '../repositories/job-repo.js';
import { parsePage, parsePageSize, toPagedResponse } from '../lib/pagination.js';
import { ensureIntegrationAccount } from '../repositories/integration-account-repo.js';
import { getIdempotentResponse, rememberIdempotentResponse } from './idempotency-service.js';
import { calculateJobPriority, getRetryConfig, extractJobTags } from '../lib/retry.js';
import { createCetesbGateway } from '../gateways/cetesb-gateway.js';

type HeaderMap = Record<string, string | undefined>;
type EnqueueCatalogSyncBody = {
  integrationAccountId: string;
  catalogs?: string[];
  forceRefresh?: boolean;
  requestedBy?: string | null;
  [key: string]: unknown;
};
type CatalogSyncPayload = {
  catalogs?: string[];
  integrationAccountId?: string | null;
  sessionContextId?: string | null;
};
type CatalogSyncRequestLike = {
  id: string;
  integration_account_id?: string | null;
  integrationAccountId?: string | null;
};
type CetesbGatewayLike = {
  fetchCatalogs(
    names: string[],
    options?: {
      integrationAccountId?: string | null;
      sessionContextId?: string | null;
    }
  ): Promise<Array<{
    name: string;
    source?: string | null;
    error?: unknown;
    items?: Array<Record<string, unknown>>;
  }>>;
};
type QueryCatalogQuery = {
  page?: unknown;
  pageSize?: unknown;
  version?: string;
  search?: string;
  integrationAccountId?: string;
  sessionContextId?: string;
};

const DEFAULT_CATALOGS = [
  'states',
  'cities',
  'classes',
  'units',
  'issuingAuthorities',
  'residueTreatments',
  'residueStates',
  'packagingGroups',
  'residueClasses',
  'abnt',
  'generatorAbnt'
];

function getAppErrorRemoteStatus(error: AppError): number {
  const asObject = error as unknown as Record<string, unknown>;
  return Number(asObject.remoteStatus || 0);
}

const gateway = createCetesbGateway();

export async function enqueueCatalogSync(body: EnqueueCatalogSyncBody, headers: HeaderMap, correlationId: string | null) {
  if (!body?.integrationAccountId) {
    throw new AppError(400, 'Bad Request', 'integrationAccountId is required.');
  }

  const idempotencyKey = headers['idempotency-key'];
  const reused = await getIdempotentResponse('catalog.sync', idempotencyKey);
  if (reused) return reused;

  await ensureIntegrationAccount(body.integrationAccountId);

  const syncId = createPrefixedId('sync');
  const jobId = createPrefixedId('job');
  const commandId = createPrefixedId('cmd');

  await createCatalogSyncRequest({
    id: syncId,
    integrationAccountId: body.integrationAccountId,
    catalogs: body.catalogs || DEFAULT_CATALOGS,
    forceRefresh: body.forceRefresh === true,
    requestedBy: body.requestedBy || null,
    status: 'queued'
  });

  const operation = 'catalog.sync';
  const retryConfig = getRetryConfig(operation);
  const priority = calculateJobPriority(operation);

  await insertJob({
    jobId,
    commandId,
    entityType: 'catalogSync',
    entityId: syncId,
    operation,
    payload: body,
    status: 'queued',
    maxAttempts: retryConfig.maxAttempts,
    correlationId,
    idempotencyKey,
    priority,
    retryStrategy: retryConfig.strategy,
    baseDelayMs: retryConfig.baseDelayMs,
    maxDelayMs: retryConfig.maxDelayMs,
    tags: extractJobTags({ operation, entityType: 'catalogSync', status: 'queued' })
  });

  const response = buildCommandAccepted({
    commandId,
    jobId,
    correlationId: String(correlationId || ''),
    entityType: 'catalogSync',
    entityId: syncId,
    operation: 'catalog.sync'
  });
  response.links.entity = `/v1/jobs/${jobId}`;
  await rememberIdempotentResponse({ operation: 'catalog.sync', idempotencyKey, entityType: 'catalogSync', entityId: syncId, response });
  return response;
}

export async function queryCatalog(catalogName: string, queryString: QueryCatalogQuery) {
  const page = parsePage(queryString.page, 1);
  const pageSize = parsePageSize(queryString.pageSize, 50);
  const requestedVersion = queryString.version || 'current';
  let lazyResolvedEmpty = false;
  let lazyResolvedSource = null;

  let result = await getCatalog({
    catalogName,
    version: requestedVersion,
    search: queryString.search || '',
    page,
    pageSize
  });

  if (!result) {
    const version = nowIso();

    try {
      const fetched = await (gateway as unknown as CetesbGatewayLike).fetchCatalogs([catalogName], {
        integrationAccountId: queryString.integrationAccountId || null,
        sessionContextId: queryString.sessionContextId || null
      });

      const catalog = fetched?.[0];
      if (catalog) {
        if (catalog.error) {
          lazyResolvedEmpty = true;
          lazyResolvedSource = catalog.source || 'cetesb-real';
        }

        const items = catalog.items || [];
        if (!catalog.error && items.length > 0) {
          await replaceCatalogVersion({
            catalogName,
            version,
            source: catalog.source || 'cetesb-real',
            items
          });
        } else if (!catalog.error) {
          lazyResolvedEmpty = true;
          lazyResolvedSource = catalog.source || 'cetesb-real';
        }
      }
    } catch (error: unknown) {
      const isNotFound = error instanceof AppError && error.code === 'CETESB_HTTP_ERROR' && getAppErrorRemoteStatus(error) === 404;
      const missingContext =
        error instanceof AppError
        && error.status === 400
        && !queryString.integrationAccountId
        && !queryString.sessionContextId;

      if (isNotFound || missingContext) {
        lazyResolvedEmpty = true;
        lazyResolvedSource = 'cetesb-real';
      } else {
        throw error;
      }
    }

    if (!lazyResolvedEmpty) {
      result = await getCatalog({
        catalogName,
        version: requestedVersion,
        search: queryString.search || '',
        page,
        pageSize
      });
    }
  }

  if (!result && lazyResolvedEmpty) {
    return {
      catalogName,
      version: nowIso(),
      source: lazyResolvedSource || 'cetesb-real',
      syncedAt: nowIso(),
      ...toPagedResponse([], page, pageSize, 0)
    };
  }

  if (!result) {
    throw new AppError(404, 'Not Found', `Catalog ${catalogName} was not found locally.`);
  }

  return {
    catalogName,
    version: result.version,
    source: result.source || 'cetesb-real',
    syncedAt: nowIso(),
    ...toPagedResponse(result.items, page, pageSize, result.totalItems)
  };
}

export async function runCatalogSync(syncRequest: CatalogSyncRequestLike, payload: CatalogSyncPayload, gatewayInstance: CetesbGatewayLike) {
  const version = nowIso();
  const catalogs = payload.catalogs?.length ? payload.catalogs : DEFAULT_CATALOGS;
  const fetched = await gatewayInstance.fetchCatalogs(catalogs, {
    integrationAccountId: payload.integrationAccountId || syncRequest.integration_account_id || syncRequest.integrationAccountId || null,
    sessionContextId: payload.sessionContextId || null
  });

  for (const catalog of fetched) {
    await replaceCatalogVersion({
      catalogName: catalog.name,
      version,
      source: catalog.source || 'cetesb-real',
      items: catalog.items || []
    });
  }
  const syncedCatalogs = fetched.map((item) => item.name);
  await updateCatalogSyncRequest(syncRequest.id, { status: 'succeeded', version, catalogs: syncedCatalogs });
  return { version, catalogs: syncedCatalogs, fetchedCount: fetched.length };
}
