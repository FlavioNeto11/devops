import { describe, it, before, after, beforeEach } from 'node:test';
import assert from 'node:assert';
import { query, pool } from '../../src/db/pool.js';
import { processJob } from '../../src/workers/operation-handlers.js';
import { findJobById } from '../../src/repositories/job-repo.js';
import { findAsyncOperationEntity } from '../../src/repositories/async-operation-repo.js';
import { validSessionContext } from '../fixtures/session-contexts.js';

function buildGatewayExchange({ endpoint, data }) {
  return {
    request: {
      httpMethod: 'POST',
      endpoint,
      sanitizedHeaders: { 'content-type': 'application/json' },
      sanitizedBody: {}
    },
    response: {
      httpMethod: 'POST',
      endpoint,
      httpStatus: 200,
      latencyMs: 25,
      sanitizedHeaders: { 'content-type': 'application/json' },
      sanitizedBody: data,
      data
    },
    extraAudits: []
  };
}

describe('Detached async operations worker', () => {
  const accountPrefix = 'acc_async_wrk_';
  const sessionPrefix = 'scx_async_wrk_';
  const receivePrefix = 'mrc_async_wrk_';
  const cdfPrefix = 'cdf_async_wrk_';

  before(async () => {
    await pool.connect().then((client) => client.release());
  });

  beforeEach(async () => {
    await query('DELETE FROM audit_logs WHERE correlation_id LIKE $1', ['corr_async_wrk_%']);
    await query('DELETE FROM async_operation_documents WHERE owner_entity_id LIKE $1 OR owner_entity_id LIKE $2', [`${receivePrefix}%`, `${cdfPrefix}%`]);
    await query('DELETE FROM async_operation_entities WHERE entity_id LIKE $1 OR entity_id LIKE $2', [`${receivePrefix}%`, `${cdfPrefix}%`]);
    await query('DELETE FROM jobs WHERE entity_id LIKE $1 OR entity_id LIKE $2', [`${receivePrefix}%`, `${cdfPrefix}%`]);
    await query('DELETE FROM manifests WHERE integration_account_id LIKE $1', [`${accountPrefix}%`]);
    await query('DELETE FROM session_contexts WHERE id LIKE $1', [`${sessionPrefix}%`]);
    await query('DELETE FROM integration_accounts WHERE id LIKE $1', [`${accountPrefix}%`]);

    await query(
      `INSERT INTO integration_accounts(id, account_name, partner_code, state_code, is_active)
       VALUES ($1,$2,$3,$4,$5)`,
      [`${accountPrefix}001`, 'Async Worker Account', validSessionContext.partnerCode, 26, true]
    );

    await query(
      `INSERT INTO session_contexts(
        id, integration_account_id, status, partner_document, partner_type,
        partner_code, user_access_code, user_name, email, jwt_token_ref,
        expires_at, last_validated_at, metadata
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13::jsonb)`,
      [
        `${sessionPrefix}001`,
        `${accountPrefix}001`,
        validSessionContext.status,
        validSessionContext.partnerDocument,
        validSessionContext.partnerType,
        validSessionContext.partnerCode,
        validSessionContext.userAccessCode,
        validSessionContext.userName,
        validSessionContext.email,
        validSessionContext.jwtTokenRef,
        validSessionContext.expiresAt,
        validSessionContext.lastValidatedAt,
        JSON.stringify(validSessionContext.metadata)
      ]
    );
  });

  after(async () => {
    await query('DELETE FROM audit_logs WHERE correlation_id LIKE $1', ['corr_async_wrk_%']);
    await query('DELETE FROM async_operation_documents WHERE owner_entity_id LIKE $1 OR owner_entity_id LIKE $2', [`${receivePrefix}%`, `${cdfPrefix}%`]);
    await query('DELETE FROM async_operation_entities WHERE entity_id LIKE $1 OR entity_id LIKE $2', [`${receivePrefix}%`, `${cdfPrefix}%`]);
    await query('DELETE FROM jobs WHERE entity_id LIKE $1 OR entity_id LIKE $2', [`${receivePrefix}%`, `${cdfPrefix}%`]);
    await query('DELETE FROM manifests WHERE integration_account_id LIKE $1', [`${accountPrefix}%`]);
    await query('DELETE FROM session_contexts WHERE id LIKE $1', [`${sessionPrefix}%`]);
    await query('DELETE FROM integration_accounts WHERE id LIKE $1', [`${accountPrefix}%`]);
    await pool.end();
  });

  it('processes manifest.receive and stores mirrored manifest plus receipt PDF', async () => {
    await query(
      `INSERT INTO async_operation_entities(
        entity_type, entity_id, operation, integration_account_id, session_context_id,
        status, payload, result, requested_by, correlation_id, last_sync_at
      ) VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb,$8::jsonb,$9,$10,now())`,
      [
        'manifestReceipt',
        `${receivePrefix}001`,
        'manifest.receive',
        `${accountPrefix}001`,
        `${sessionPrefix}001`,
        'queued',
        JSON.stringify({
          integrationAccountId: `${accountPrefix}001`,
          sessionContextId: `${sessionPrefix}001`,
          receiptPayload: {
            dateFrom: '2026-04-01',
            dateTo: '2026-04-30',
            rrmCodigo: 456,
            manifesto: {
              manCodigo: 22169012,
              manNumero: '260010679516',
              manHashCode: 'receive-hash-001',
              listaManifestoResiduo: [{ marCodigo: 'MAR001', marNumeroLinha: '1', residuo: { resCodigoIbama: 'IB001' } }]
            }
          },
          printReceiptAfterReceive: true,
          requestedBy: 'test.user'
        }),
        JSON.stringify(null),
        'test.user',
        'corr_async_wrk_receive_001'
      ]
    );

    await query(
      `INSERT INTO jobs(
        job_id, command_id, entity_type, entity_id, operation, payload,
        status, max_attempts, attempts, correlation_id, idempotency_key,
        started_at, claimed_at, claim_heartbeat_at, claimed_by
      ) VALUES ($1,$2,$3,$4,$5,$6::jsonb,$7,$8,$9,$10,$11,now(),now(),now(),$12)`,
      [
        'job_async_wrk_receive_001',
        'cmd_async_wrk_receive_001',
        'manifestReceipt',
        `${receivePrefix}001`,
        'manifest.receive',
        JSON.stringify({
          integrationAccountId: `${accountPrefix}001`,
          sessionContextId: `${sessionPrefix}001`,
          receiptPayload: {
            rrmCodigo: 456,
            manifesto: { manCodigo: 22169012, manNumero: '260010679516', manHashCode: 'receive-hash-001' }
          }
        }),
        'running',
        3,
        1,
        'corr_async_wrk_receive_001',
        'idem_async_wrk_receive_001',
        'worker-test'
      ]
    );

    const job = await findJobById('job_async_wrk_receive_001');
    const gateway = {
      submitManifest: async () => null,
      printManifest: async () => null,
      cancelManifest: async () => null,
      submitCadastro: async () => null,
      listReceiptResponsibles: async () => buildGatewayExchange({ endpoint: '/receipt/responsibles', data: { items: [{ rrmCodigo: 456, rrmNome: 'Responsavel Teste' }] } }),
      searchReceivableManifests: async () => buildGatewayExchange({ endpoint: '/receipt/search', data: { items: [{ manCodigo: 22169012, manNumero: '260010679516', manHashCode: 'receive-hash-001' }] } }),
      getRemoteManifest: async () => buildGatewayExchange({ endpoint: '/manifest/get', data: { item: { manCodigo: 22169012, manNumero: '260010679516', manHashCode: 'receive-hash-001', parceiroAcesso: { paaCodigo: validSessionContext.partnerCode }, listaManifestoResiduo: [{ marCodigo: 'MAR001', marNumeroLinha: '1', residuo: { resCodigoIbama: 'IB001' } }] } } }),
      receiveManifest: async () => buildGatewayExchange({ endpoint: '/manifest/receive', data: { message: 'Recebimento confirmado' } }),
      printManifestReceipt: async () => buildGatewayExchange({ endpoint: '/manifest/receipt/print', data: { pdfBuffer: Buffer.from('%PDF-receipt%') } }),
      listCdfResponsibles: async () => null,
      searchCdfGeneratorPartner: async () => null,
      searchReceivedManifestsForCdf: async () => null,
      generateCdf: async () => null,
      searchCdfCertificates: async () => null,
      printCdfCertificate: async () => null
    };

    await processJob(job, gateway);

    const updatedJob = await findJobById('job_async_wrk_receive_001');
    assert.strictEqual(updatedJob.status, 'succeeded');
    assert.strictEqual(updatedJob.payload.outcome, 'manifest_received');

    const entity = await findAsyncOperationEntity('manifestReceipt', `${receivePrefix}001`);
    assert.strictEqual(entity.status, 'succeeded');
    assert.strictEqual(entity.result.jobResults['manifest.receive'].outcome, 'manifest_received');
    assert.strictEqual(entity.result.jobResults['manifest.receive'].manHashCode, 'receive-hash-001');

    const documentRes = await query(
      'SELECT * FROM async_operation_documents WHERE owner_entity_type = $1 AND owner_entity_id = $2',
      ['manifestReceipt', `${receivePrefix}001`]
    );
    assert.strictEqual(documentRes.rows.length, 1);
    assert.strictEqual(documentRes.rows[0].type, 'manifest_receipt_pdf');

    const mirroredManifestRes = await query(
      'SELECT * FROM manifests WHERE integration_account_id = $1 AND external_hash_code = $2',
      [`${accountPrefix}001`, 'receive-hash-001']
    );
    assert.strictEqual(mirroredManifestRes.rows.length, 1);
    assert.strictEqual(mirroredManifestRes.rows[0].status, 'submitted');
  });

  it('retry de manifest.receive com POST já confirmado NÃO re-envia o recebimento à CETESB', async () => {
    // Cenário real: 1ª tentativa POSTou a baixa, falhou ao baixar o comprovante
    // (retryable) e o job foi re-agendado. A entity guarda receiveConfirmation.
    await query(
      `INSERT INTO async_operation_entities(
        entity_type, entity_id, operation, integration_account_id, session_context_id,
        status, payload, result, requested_by, correlation_id, last_sync_at
      ) VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb,$8::jsonb,$9,$10,now())`,
      [
        'manifestReceipt',
        `${receivePrefix}002`,
        'manifest.receive',
        `${accountPrefix}001`,
        `${sessionPrefix}001`,
        'running',
        JSON.stringify({
          integrationAccountId: `${accountPrefix}001`,
          sessionContextId: `${sessionPrefix}001`,
          receiptPayload: {
            rrmCodigo: 456,
            manifesto: { manCodigo: 22169013, manNumero: '260010679517', manHashCode: 'receive-hash-002' }
          },
          printReceiptAfterReceive: true,
          receiveConfirmation: {
            confirmedAt: '2026-06-12T20:00:00.000Z',
            manCodigo: 22169013,
            manNumero: '260010679517',
            message: 'Recebimento confirmado'
          },
          requestedBy: 'test.user'
        }),
        JSON.stringify(null),
        'test.user',
        'corr_async_wrk_receive_002'
      ]
    );

    await query(
      `INSERT INTO jobs(
        job_id, command_id, entity_type, entity_id, operation, payload,
        status, max_attempts, attempts, correlation_id, idempotency_key,
        started_at, claimed_at, claim_heartbeat_at, claimed_by
      ) VALUES ($1,$2,$3,$4,$5,$6::jsonb,$7,$8,$9,$10,$11,now(),now(),now(),$12)`,
      [
        'job_async_wrk_receive_002',
        'cmd_async_wrk_receive_002',
        'manifestReceipt',
        `${receivePrefix}002`,
        'manifest.receive',
        JSON.stringify({
          integrationAccountId: `${accountPrefix}001`,
          sessionContextId: `${sessionPrefix}001`,
          receiptPayload: {
            rrmCodigo: 456,
            manifesto: { manCodigo: 22169013, manNumero: '260010679517', manHashCode: 'receive-hash-002' }
          }
        }),
        'running',
        3,
        2,
        'corr_async_wrk_receive_002',
        'idem_async_wrk_receive_002',
        'worker-test'
      ]
    );

    const job = await findJobById('job_async_wrk_receive_002');
    let receivePostCalls = 0;
    const gateway = {
      submitManifest: async () => null,
      printManifest: async () => null,
      cancelManifest: async () => null,
      submitCadastro: async () => null,
      listReceiptResponsibles: async () => buildGatewayExchange({ endpoint: '/receipt/responsibles', data: { items: [{ rrmCodigo: 456, rrmNome: 'Responsavel Teste' }] } }),
      searchReceivableManifests: async () => buildGatewayExchange({ endpoint: '/receipt/search', data: { items: [{ manCodigo: 22169013, manNumero: '260010679517', manHashCode: 'receive-hash-002' }] } }),
      getRemoteManifest: async () => buildGatewayExchange({ endpoint: '/manifest/get', data: { item: { manCodigo: 22169013, manNumero: '260010679517', manHashCode: 'receive-hash-002', parceiroAcesso: { paaCodigo: validSessionContext.partnerCode }, listaManifestoResiduo: [{ marCodigo: 'MAR002', marNumeroLinha: '1', marQuantidade: 25.2, marQuantidadeRecebida: null, residuo: { resCodigoIbama: 'IB002' } }] } } }),
      receiveManifest: async () => {
        receivePostCalls += 1;
        return buildGatewayExchange({ endpoint: '/manifest/receive', data: { message: 'Recebimento duplicado!' } });
      },
      printManifestReceipt: async () => buildGatewayExchange({ endpoint: '/manifest/receipt/print', data: { pdfBuffer: Buffer.from('%PDF-receipt%') } }),
      listCdfResponsibles: async () => null,
      searchCdfGeneratorPartner: async () => null,
      searchReceivedManifestsForCdf: async () => null,
      generateCdf: async () => null,
      searchCdfCertificates: async () => null,
      printCdfCertificate: async () => null
    };

    await processJob(job, gateway);

    assert.strictEqual(receivePostCalls, 0, 'retry não pode re-POSTar a baixa já confirmada');

    const updatedJob = await findJobById('job_async_wrk_receive_002');
    assert.strictEqual(updatedJob.status, 'succeeded');

    const entity = await findAsyncOperationEntity('manifestReceipt', `${receivePrefix}002`);
    assert.strictEqual(entity.status, 'succeeded');
    // A mensagem vem da confirmação original, não de um novo POST.
    assert.strictEqual(entity.result.jobResults['manifest.receive'].message, 'Recebimento confirmado');

    const documentRes = await query(
      'SELECT * FROM async_operation_documents WHERE owner_entity_type = $1 AND owner_entity_id = $2',
      ['manifestReceipt', `${receivePrefix}002`]
    );
    assert.strictEqual(documentRes.rows.length, 1, 'o comprovante é baixado no retry');
  });

  it('processes cdf.generate and persists generated PDF metadata', async () => {
    await query(
      `INSERT INTO async_operation_entities(
        entity_type, entity_id, operation, integration_account_id, session_context_id,
        status, payload, result, requested_by, correlation_id, last_sync_at
      ) VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb,$8::jsonb,$9,$10,now())`,
      [
        'cdf',
        `${cdfPrefix}generate_001`,
        'cdf.generate',
        `${accountPrefix}001`,
        `${sessionPrefix}001`,
        'queued',
        JSON.stringify({
          integrationAccountId: `${accountPrefix}001`,
          sessionContextId: `${sessionPrefix}001`,
          cdfPayload: {
            cerDataInicial: '2026-04-01',
            cerDataFinal: '2026-04-30',
            cerObservacao: 'geracao teste',
            parceiroDestinador: { parCodigo: validSessionContext.partnerCode },
            responsavel: { cdrCodigo: 789 },
            listaParceiroGerador: [{ parCodigo: 321, parCnpj: '12345678000199' }],
            listaManifesto: [{ manCodigo: 22169012, manNumero: '260010679516', manHashCode: 'receive-hash-001' }]
          },
          requestedBy: 'test.user'
        }),
        JSON.stringify(null),
        'test.user',
        'corr_async_wrk_cdf_generate_001'
      ]
    );

    await query(
      `INSERT INTO jobs(
        job_id, command_id, entity_type, entity_id, operation, payload,
        status, max_attempts, attempts, correlation_id, idempotency_key,
        started_at, claimed_at, claim_heartbeat_at, claimed_by
      ) VALUES ($1,$2,$3,$4,$5,$6::jsonb,$7,$8,$9,$10,$11,now(),now(),now(),$12)`,
      [
        'job_async_wrk_cdf_generate_001',
        'cmd_async_wrk_cdf_generate_001',
        'cdf',
        `${cdfPrefix}generate_001`,
        'cdf.generate',
        JSON.stringify({
          integrationAccountId: `${accountPrefix}001`,
          sessionContextId: `${sessionPrefix}001`,
          cdfPayload: {
            cerDataInicial: '2026-04-01',
            cerDataFinal: '2026-04-30',
            cerObservacao: 'geracao teste',
            parceiroDestinador: { parCodigo: validSessionContext.partnerCode },
            responsavel: { cdrCodigo: 789 },
            listaParceiroGerador: [{ parCodigo: 321, parCnpj: '12345678000199' }],
            listaManifesto: [{ manCodigo: 22169012, manNumero: '260010679516', manHashCode: 'receive-hash-001' }]
          }
        }),
        'running',
        3,
        1,
        'corr_async_wrk_cdf_generate_001',
        'idem_async_wrk_cdf_generate_001',
        'worker-test'
      ]
    );

    const job = await findJobById('job_async_wrk_cdf_generate_001');
    const gateway = {
      submitManifest: async () => null,
      printManifest: async () => null,
      cancelManifest: async () => null,
      submitCadastro: async () => null,
      listReceiptResponsibles: async () => null,
      searchReceivableManifests: async () => null,
      getRemoteManifest: async () => null,
      receiveManifest: async () => null,
      printManifestReceipt: async () => null,
      listCdfResponsibles: async () => buildGatewayExchange({ endpoint: '/cdf/responsibles', data: { items: [{ cdrCodigo: 789, cdrNome: 'Responsavel CDF' }] } }),
      searchCdfGeneratorPartner: async () => buildGatewayExchange({ endpoint: '/cdf/partner', data: { items: [{ parCodigo: 321, parCnpj: '12345678000199' }] } }),
      searchReceivedManifestsForCdf: async () => buildGatewayExchange({ endpoint: '/cdf/manifests', data: { items: [{ manCodigo: 22169012, manNumero: '260010679516', manHashCode: 'receive-hash-001' }] } }),
      generateCdf: async () => buildGatewayExchange({ endpoint: '/cdf/generate', data: { message: 'CDF gerado com sucesso' } }),
      searchCdfCertificates: async () => buildGatewayExchange({ endpoint: '/cdf/search', data: { items: [{ cerCodigo: 9988, cerHashCode: 'cdf-hash-001', cerData: '2026-04-30', cerDataInicial: '2026-04-01', cerDataFinal: '2026-04-30', cerObservacao: 'geracao teste', tipoCertificadoDestinacao: { tcdCodigo: 1 } }] } }),
      printCdfCertificate: async () => buildGatewayExchange({ endpoint: '/cdf/print', data: { pdfBuffer: Buffer.from('%PDF-cdf-generate%') } })
    };

    await processJob(job, gateway);

    const updatedJob = await findJobById('job_async_wrk_cdf_generate_001');
    assert.strictEqual(updatedJob.status, 'succeeded');
    assert.strictEqual(updatedJob.payload.outcome, 'cdf_generated');

    const entity = await findAsyncOperationEntity('cdf', `${cdfPrefix}generate_001`);
    assert.strictEqual(entity.status, 'succeeded');
    assert.strictEqual(entity.result.jobResults['cdf.generate'].outcome, 'cdf_generated');
    assert.strictEqual(entity.result.jobResults['cdf.generate'].certificateHashCode, 'cdf-hash-001');
    assert.strictEqual(entity.result.jobResults['cdf.generate'].totalManifests, 1);

    const documentRes = await query(
      'SELECT * FROM async_operation_documents WHERE owner_entity_type = $1 AND owner_entity_id = $2',
      ['cdf', `${cdfPrefix}generate_001`]
    );
    assert.strictEqual(documentRes.rows.length, 1);
    assert.strictEqual(documentRes.rows[0].hash, 'cdf-hash-001');
    assert.strictEqual(documentRes.rows[0].type, 'cdf_pdf');
  });

  it('processes cdf.download and stores downloaded PDF for the requested certificate', async () => {
    await query(
      `INSERT INTO async_operation_entities(
        entity_type, entity_id, operation, integration_account_id, session_context_id,
        status, payload, result, requested_by, correlation_id, last_sync_at
      ) VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb,$8::jsonb,$9,$10,now())`,
      [
        'cdf',
        `${cdfPrefix}download_001`,
        'cdf.download',
        `${accountPrefix}001`,
        `${sessionPrefix}001`,
        'queued',
        JSON.stringify({
          integrationAccountId: `${accountPrefix}001`,
          sessionContextId: `${sessionPrefix}001`,
          documentId: 'cdf-download-hash-001',
          certificateCriteria: {
            documentId: 'cdf-download-hash-001',
            cerHashCode: 'cdf-download-hash-001',
            cerCodigo: 7766,
            dateFrom: '2026-04-01',
            dateTo: '2026-04-30'
          },
          requestedBy: 'test.user'
        }),
        JSON.stringify(null),
        'test.user',
        'corr_async_wrk_cdf_download_001'
      ]
    );

    await query(
      `INSERT INTO jobs(
        job_id, command_id, entity_type, entity_id, operation, payload,
        status, max_attempts, attempts, correlation_id, idempotency_key,
        started_at, claimed_at, claim_heartbeat_at, claimed_by
      ) VALUES ($1,$2,$3,$4,$5,$6::jsonb,$7,$8,$9,$10,$11,now(),now(),now(),$12)`,
      [
        'job_async_wrk_cdf_download_001',
        'cmd_async_wrk_cdf_download_001',
        'cdf',
        `${cdfPrefix}download_001`,
        'cdf.download',
        JSON.stringify({
          integrationAccountId: `${accountPrefix}001`,
          sessionContextId: `${sessionPrefix}001`,
          documentId: 'cdf-download-hash-001',
          certificateCriteria: {
            documentId: 'cdf-download-hash-001',
            cerHashCode: 'cdf-download-hash-001',
            cerCodigo: 7766,
            dateFrom: '2026-04-01',
            dateTo: '2026-04-30'
          }
        }),
        'running',
        3,
        1,
        'corr_async_wrk_cdf_download_001',
        'idem_async_wrk_cdf_download_001',
        'worker-test'
      ]
    );

    const job = await findJobById('job_async_wrk_cdf_download_001');
    const gateway = {
      submitManifest: async () => null,
      printManifest: async () => null,
      cancelManifest: async () => null,
      submitCadastro: async () => null,
      listReceiptResponsibles: async () => null,
      searchReceivableManifests: async () => null,
      getRemoteManifest: async () => null,
      receiveManifest: async () => null,
      printManifestReceipt: async () => null,
      listCdfResponsibles: async () => null,
      searchCdfGeneratorPartner: async () => null,
      searchReceivedManifestsForCdf: async () => null,
      generateCdf: async () => null,
      searchCdfCertificates: async () => buildGatewayExchange({ endpoint: '/cdf/search', data: { items: [{ cerCodigo: 7766, cerHashCode: 'cdf-download-hash-001', cerData: '2026-04-30' }] } }),
      printCdfCertificate: async () => buildGatewayExchange({ endpoint: '/cdf/print', data: { pdfBuffer: Buffer.from('%PDF-cdf-download%') } })
    };

    await processJob(job, gateway);

    const updatedJob = await findJobById('job_async_wrk_cdf_download_001');
    assert.strictEqual(updatedJob.status, 'succeeded');
    assert.strictEqual(updatedJob.payload.outcome, 'cdf_downloaded');

    const entity = await findAsyncOperationEntity('cdf', `${cdfPrefix}download_001`);
    assert.strictEqual(entity.status, 'succeeded');
    assert.strictEqual(entity.result.jobResults['cdf.download'].outcome, 'cdf_downloaded');
    assert.strictEqual(entity.result.jobResults['cdf.download'].certificateHashCode, 'cdf-download-hash-001');

    const documentRes = await query(
      'SELECT * FROM async_operation_documents WHERE owner_entity_type = $1 AND owner_entity_id = $2',
      ['cdf', `${cdfPrefix}download_001`]
    );
    assert.strictEqual(documentRes.rows.length, 1);
    assert.strictEqual(documentRes.rows[0].hash, 'cdf-download-hash-001');
  });
});