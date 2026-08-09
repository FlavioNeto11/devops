import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Âncora no ARQUIVO, nunca em `process.cwd()`: `docs/` mora na RAIZ do app
// (`apps/sicat/docs`), enquanto `src/`, `tests/`, `openapi/` e `storage/` moram em
// `apps/sicat/backend/`. Como a suíte roda com cwd = `backend/`, o antigo
// `path.resolve(process.cwd(), 'docs/cetesb')` apontava para `backend/docs/cetesb`,
// que nunca existiu — nenhum cwd único resolve as duas árvores.
const currentDir = path.dirname(fileURLToPath(import.meta.url)); // backend/src/lib
const backendRoot = path.resolve(currentDir, '..', '..'); // backend
const appRoot = path.resolve(backendRoot, '..'); // apps/sicat

export const cetesbEvidenceDir = path.resolve(appRoot, 'docs/cetesb');

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
