import { AppError } from '../problem.js';

type ManifestResidueInput = {
  residue?: { code?: string | number };
  unit?: { code?: string | number };
  treatment?: { code?: string | number };
  class?: { code?: string | number };
  quantity?: number;
};

type ManifestPayloadInput = {
  responsibleName?: string;
  manifestType?: number | string | null;
  expeditionDate?: string;
  state?: { code?: string | number; abbreviation?: string };
  generator?: { partnerCode?: string | number };
  carrier?: { partnerCode?: string | number };
  receiver?: { partnerCode?: string | number };
  residues?: ManifestResidueInput[];
  hasTemporaryStorage?: boolean;
  temporaryStorage?: { partnerCode?: string | number };
  temporaryStorageCarrier?: { partnerCode?: string | number };
};

export function validateManifestPayload(payload: ManifestPayloadInput): void {
  const errors: string[] = [];

  if (!payload.responsibleName || payload.responsibleName.trim() === '') {
    errors.push('Campo obrigatório ausente: responsibleName (manResponsavel)');
  }

  if (payload.manifestType == null) {
    errors.push('Campo obrigatório ausente: manifestType (tipoManifesto)');
  }

  if (!payload.expeditionDate || payload.expeditionDate.trim() === '') {
    errors.push('Campo obrigatório ausente: expeditionDate (manDataExpedicao)');
  }

  if (!payload.state?.code || !payload.state?.abbreviation) {
    errors.push('Campo obrigatório ausente: state.code e state.abbreviation (estado)');
  }

  if (!payload.generator?.partnerCode) {
    errors.push('Campo obrigatório ausente: generator.partnerCode (parceiroGerador.parCodigo)');
  }

  if (!payload.carrier?.partnerCode) {
    errors.push('Campo obrigatório ausente: carrier.partnerCode (parceiroTransportador.parCodigo)');
  }

  if (!payload.receiver?.partnerCode) {
    errors.push('Campo obrigatório ausente: receiver.partnerCode (parceiroDestinador.parCodigo)');
  }

  if (!payload.residues || !Array.isArray(payload.residues) || payload.residues.length === 0) {
    errors.push('Campo obrigatório ausente: residues (listaManifestoResiduo) - deve conter pelo menos um resíduo');
  } else {
    payload.residues.forEach((residue: ManifestResidueInput, index: number) => {
      if (!residue.residue?.code) {
        errors.push(`Resíduo [${index}]: Campo obrigatório ausente: residue.code (residuo.resCodigo)`);
      }
      if (!residue.unit?.code) {
        errors.push(`Resíduo [${index}]: Campo obrigatório ausente: unit.code (unidade.uniCodigo)`);
      }
      if (!residue.treatment?.code) {
        errors.push(`Resíduo [${index}]: Campo obrigatório ausente: treatment.code (tratamento.traCodigo)`);
      }
      if (!residue.class?.code) {
        errors.push(`Resíduo [${index}]: Campo obrigatório ausente: class.code (classe.claCodigo)`);
      }
      if (residue.quantity == null || residue.quantity <= 0) {
        errors.push(`Resíduo [${index}]: Campo obrigatório ausente ou inválido: quantity (marQuantidade) deve ser > 0`);
      }
    });
  }

  if (payload.hasTemporaryStorage === true) {
    if (!payload.temporaryStorage?.partnerCode) {
      errors.push('Campo obrigatório ausente: temporaryStorage.partnerCode (quando hasTemporaryStorage=true)');
    }
    if (!payload.temporaryStorageCarrier?.partnerCode) {
      errors.push('Campo obrigatório ausente: temporaryStorageCarrier.partnerCode (quando hasTemporaryStorage=true)');
    }
  }

  if (errors.length > 0) {
    const error = new AppError(
      400,
      'Manifest Payload Validation Failed',
      `Payload do manifesto contém ${errors.length} erro(s):\n- ${errors.join('\n- ')}`
    );
    error.context = { validationErrors: errors };
    throw error;
  }
}

export function normalizeExpeditionDate(expeditionDate: string): string {
  if (!expeditionDate) {
    throw new AppError(400, 'Bad Request', 'expeditionDate é obrigatório');
  }

  const dateStr = expeditionDate.trim();

  // Se já contém 'T', assume que está no formato completo ISO
  if (dateStr.includes('T')) {
    return dateStr;
  }

  // Caso contrário, adiciona o timestamp padrão UTC-3 (03:00:00.000Z)
  return `${dateStr}T03:00:00.000Z`;
}
