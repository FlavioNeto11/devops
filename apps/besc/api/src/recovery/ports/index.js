// Portas das fases futuras (F4–F9). Existem para fixar o CONTRATO de entrada — só um
// RegisteredAsset passa — e para falhar explicitamente. Nenhuma delas finge integração:
// não há adaptador de escriturador, depositário, registradora, custódia, liquidação ou
// tokenização nesta rodada (ADR-010). Chamar qualquer operação lança NotAvailableInPhaseError
// DEPOIS de validar o sujeito, para que o teste prove as duas coisas.
import { assertRegisteredAsset } from '../domain/invariants.js';
import { NotAvailableInPhaseError } from '../domain/errors.js';
import { assertCapability } from '../../governance/capabilities.js';

export const collateralPort = Object.freeze({
  proposeGuarantee(asset) { assertRegisteredAsset(asset); throw new NotAvailableInPhaseError('Collateral (garantia averbada no system of record)', 'F6'); },
});

export const custodyPort = Object.freeze({
  openCustody(asset) { assertRegisteredAsset(asset); throw new NotAvailableInPhaseError('Custody orchestration', 'F5'); },
});

export const settlementPort = Object.freeze({
  settle(asset) { assertRegisteredAsset(asset); assertCapability('REAL_MONEY'); throw new NotAvailableInPhaseError('Settlement', 'F7'); },
});

export const regulatedRepresentationPort = Object.freeze({
  represent(asset) { assertRegisteredAsset(asset); assertCapability('TOKENIZATION_REAL'); throw new NotAvailableInPhaseError('Regulated representation / tokenização', 'F9'); },
});

// Ports de validação externa (F4): contrato declarado, sem implementação real.
export const externalValidationPort = Object.freeze({
  requestBookkeeperStatement() { throw new NotAvailableInPhaseError('Integração com escriturador', 'F4'); },
  requestCentralDepositoryPosition() { throw new NotAvailableInPhaseError('Integração com depositário central', 'F4'); },
  lookupCourtDecision() { throw new NotAvailableInPhaseError('Consulta a tribunais', 'F4'); },
});
