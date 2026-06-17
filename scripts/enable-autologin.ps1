#requires -Version 7.0
<#
.SYNOPSIS
  Habilita o auto-login do Windows para a plataforma voltar sozinha após reboot
  DESACOMPANHADO (cria a sessão onde o Docker Desktop + watchdog rodam).
.DESCRIPTION
  Guarda a senha como **LSA secret criptografado** (DefaultPassword), o mesmo
  método do Sysinternals Autologon — NUNCA em texto puro no registro. A senha é
  pedida interativamente a VOCÊ (Read-Host) e nunca é logada/exibida.

  Rode VOCÊ MESMO num PowerShell 7 ELEVADO (o assistente não digita senhas):
    pwsh -NoProfile -ExecutionPolicy Bypass -File C:\devops\scripts\enable-autologin.ps1

  Para desfazer:  ...\enable-autologin.ps1 -Disable

  ⚠️ Trade-off: o servidor passa a iniciar numa sessão de admin logada. Avalie o
  acesso físico/RDP antes de habilitar.
.PARAMETER UserName
  Conta para auto-login (padrão: usuário atual).
.PARAMETER Domain
  Domínio/host da conta (padrão: nome do computador = conta local).
.PARAMETER Disable
  Desliga o auto-login e apaga a senha guardada no LSA.
#>
[CmdletBinding()]
param(
  [string]$UserName = $env:USERNAME,
  [string]$Domain = $env:COMPUTERNAME,
  [switch]$Disable
)
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$isAdmin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
if (-not $isAdmin) { throw "Rode em PowerShell 7 COMO ADMINISTRADOR." }

$winlogon = 'HKLM:\SOFTWARE\Microsoft\Windows NT\CurrentVersion\Winlogon'

if (-not ([System.Management.Automation.PSTypeName]'LsaUtil').Type) {
  Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
public static class LsaUtil {
  [StructLayout(LayoutKind.Sequential)] public struct LSA_UNICODE_STRING { public ushort Length; public ushort MaximumLength; public IntPtr Buffer; }
  [StructLayout(LayoutKind.Sequential)] public struct LSA_OBJECT_ATTRIBUTES { public int Length; public IntPtr RootDirectory; public IntPtr ObjectName; public uint Attributes; public IntPtr SecurityDescriptor; public IntPtr SecurityQualityOfService; }
  [DllImport("advapi32.dll", SetLastError=true)] public static extern uint LsaOpenPolicy(IntPtr SystemName, ref LSA_OBJECT_ATTRIBUTES ObjectAttributes, uint DesiredAccess, out IntPtr PolicyHandle);
  [DllImport("advapi32.dll", SetLastError=true)] public static extern uint LsaStorePrivateData(IntPtr PolicyHandle, ref LSA_UNICODE_STRING KeyName, IntPtr PrivateData);
  [DllImport("advapi32.dll")] public static extern uint LsaClose(IntPtr PolicyHandle);
  [DllImport("advapi32.dll")] public static extern int LsaNtStatusToWinError(uint status);
}
'@
}

function New-LsaString([string]$s) {
  $u = New-Object LsaUtil+LSA_UNICODE_STRING
  $u.Buffer = [System.Runtime.InteropServices.Marshal]::StringToHGlobalUni($s)
  $u.Length = [ushort]($s.Length * 2)
  $u.MaximumLength = [ushort]($s.Length * 2 + 2)
  return $u
}

# Grava (ou apaga, se $dataPtr = Zero) o secret do LSA sob a chave informada.
function Set-LsaSecret([string]$key, [IntPtr]$dataPtr) {
  $attr = New-Object LsaUtil+LSA_OBJECT_ATTRIBUTES
  $attr.Length = [System.Runtime.InteropServices.Marshal]::SizeOf($attr)
  $POLICY_ALL_ACCESS = 0x000F0FFF
  $h = [IntPtr]::Zero
  $st = [LsaUtil]::LsaOpenPolicy([IntPtr]::Zero, [ref]$attr, $POLICY_ALL_ACCESS, [ref]$h)
  if ($st -ne 0) { throw "LsaOpenPolicy falhou (win err $([LsaUtil]::LsaNtStatusToWinError($st)))" }
  try {
    $k = New-LsaString $key
    try {
      $st = [LsaUtil]::LsaStorePrivateData($h, [ref]$k, $dataPtr)
      if ($st -ne 0) { throw "LsaStorePrivateData falhou (win err $([LsaUtil]::LsaNtStatusToWinError($st)))" }
    } finally { [System.Runtime.InteropServices.Marshal]::FreeHGlobal($k.Buffer) }
  } finally { [void][LsaUtil]::LsaClose($h) }
}

if ($Disable) {
  Set-ItemProperty $winlogon -Name 'AutoAdminLogon' -Value '0'
  foreach ($n in 'DefaultUserName','DefaultDomainName','DefaultPassword') {
    if ($null -ne (Get-ItemProperty $winlogon -Name $n -ErrorAction SilentlyContinue).$n) { Remove-ItemProperty $winlogon -Name $n -ErrorAction SilentlyContinue }
  }
  Set-LsaSecret 'DefaultPassword' ([IntPtr]::Zero)   # apaga o secret
  Write-Host "[OK] Auto-login DESABILITADO e senha removida do LSA." -ForegroundColor Green
  return
}

Write-Host "Configurando auto-login para: $Domain\$UserName" -ForegroundColor Cyan
$sec = Read-Host -AsSecureString "Digite a senha de $Domain\$UserName (nao sera exibida)"
$bstr = [System.Runtime.InteropServices.Marshal]::SecureStringToBSTR($sec)
try {
  $plainPtr = [System.Runtime.InteropServices.Marshal]::StringToHGlobalUni([System.Runtime.InteropServices.Marshal]::PtrToStringBSTR($bstr))
  $len = [System.Runtime.InteropServices.Marshal]::PtrToStringBSTR($bstr).Length
  # Monta o LSA_UNICODE_STRING do segredo e grava
  $data = New-Object LsaUtil+LSA_UNICODE_STRING
  $data.Buffer = $plainPtr
  $data.Length = [ushort]($len * 2)
  $data.MaximumLength = [ushort]($len * 2 + 2)
  $dataNative = [System.Runtime.InteropServices.Marshal]::AllocHGlobal([System.Runtime.InteropServices.Marshal]::SizeOf($data))
  try {
    [System.Runtime.InteropServices.Marshal]::StructureToPtr($data, $dataNative, $false)
    Set-LsaSecret 'DefaultPassword' $dataNative
  } finally {
    [System.Runtime.InteropServices.Marshal]::FreeHGlobal($dataNative)
    [System.Runtime.InteropServices.Marshal]::ZeroFreeGlobalAllocUnicode($plainPtr)
  }
} finally {
  [System.Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bstr)
}

# Flags do Winlogon (NAO sao segredos). Remove qualquer DefaultPassword em texto puro.
Set-ItemProperty $winlogon -Name 'AutoAdminLogon' -Value '1'
Set-ItemProperty $winlogon -Name 'DefaultUserName' -Value $UserName
Set-ItemProperty $winlogon -Name 'DefaultDomainName' -Value $Domain
if ($null -ne (Get-ItemProperty $winlogon -Name 'DefaultPassword' -ErrorAction SilentlyContinue).DefaultPassword) {
  Remove-ItemProperty $winlogon -Name 'DefaultPassword' -ErrorAction SilentlyContinue
}

Write-Host "[OK] Auto-login HABILITADO para $Domain\$UserName (senha no LSA, criptografada)." -ForegroundColor Green
Write-Host "     AutoAdminLogon=$((Get-ItemProperty $winlogon -Name AutoAdminLogon).AutoAdminLogon)  DefaultUserName=$((Get-ItemProperty $winlogon -Name DefaultUserName).DefaultUserName)"
Write-Host "     Teste com um reboot num horario tranquilo. Reverter: enable-autologin.ps1 -Disable"
