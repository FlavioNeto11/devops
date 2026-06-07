param(
  [string]$HostName = 'mtrr.cetesb.sp.gov.br',
  [int]$Port = 443,
  [string]$OutputPath = '.\certs\cetesb-chain.pem'
)

$ErrorActionPreference = 'Stop'

$resolvedOutput = Resolve-Path -LiteralPath (Split-Path -Parent $OutputPath) -ErrorAction SilentlyContinue
if (-not $resolvedOutput) {
  New-Item -ItemType Directory -Force -Path (Split-Path -Parent $OutputPath) | Out-Null
}

$tcp = [System.Net.Sockets.TcpClient]::new($HostName, $Port)
$ssl = $null

try {
  $ssl = [System.Net.Security.SslStream]::new($tcp.GetStream(), $false, ({ $true }))
  $ssl.AuthenticateAsClient($HostName)

  $leaf = [System.Security.Cryptography.X509Certificates.X509Certificate2]::new($ssl.RemoteCertificate)
  $chain = [System.Security.Cryptography.X509Certificates.X509Chain]::new()
  $chain.ChainPolicy.RevocationMode = [System.Security.Cryptography.X509Certificates.X509RevocationMode]::NoCheck
  $null = $chain.Build($leaf)

  Set-Content -Path $OutputPath -Value '' -Encoding Ascii

  foreach ($element in $chain.ChainElements) {
    $bytes = $element.Certificate.Export([System.Security.Cryptography.X509Certificates.X509ContentType]::Cert)
    $base64 = [Convert]::ToBase64String($bytes)

    Add-Content -Path $OutputPath -Value '-----BEGIN CERTIFICATE-----' -Encoding Ascii
    ($base64 -split '(.{1,64})' | Where-Object { $_ }) | ForEach-Object {
      Add-Content -Path $OutputPath -Value $_ -Encoding Ascii
    }
    Add-Content -Path $OutputPath -Value '-----END CERTIFICATE-----' -Encoding Ascii
    Add-Content -Path $OutputPath -Value '' -Encoding Ascii
  }

  Write-Host "Bundle gerado em: $OutputPath"
  Write-Host "Certificados na cadeia: $($chain.ChainElements.Count)"
}
finally {
  if ($ssl) { $ssl.Dispose() }
  $tcp.Dispose()
}
