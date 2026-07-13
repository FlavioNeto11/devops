# Deploy do contrato TitleRegistry no no Besu do BESC (Fase 3) e armacao do BesuAdapter.
# So rodar APOS o gate regulatorio (docs/evolution/10). Ate la, o besc-api opera em
# LEDGER_ADAPTER=simulated (off-chain e a fonte da verdade). Idempotente na parte de deploy
# (gera um endereco novo a cada run; guarde o endereco retornado).
#
# Uso:
#   $env:BESU_DEV_PRIVATE_KEY = '0x...'              # chave dev pre-fundeada do --network=dev
#   scripts\besu-deploy-contract.ps1
#   scripts\besu-deploy-contract.ps1 -PrivateKey 0x... -RpcUrl http://localhost:18545
#
# A chave NAO fica mais hardcoded aqui (mesmo a dev key publica do Besu dispara o
# secret-scan e normaliza maus habitos). Para o no --network=dev, use a "dev key"
# pre-fundeada documentada no proprio Besu (docs "Developer mode"). Producao: HSM/KMS.
# Depois: seale a chave/endereco no Secret besc-config e ligue LEDGER_ADAPTER=besu.
[CmdletBinding()]
param(
  [string]$RpcUrl = "http://localhost:18545",
  # sem default no codigo: vem do parametro ou de $env:BESU_DEV_PRIVATE_KEY (fail-fast abaixo)
  [string]$PrivateKey = $env:BESU_DEV_PRIVATE_KEY
)
$ErrorActionPreference = "Stop"
if (-not $PrivateKey) {
  throw "Informe a chave: -PrivateKey 0x... ou `$env:BESU_DEV_PRIVATE_KEY. Para o no local --network=dev, use a dev key pre-fundeada documentada no Besu (Developer mode)."
}
$env:Path = [Environment]::GetEnvironmentVariable('Path','Machine') + ';' + [Environment]::GetEnvironmentVariable('Path','User')

Write-Host "== port-forward para o no Besu (svc/besc-besu:8545 -> ${RpcUrl}) =="
$pf = Start-Process kubectl -ArgumentList "port-forward","svc/besc-besu","18545:8545","-n","apps" -PassThru -WindowStyle Hidden
Start-Sleep -Seconds 4
try {
  Write-Host "== deploy do TitleRegistry via ethers (dentro do container besc-api) =="
  $pod = kubectl get pod -n apps -l app.kubernetes.io/name=besc-api -o jsonpath='{.items[0].metadata.name}'
  # roda o deploy a partir do proprio codigo do adapter (ethers + artefato ja na imagem)
  $script = @"
import('/app/src/ledger/besu.js').then(async ({ BesuAdapter }) => {
  const addr = await BesuAdapter.deploy({ rpcUrl: process.env.RPC, privateKey: process.env.PK });
  console.log('CONTRACT_ADDRESS=' + addr);
}).catch(e => { console.error(e.message); process.exit(1); });
"@
  $out = kubectl exec -n apps $pod -- env RPC="http://besc-besu:8545" PK="$PrivateKey" node --input-type=module -e $script
  Write-Host $out
  $addr = ($out | Select-String 'CONTRACT_ADDRESS=(.+)').Matches.Groups[1].Value
  if (-not $addr) { throw "deploy nao retornou endereco" }
  Write-Host ""
  Write-Host "== Contrato implantado: $addr =="
  Write-Host "Proximos passos (apos o gate regulatorio):"
  Write-Host "  1) selar no Secret besc-config: BESU_PRIVATE_KEY, BESU_CONTRACT_ADDRESS=$addr"
  Write-Host "     kubectl create secret generic besc-config ... --from-literal=BESU_CONTRACT_ADDRESS=$addr | kubeseal ... > apps/besc/k8s/sealed-besc-config.yaml"
  Write-Host "  2) ligar LEDGER_ADAPTER=besu no apps/besc/k8s/besc.yaml e commitar"
} finally {
  if ($pf) { Stop-Process -Id $pf.Id -Force -ErrorAction SilentlyContinue }
}
