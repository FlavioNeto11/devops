/**
 * Modelo PURO do formulário "Registrar viagem" (REQ-SICAT-0032, onda F3) —
 * validação e montagem do payload do POST /v1/transporte/operacoes fora do
 * componente, testável em node:test. O contrato do draft é MÍNIMO: só
 * integrationAccountId e route são obrigatórios; carga/frete são opcionais e
 * só entram no payload quando preenchidos (nunca mandar campo vazio).
 */

export const UF_OPTIONS = Object.freeze([
  'AC', 'AL', 'AM', 'AP', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA', 'MG', 'MS', 'MT',
  'PA', 'PB', 'PE', 'PI', 'PR', 'RJ', 'RN', 'RO', 'RR', 'RS', 'SC', 'SE', 'SP', 'TO'
]);

export const CARGO_REGIME_OPTIONS = Object.freeze([
  { value: 'lotacao', label: 'Lotação (carga fechada)' },
  { value: 'fracionada', label: 'Fracionada' },
  { value: 'unknown', label: 'Ainda não sei' }
]);

export function emptyOperationCreateForm() {
  return {
    referenceCode: '',
    cargoRegime: 'unknown',
    originMunicipality: '',
    originUf: '',
    destinationMunicipality: '',
    destinationUf: '',
    distanceKm: '',
    tollExpected: false,
    freightOfferedAmount: '',
    freightContractedAmount: '',
    cargoType: '',
    cargoWeightKg: '',
    cargoDeclaredValue: '',
    cargoDangerousGoods: false
  };
}

function parsePositiveNumber(raw) {
  const value = Number(String(raw ?? '').replace(',', '.'));
  return Number.isFinite(value) && value >= 0 ? value : null;
}

/** Erros em pt-BR prontos para exibição; lista vazia = formulário válido. */
export function validateOperationCreateForm(form) {
  const errors = [];
  if (!String(form.originMunicipality || '').trim()) errors.push('Informe o município de origem.');
  if (!UF_OPTIONS.includes(form.originUf)) errors.push('Escolha a UF de origem.');
  if (!String(form.destinationMunicipality || '').trim()) errors.push('Informe o município de destino.');
  if (!UF_OPTIONS.includes(form.destinationUf)) errors.push('Escolha a UF de destino.');
  if (String(form.distanceKm || '').trim() !== '') {
    const distance = parsePositiveNumber(form.distanceKm);
    if (distance === null || distance <= 0) errors.push('Distância, quando informada, precisa ser maior que zero.');
  }
  for (const [field, label] of [
    ['freightOfferedAmount', 'Frete ofertado'],
    ['freightContractedAmount', 'Frete contratado'],
    ['cargoWeightKg', 'Peso da carga'],
    ['cargoDeclaredValue', 'Valor da carga']
  ]) {
    if (String(form[field] || '').trim() !== '' && parsePositiveNumber(form[field]) === null) {
      errors.push(`${label}, quando informado, precisa ser um número válido (maior ou igual a zero).`);
    }
  }
  if (!String(form.cargoType || '').trim()) {
    // Carga é opcional no draft; mas peso/valor sem o TIPO ficariam órfãos no payload.
    if (String(form.cargoWeightKg || '').trim() !== '' || String(form.cargoDeclaredValue || '').trim() !== '') {
      errors.push('Para informar peso ou valor da carga, diga também o tipo da carga.');
    }
  }
  return errors;
}

/** Monta o payload do contrato a partir do formulário JÁ validado. */
export function buildOperationCreatePayload(form, { integrationAccountId, sessionContextId } = {}) {
  const payload = {
    integrationAccountId,
    cargoRegime: form.cargoRegime || 'unknown',
    route: {
      originMunicipality: String(form.originMunicipality).trim(),
      originUf: form.originUf,
      destinationMunicipality: String(form.destinationMunicipality).trim(),
      destinationUf: form.destinationUf,
      routeSource: 'manual',
      tollExpected: Boolean(form.tollExpected)
    }
  };
  if (sessionContextId) payload.sessionContextId = sessionContextId;
  if (String(form.referenceCode || '').trim()) payload.referenceCode = String(form.referenceCode).trim();

  const distance = parsePositiveNumber(form.distanceKm);
  if (distance !== null && distance > 0) payload.route.distanceKm = distance;

  const offered = parsePositiveNumber(form.freightOfferedAmount);
  if (offered !== null && String(form.freightOfferedAmount).trim() !== '') payload.freightOfferedAmount = offered;
  const contracted = parsePositiveNumber(form.freightContractedAmount);
  if (contracted !== null && String(form.freightContractedAmount).trim() !== '') payload.freightContractedAmount = contracted;

  if (String(form.cargoType || '').trim()) {
    const cargo = { cargoType: String(form.cargoType).trim(), dangerousGoods: Boolean(form.cargoDangerousGoods) };
    const weight = parsePositiveNumber(form.cargoWeightKg);
    if (weight !== null && String(form.cargoWeightKg).trim() !== '' && weight > 0) cargo.weightKg = weight;
    const declared = parsePositiveNumber(form.cargoDeclaredValue);
    if (declared !== null && String(form.cargoDeclaredValue).trim() !== '') cargo.declaredValue = declared;
    payload.cargo = [cargo];
  }
  return payload;
}

/** Idempotency-Key nova por TENTATIVA de envio (retry do operador = chave nova). */
export function newOperationIdempotencyKey() {
  try {
    return `op-create-${crypto.randomUUID()}`;
  } catch {
    return `op-create-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  }
}
