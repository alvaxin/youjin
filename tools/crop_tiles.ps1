Add-Type -AssemblyName System.Drawing

$source = 'C:\Users\xinj\AppData\Local\Temp\codex-clipboard-59bfddba-7c44-423d-931d-5aaaaed5f1f6.jpg'
$output = Join-Path $PSScriptRoot '..\assets\tiles'
$outputWidth = 72
$outputHeight = 104
New-Item -ItemType Directory -Force -Path $output | Out-Null

$image = [System.Drawing.Bitmap]::FromFile($source)
function Save-Tile([int]$column, [int]$y, [int]$height, [string]$name) {
  $x = 60 + $column * 74
  $sourceRect = [System.Drawing.Rectangle]::new($x, $y, 72, $height)
  $crop = $image.Clone($sourceRect, $image.PixelFormat)
  $tile = [System.Drawing.Bitmap]::new($outputWidth, $outputHeight)
  $graphics = [System.Drawing.Graphics]::FromImage($tile)
  try {
    $graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $graphics.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
    $graphics.CompositingQuality = [System.Drawing.Drawing2D.CompositingQuality]::HighQuality
    $graphics.DrawImage($crop, [System.Drawing.Rectangle]::new(0, 0, $outputWidth, $outputHeight))
    $tile.Save((Join-Path $output "$name.png"), [System.Drawing.Imaging.ImageFormat]::Png)
  }
  finally {
    $graphics.Dispose()
    $crop.Dispose()
    $tile.Dispose()
  }
}

# The reference photo uses taller flower and honor rows. Every crop is resampled
# to the same output canvas so all tiles render at an identical size in-game.
1..9 | ForEach-Object { Save-Tile ($_ - 1) 219 105 "B$_" }
1..9 | ForEach-Object { Save-Tile ($_ - 1) 326 105 "W$_" }
1..9 | ForEach-Object { Save-Tile ($_ - 1) 433 105 "T$_" }

@('H5', 'H7', 'H8', 'H6', 'H1', 'H2', 'H3', 'H4') | ForEach-Object -Begin { $i = 0 } -Process { Save-Tile $i 540 115 $_; $i++ }
@('E', 'S', 'X', 'N', 'Z', 'F', 'P') | ForEach-Object -Begin { $i = 0 } -Process { Save-Tile $i 657 120 $_; $i++ }

$image.Dispose()
