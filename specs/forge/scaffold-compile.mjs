// =============================================================================
// scaffold-compile.mjs — ponte scaffold -> COMPILADOR do contrato (Forja 4.0 B6).
// -----------------------------------------------------------------------------
// Os scaffolds da Forja (scaffold-gymops/scaffold-sicat/scaffold-frontend) emitem
// devops.yaml **v2** e delegam a geração de apps/<app>/k8s/<app>.yaml ao renderizador
// ÚNICO specs/tools/devops-compile.mjs (chart templates/app-template + invariantes
// HARD). O k8s compilado é artefato DERIVADO (nunca editado à mão), então recompilar
// é sempre seguro/idempotente — por isso não há flag de skip aqui.
//
// Retrocompat: se o devops.yaml no disco for v1 (produto legado re-scaffoldado),
// o compile é PULADO com aviso e o k8s/ existente é mantido intacto.
// =============================================================================
import fs from 'node:fs';
import path from 'node:path';

export async function compileForScaffold({ appDir, app, tag = '[scaffold]' }) {
  const contractPath = path.join(appDir, 'devops.yaml');
  if (!fs.existsSync(contractPath)) {
    console.warn(`${tag} sem devops.yaml em ${appDir} — compile pulado.`);
    return null;
  }
  let compiler;
  try {
    compiler = await import('../tools/devops-compile.mjs');
  } catch (e) {
    console.error(`${tag} ERRO: não foi possível carregar specs/tools/devops-compile.mjs (${e && e.message}).`);
    console.error(`${tag} Instale as deps do tooling:  cd specs/tools && npm ci`);
    process.exit(3);
  }
  const { parseContract, contractVersion, compileContract, helmAvailable } = compiler;
  const contract = parseContract(fs.readFileSync(contractPath, 'utf8'));
  if (contractVersion(contract) !== 2) {
    console.warn(`${tag} devops.yaml é contrato v1 (legado) — compile PULADO; k8s/ existente mantido. Converta para v2 (docs/new-project-contract.md §11.5) para entrar no compilador.`);
    return null;
  }
  if (!helmAvailable()) {
    console.error(`${tag} ERRO: helm não encontrado no PATH — o k8s do contrato v2 é compilado pelo chart.`);
    console.error(`${tag} PowerShell: $env:Path = [Environment]::GetEnvironmentVariable('Path','Machine') + ';' + [Environment]::GetEnvironmentVariable('Path','User')`);
    process.exit(3);
  }
  const { manifests, version } = compileContract(contractPath);
  const outPath = path.join(appDir, 'k8s', `${contract.app.name}.yaml`);
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, manifests, 'utf8');
  console.log(`${tag} contrato v${version} compilado -> ${outPath} (renderizador único devops-compile.mjs)`);
  return outPath;
}
