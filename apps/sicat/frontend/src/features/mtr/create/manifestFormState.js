/**
 * Estado inicial e validação de MEDIDAS do wizard de criação de MTR — módulo
 * PURO (sem Vue, sem DOM, sem rede), consumido por `components/ManifestCreateForm.vue`.
 *
 * Existe separado do `.vue` para que os defaults do formulário tenham teste que
 * os prenda (`test/unit/manifest-form-state.test.js`). O MTR é documento
 * regulatório: um default de `1` em quantidade/peso faz o operador desatento
 * declarar "1 tonelada" sem perceber — por isso os dois NASCEM VAZIOS (null) e a
 * validação exige valor MAIOR QUE ZERO.
 */

import { getTodayBr } from '../../../utils/date-format.js';

/** Número ou `null` (vazio/inválido). Não confunde '' e '0': '' => null, '0' => 0. */
export function toNumber(value) {
  if (value === null || value === undefined || String(value).trim() === '') {
    return null;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

/**
 * Estado inicial do formulário de MTR. `expeditionDate` nasce com HOJE (dd/mm/yyyy)
 * porque é o caso real dominante; medidas e catálogos nascem VAZIOS.
 */
export function createEmptyManifestForm() {
  return {
    integrationAccountId: '',
    batchCount: 1,
    expeditionDate: getTodayBr(),
    responsibleName: '',
    driverName: '',
    vehiclePlate: '',
    notes: '',
    // MTR é documento regulatório: quantidade e peso NASCEM VAZIOS. Um default de
    // `1` fazia o operador desatento declarar "1 tonelada" sem perceber. A
    // validação exige > 0, então o preenchimento é sempre consciente.
    quantity: null,
    weightTon: null,
    unitCode: '',
    residueCode: '',
    treatmentCode: '',
    classCode: '',
    stateTypeCode: '',
    packagingTypeCode: '',
    hasTemporaryStorage: false,
    hasCadriInResidueList: false
  };
}

/**
 * Erros das medidas do resíduo (quantidade e peso). String vazia = campo ok.
 * Vazio e zero têm mensagens DIFERENTES de propósito: "não informei" e
 * "informei zero" são erros distintos para quem preenche.
 */
export function resolveMeasureErrors(form) {
  const quantity = toNumber(form?.quantity);
  const weightTon = toNumber(form?.weightTon);

  return {
    quantity: quantity === null
      ? 'Informe a quantidade transportada.'
      : (quantity > 0 ? '' : 'Informe uma quantidade maior que zero.'),
    weightTon: weightTon === null
      ? 'Informe o peso em toneladas.'
      : (weightTon > 0 ? '' : 'Informe um peso em toneladas maior que zero.')
  };
}
