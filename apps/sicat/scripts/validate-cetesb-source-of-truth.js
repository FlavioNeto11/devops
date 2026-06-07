import fs from 'node:fs';
import path from 'node:path';
import { cetesbEvidenceDir, requiredHarFiles } from '../src/lib/cetesb-source-of-truth.ts';

function ensure(condition, message) {
  if (!condition) throw new Error(message);
}

function assertFilesExist() {
  ensure(fs.existsSync(cetesbEvidenceDir), `Pasta de evidências não encontrada: ${cetesbEvidenceDir}`);

  for (const harFile of requiredHarFiles) {
    const harPath = path.join(cetesbEvidenceDir, harFile);
    ensure(fs.existsSync(harPath), `HAR obrigatório ausente: ${harPath}`);
  }
}

function assertReferences() {
  const root = process.cwd();
  const filesThatMustReferenceDocsCetesb = [
    '.github/copilot-instructions.md',
    '.github/instructions/gateway-cetesb.instructions.md',
    '.vscode/settings.json',
    'certs/README.md',
    'docs/copilot/07-integracao-cetesb.md',
    'examples/README.md',
    'openapi/mtr_automacao_openapi_interna.yaml',
    'storage/README.md',
    'tests/README.md'
  ];

  for (const relPath of filesThatMustReferenceDocsCetesb) {
    const absPath = path.resolve(root, relPath);
    ensure(fs.existsSync(absPath), `Arquivo obrigatório ausente: ${relPath}`);
    const content = fs.readFileSync(absPath, 'utf8');
    ensure(
      content.includes('docs/cetesb'),
      `Arquivo sem referência a docs/cetesb: ${relPath}`
    );
  }
}

try {
  assertFilesExist();
  assertReferences();
  console.log('[ok] Política de fonte da verdade CETESB validada com sucesso.');
} catch (error) {
  console.error('[erro] Falha na validação de fonte da verdade CETESB');
  console.error(error);
  process.exitCode = 1;
}
