// services/records-service.js — regras de negócio de records; chama o repository.
import * as recordsRepo from '../repositories/records-repo.js';

export async function listRecords(tenantId, status) {
  return recordsRepo.list(tenantId, status);
}
