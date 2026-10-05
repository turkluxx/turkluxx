# Regenerate every icon from the transparent cutout of the attached image.
# Original attachment: 830390967_122115292029476085_470646479799901295_n.jpg (266 x 266).
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing
$projectRoot = Split-Path -Parent $PSScriptRoot
$iconDirectory = Join-Path $projectRoot 'img/favicon'
$sourcePath = Join-Path $iconDirectory 'master.png'
$sourceImage = [System.Drawing.Image]::FromFile($sourcePath)
function Resize-Icon([int] $size) {
    $bitmap = New-Object System.Drawing.Bitmap $size, $size
    $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
    $attributes = New-Object System.Drawing.Imaging.ImageAttributes
    try {
        $graphics.CompositingQuality = [System.Drawing.Drawing2D.CompositingQuality]::HighQuality
        $graphics.CompositingMode = [System.Drawing.Drawing2D.CompositingMode]::SourceCopy
        $graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
        $graphics.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
        $attributes.SetWrapMode([System.Drawing.Drawing2D.WrapMode]::TileFlipXY)
        $rectangle = New-Object System.Drawing.Rectangle 0, 0, $size, $size
        $graphics.DrawImage($sourceImage, $rectangle, 0, 0, $sourceImage.Width, $sourceImage.Height, [System.Drawing.GraphicsUnit]::Pixel, $attributes)
        return $bitmap
    } finally { $graphics.Dispose(); $attributes.Dispose() }
}
try {
    if ($sourceImage.Width -ne $sourceImage.Height) { throw 'The source must be square; do not stretch the emblem.' }
    $outputs = @{
        'favicon-16x16.png' = 16
        'favicon-32x32.png' = 32
        'apple-touch-icon.png' = 180
        'android-chrome-192x192.png' = 192
        'android-chrome-512x512.png' = 512
    }
    foreach ($file in $outputs.Keys) {
        $bitmap = Resize-Icon $outputs[$file]
        try { $bitmap.Save((Join-Path $iconDirectory $file), [System.Drawing.Imaging.ImageFormat]::Png) }
        finally { $bitmap.Dispose() }
    }
    # Standard ICO container with PNG-encoded 16, 32 and 48 pixel entries.
    $entries = @(foreach ($size in @(16, 32, 48)) {
        $bitmap = Resize-Icon $size
        $stream = New-Object System.IO.MemoryStream
        try {
            $bitmap.Save($stream, [System.Drawing.Imaging.ImageFormat]::Png)
            @{ Size = $size; Data = $stream.ToArray() }
        } finally { $bitmap.Dispose(); $stream.Dispose() }
    })
    $stream = [System.IO.File]::Create((Join-Path $projectRoot 'favicon.ico'))
    $writer = New-Object System.IO.BinaryWriter $stream
    try {
        $writer.Write([uint16]0); $writer.Write([uint16]1); $writer.Write([uint16]$entries.Count)
        $offset = 6 + 16 * $entries.Count
        foreach ($entry in $entries) {
            $writer.Write([byte]$entry.Size); $writer.Write([byte]$entry.Size)
            $writer.Write([byte]0); $writer.Write([byte]0)
            $writer.Write([uint16]1); $writer.Write([uint16]32)
            $writer.Write([uint32]$entry.Data.Length); $writer.Write([uint32]$offset)
            $offset += $entry.Data.Length
        }
        foreach ($entry in $entries) { $writer.Write([byte[]]$entry.Data) }
    } finally { $writer.Dispose() }
} finally { $sourceImage.Dispose() }
Write-Output 'Created five transparent PNG icons and favicon.ico from master.png.'
