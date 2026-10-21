$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing
# Render the same vector geometry as meeting-app/assets/brand/icon.svg.
$sizes = @(256,128,64,48,32,16)
$images = @()
foreach ($size in $sizes) {
    $bitmap = New-Object System.Drawing.Bitmap($size,$size)
    $g = [System.Drawing.Graphics]::FromImage($bitmap)
    $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
    $g.ScaleTransform(($size/64.0),($size/64.0))
    $path = New-Object System.Drawing.Drawing2D.GraphicsPath
    $path.AddLine(6,19,21,4)
    $path.AddLine(21,4,38,4)
    $path.AddArc(16,4,44,44,270,180)
    $path.AddLine(38,48,21,48)
    $path.AddLine(21,48,21,60)
    $path.AddLine(21,60,6,60)
    $path.CloseFigure()
    foreach ($bar in @(@(22,26),@(32,19),@(42,12))) {
        $x=$bar[0]; $y=$bar[1]
        $path.StartFigure()
        $path.AddArc($x,$y,6,6,180,180)
        $path.AddArc($x,36,6,6,0,180)
        $path.CloseFigure()
    }
    $brush = New-Object System.Drawing.Drawing2D.LinearGradientBrush(
        ([System.Drawing.Point]::new(12,4)),([System.Drawing.Point]::new(45,60)),
        ([System.Drawing.ColorTranslator]::FromHtml('#00d2e9')),([System.Drawing.ColorTranslator]::FromHtml('#0860ff')))
    $blend = New-Object System.Drawing.Drawing2D.ColorBlend(3)
    $blend.Colors = @([System.Drawing.ColorTranslator]::FromHtml('#00d2e9'),[System.Drawing.ColorTranslator]::FromHtml('#00a9f5'),[System.Drawing.ColorTranslator]::FromHtml('#0860ff'))
    $blend.Positions = @(0.0,0.48,1.0)
    $brush.InterpolationColors = $blend
    $g.FillPath($brush,$path)
    $fold = New-Object System.Drawing.Drawing2D.GraphicsPath
    $fold.AddLine(21,5,21,17)
    $fold.AddArc(15,14,6,6,0,90)
    $fold.AddLine(18,20,7,20)
    $pen = New-Object System.Drawing.Pen([System.Drawing.ColorTranslator]::FromHtml('#087fe4'),2.5)
    $pen.StartCap = $pen.EndCap = [System.Drawing.Drawing2D.LineCap]::Round
    $g.DrawPath($pen,$fold)
    $stream = New-Object System.IO.MemoryStream
    $bitmap.Save($stream,[System.Drawing.Imaging.ImageFormat]::Png)
    $images += ,($stream.ToArray())
    $stream.Dispose(); $pen.Dispose(); $fold.Dispose(); $brush.Dispose(); $path.Dispose(); $g.Dispose(); $bitmap.Dispose()
}
$target = Join-Path $PSScriptRoot 'meeting-app/assets/brand/app.ico'
$file = [System.IO.File]::Create($target)
$writer = New-Object System.IO.BinaryWriter($file)
try {
    $writer.Write([uint16]0); $writer.Write([uint16]1); $writer.Write([uint16]$sizes.Count)
    $offset = 6 + 16*$sizes.Count
    for ($i=0; $i -lt $sizes.Count; $i++) {
        $dimension = if ($sizes[$i] -eq 256) {0} else {$sizes[$i]}
        $writer.Write([byte]$dimension); $writer.Write([byte]$dimension)
        $writer.Write([byte]0); $writer.Write([byte]0)
        $writer.Write([uint16]1); $writer.Write([uint16]32)
        $writer.Write([uint32]$images[$i].Length); $writer.Write([uint32]$offset)
        $offset += $images[$i].Length
    }
    foreach ($bytes in $images) {$writer.Write([byte[]]$bytes)}
} finally {$writer.Dispose(); $file.Dispose()}
Write-Host "Icon ready: $target"
