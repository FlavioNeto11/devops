import path from 'node:path';

export const cetesbEvidenceDir = path.resolve(process.cwd(), 'docs/cetesb');

export const requiredHarFiles = [
  'mtr.cetesb.sp.gov.br_login.har',
  'mtr.cetesb.sp.gov.br_gerar_mtr.har',
  'mtr.cetesb.sp.gov.br_imprimir_mtr.har',
  'mtr.cetesb.sp.gov.br_cancelar_mtr.har',
  'mtr.cetesb.sp.gov.br_criar_cadastro.har',
  'mtr.cetesb.sp.gov.br_recebimento_mtr.har',
  'mtr.cetesb.sp.gov.br_gerar_cdf_mtr.har',
  'mtr.cetesb.sp.gov.br_baixar_cdf_mtr.har'
];

export const cetesbEvidenceMapping = {
  'auth.login': 'mtr.cetesb.sp.gov.br_login.har',
  'manifest.submit': 'mtr.cetesb.sp.gov.br_gerar_mtr.har',
  'manifest.print': 'mtr.cetesb.sp.gov.br_imprimir_mtr.har',
  'manifest.cancel': 'mtr.cetesb.sp.gov.br_cancelar_mtr.har',
  'manifest.receive': 'mtr.cetesb.sp.gov.br_recebimento_mtr.har',
  'cdf.generate': 'mtr.cetesb.sp.gov.br_gerar_cdf_mtr.har',
  'cdf.download': 'mtr.cetesb.sp.gov.br_baixar_cdf_mtr.har',
  'cadastro.submit': 'mtr.cetesb.sp.gov.br_criar_cadastro.har'
};
