import { validateHarGatewayStructure } from './har-gateway-structural-validator.js';

try {
  const report = validateHarGatewayStructure(process.cwd());

  console.log('[ok] Validação estrutural HAR→Gateway concluída com sucesso.');
  console.log(`- operações HAR validadas: ${report.har.totalValidated}`);
  console.log(`- seções do gateway validadas: ${report.gateway.totalSections}`);
  console.log(`- total de checks: ${report.totalChecks}`);
} catch (error) {
  console.error('[erro] Falha na validação estrutural HAR→Gateway');
  console.error(error);
  process.exitCode = 1;
}
