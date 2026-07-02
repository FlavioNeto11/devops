# Gera os ícones PWA do ZapBridge (balão de chat verde com 3 pontos).
# Usa System.Drawing — roda no Windows PowerShell, sem dependências externas.
Add-Type -AssemblyName System.Drawing

$OutDir = Join-Path $PSScriptRoot '..\public\icons'
New-Item -ItemType Directory -Force $OutDir | Out-Null

$green = [System.Drawing.Color]::FromArgb(255, 0, 168, 132)   # #00a884
$white = [System.Drawing.Color]::White

function Get-RoundedPath([single]$x, [single]$y, [single]$w, [single]$h, [single]$r) {
  $p = New-Object System.Drawing.Drawing2D.GraphicsPath
  $d = $r * 2
  $p.AddArc($x, $y, $d, $d, 180, 90)
  $p.AddArc($x + $w - $d, $y, $d, $d, 270, 90)
  $p.AddArc($x + $w - $d, $y + $h - $d, $d, $d, 0, 90)
  $p.AddArc($x, $y + $h - $d, $d, $d, 90, 90)
  $p.CloseFigure()
  return $p
}

function New-Icon([int]$size, [bool]$maskable, [string]$path) {
  $bmp = New-Object System.Drawing.Bitmap($size, $size)
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
  $greenBrush = New-Object System.Drawing.SolidBrush($green)
  $whiteBrush = New-Object System.Drawing.SolidBrush($white)

  # Fundo
  if ($maskable) {
    $g.Clear($green)
  } else {
    $g.Clear([System.Drawing.Color]::Transparent)
    $bg = Get-RoundedPath 0 0 $size $size ([single]($size * 0.22))
    $g.FillPath($greenBrush, $bg)
    $bg.Dispose()
  }

  # Balão branco
  $scale = if ($maskable) { 0.5 } else { 0.62 }
  $bw = [single]($size * $scale)
  $bh = [single]($bw * 0.86)
  $bx = [single](($size - $bw) / 2)
  $by = [single](($size - $bh) / 2 - $size * 0.02)
  $bubble = Get-RoundedPath $bx $by $bw $bh ([single]($bw * 0.26))
  $g.FillPath($whiteBrush, $bubble)
  $bubble.Dispose()

  # Cauda (triângulo)
  $tail = New-Object System.Drawing.Drawing2D.GraphicsPath
  $pts = @(
    (New-Object System.Drawing.PointF([single]($bx + $bw * 0.20), [single]($by + $bh * 0.90))),
    (New-Object System.Drawing.PointF([single]($bx + $bw * 0.02), [single]($by + $bh * 1.22))),
    (New-Object System.Drawing.PointF([single]($bx + $bw * 0.42), [single]($by + $bh * 0.99)))
  )
  $tail.AddPolygon([System.Drawing.PointF[]]$pts)
  $g.FillPath($whiteBrush, $tail)
  $tail.Dispose()

  # 3 pontos verdes
  $cx = $bx + $bw / 2
  $cy = $by + $bh * 0.46
  $dotR = [single]($bw * 0.075)
  foreach ($i in -1, 0, 1) {
    $dx = $cx + $i * $bw * 0.24
    $g.FillEllipse($greenBrush, [single]($dx - $dotR), [single]($cy - $dotR), [single]($dotR * 2), [single]($dotR * 2))
  }

  $bmp.Save($path, [System.Drawing.Imaging.ImageFormat]::Png)
  $g.Dispose(); $bmp.Dispose(); $greenBrush.Dispose(); $whiteBrush.Dispose()
  Write-Host "  $([System.IO.Path]::GetFileName($path)) ($size px)"
}

Write-Host "Gerando ícones em $OutDir :"
New-Icon 192 $false (Join-Path $OutDir 'icon-192.png')
New-Icon 512 $false (Join-Path $OutDir 'icon-512.png')
New-Icon 512 $true  (Join-Path $OutDir 'icon-maskable-512.png')
New-Icon 180 $true  (Join-Path $OutDir 'apple-touch-icon.png')
Write-Host "OK"
