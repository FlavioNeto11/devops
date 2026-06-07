import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mapOperationalStatus } from '../../src/services/operations-service.ts';

describe('mapOperationalStatus', () => {
  it('maps queued -> ready', () => {
    assert.equal(mapOperationalStatus({ status: 'queued' }), 'ready');
  });

  it('maps running -> running', () => {
    assert.equal(mapOperationalStatus({ status: 'running' }), 'running');
  });

  it('maps retry_wait -> retry_wait', () => {
    assert.equal(mapOperationalStatus({ status: 'retry_wait' }), 'retry_wait');
  });

  it('maps dlq -> dlq', () => {
    assert.equal(mapOperationalStatus({ status: 'dlq' }), 'dlq');
  });

  it('maps cancelled -> failed_internal_processing', () => {
    assert.equal(
      mapOperationalStatus({ status: 'cancelled' }),
      'failed_internal_processing'
    );
  });

  it('maps succeeded -> completed_with_document', () => {
    assert.equal(
      mapOperationalStatus({ status: 'succeeded' }),
      'completed_with_document'
    );
  });

  it('discriminates failed by error code (validation)', () => {
    assert.equal(
      mapOperationalStatus({ status: 'failed', lastErrorCode: 'VALIDATION_ERROR' }),
      'failed_validation'
    );
  });

  it('discriminates failed by error code (auth)', () => {
    assert.equal(
      mapOperationalStatus({ status: 'failed', lastErrorCode: 'AUTH_EXPIRED' }),
      'failed_remote_auth'
    );
  });

  it('discriminates failed by error code (remote/cetesb)', () => {
    assert.equal(
      mapOperationalStatus({ status: 'failed', lastErrorCode: 'CETESB_500' }),
      'failed_remote_contract'
    );
    assert.equal(
      mapOperationalStatus({ status: 'failed', lastErrorCode: 'REMOTE_TIMEOUT' }),
      'failed_remote_contract'
    );
  });

  it('falls back to failed_internal_processing for unknown failed codes', () => {
    assert.equal(
      mapOperationalStatus({ status: 'failed', lastErrorCode: null }),
      'failed_internal_processing'
    );
    assert.equal(
      mapOperationalStatus({ status: 'failed', lastErrorCode: 'UNKNOWN' }),
      'failed_internal_processing'
    );
  });

  it('returns the status as-is for unknown values', () => {
    assert.equal(mapOperationalStatus({ status: 'weird' }), 'weird');
  });
});
