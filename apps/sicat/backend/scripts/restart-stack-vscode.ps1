param(
    [string]$WorkspaceRoot = "c:\GIT\PADILHA\sicat"
)

$ErrorActionPreference = 'SilentlyContinue'

Write-Host "[restart] stopping existing API/worker/frontend processes..."

$workspaceNormalized = $WorkspaceRoot.ToLowerInvariant()

$nodeProcesses = Get-CimInstance Win32_Process -Filter "Name = 'node.exe'"
foreach ($proc in $nodeProcesses) {
    $cmd = [string]$proc.CommandLine
    if (-not $cmd) { continue }

    $cmdLower = $cmd.ToLowerInvariant()
    $isWorkspaceProc = $cmdLower.Contains($workspaceNormalized)
    $isTargetProc =
    $cmdLower.Contains('src\\server.js') -or
    $cmdLower.Contains('src\\server.ts') -or
    $cmdLower.Contains('src\\worker.js') -or
    $cmdLower.Contains('src\\worker.ts') -or
    $cmdLower.Contains('npm run worker') -or
    $cmdLower.Contains('npm run start') -or
    $cmdLower.Contains('vite') -or
    $cmdLower.Contains('npm run dev')

    if ($isWorkspaceProc -and $isTargetProc) {
        Stop-Process -Id $proc.ProcessId -Force
        Write-Host "[restart] stopped PID $($proc.ProcessId): $cmd"
    }
}

$portsToClear = @(8080, 5174)
foreach ($port in $portsToClear) {
    $connections = Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue
    if (-not $connections) { continue }
    foreach ($connection in $connections) {
        Stop-Process -Id $connection.OwningProcess -Force
        Write-Host "[restart] cleared port $port (PID $($connection.OwningProcess))"
    }
}

Set-Location $WorkspaceRoot

Write-Host "[restart] ensuring postgres is up..."
docker compose up -d postgres | Out-Null

Write-Host "[restart] stop phase completed."
Write-Host "[restart] now run the VS Code task: stack: restart (real + frontend)"
