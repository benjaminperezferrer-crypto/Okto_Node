<#
  resize-icons.ps1
  Redimensiona en lote los PNG de iconos de estructuras/fosiles y los deja
  listos para usar en geo-symbols.js (sistema rasterIcon()).

  USO:
    1. Pone los PNG originales en una carpeta (por defecto: ..\..\..\Iconos,
       o pasa otra con -Origen). El nombre de archivo puede usar espacios o
       guion bajo - el script lo convierte a espacios automaticamente. Debe
       coincidir con el nombre de la estructura/fosil TAL COMO aparece en
       la app (con tildes), por ejemplo:  Zoophycos.png, "Cruziana.png"
    2. Corre este script.
    3. El script deja las versiones achicadas en esta misma carpeta y
       al final imprime 3 listas:
         - OK: listas para pegar en RASTER_ICON_NAMES tal cual.
         - SIN COINCIDENCIA: el nombre no corresponde a ningun boton real
           de la app - revisar antes de agregar (probable error de tipeo).
         - REEMPLAZA ICONO EXISTENTE: esa estructura ya tenia un dibujo
           hecho a mano; agregarla a RASTER_ICON_NAMES lo reemplaza por
           la foto. Solo agregarla si eso es lo que se quiere.
#>

param(
  [string]$Origen = (Join-Path $PSScriptRoot "..\..\..\Iconos"),
  [int]$LadoMax = 120
)

Add-Type -AssemblyName System.Drawing

$destino      = $PSScriptRoot
$viewerHtml   = Join-Path $PSScriptRoot "..\viewer.html"
$geoSymbolsJs = Join-Path $PSScriptRoot "..\geo-symbols.js"

# -- Nombres validos: los botones reales que ya existen en la app --
$viewerContent   = Get-Content -Raw -Path $viewerHtml -Encoding UTF8
$nombresValidos  = [regex]::Matches($viewerContent, "toggleStruct\('([^']+)'\)") |
                     ForEach-Object { $_.Groups[1].Value }
$setValidos = @{}
foreach ($n in $nombresValidos) { $setValidos[$n] = $true }

# -- Nombres que YA tienen un icono dibujado a mano (vectorial) --
$geoContent  = Get-Content -Raw -Path $geoSymbolsJs -Encoding UTF8
$inicioBloque = $geoContent.IndexOf("const STRUCT_ICONS = {")
$finBloque    = $geoContent.IndexOf("'_default'(x, y, w, h) {")
$bloqueIconos = $geoContent.Substring($inicioBloque, $finBloque - $inicioBloque)
$nombresConVector = [regex]::Matches($bloqueIconos, "(?m)^\s{4}'([^']+)'\(x, y, w, h\)") |
                      ForEach-Object { $_.Groups[1].Value }
$setConVector = @{}
foreach ($n in $nombresConVector) { $setConVector[$n] = $true }

$archivos = Get-ChildItem -Path $Origen -Filter *.png -File -ErrorAction Stop
if ($archivos.Count -eq 0) {
  Write-Output "No se encontraron archivos .png en $Origen"
  exit 0
}

$ok = @()
$sinCoincidencia = @()
$reemplaza = @()

foreach ($archivo in $archivos) {
  $nombreArchivo = [System.IO.Path]::GetFileNameWithoutExtension($archivo.Name)
  $nombre = $nombreArchivo -replace '_', ' '   # admite guion_bajo o "con espacios"

  $img = [System.Drawing.Image]::FromFile($archivo.FullName)
  if ($img.Width -ge $img.Height) {
    $nuevoAncho = $LadoMax
    $nuevoAlto  = [int]([math]::Round($img.Height * ($LadoMax / $img.Width)))
  } else {
    $nuevoAlto  = $LadoMax
    $nuevoAncho = [int]([math]::Round($img.Width * ($LadoMax / $img.Height)))
  }

  $bmp = New-Object System.Drawing.Bitmap $nuevoAncho, $nuevoAlto
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.InterpolationMode  = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
  $g.CompositingQuality = [System.Drawing.Drawing2D.CompositingQuality]::HighQuality
  $g.SmoothingMode      = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
  $g.DrawImage($img, 0, 0, $nuevoAncho, $nuevoAlto)
  $g.Dispose()
  $img.Dispose()

  $rutaDestino = Join-Path $destino ($nombre + ".png")
  $bmp.Save($rutaDestino, [System.Drawing.Imaging.ImageFormat]::Png)
  $bmp.Dispose()

  $pesoKB = [math]::Round((Get-Item $rutaDestino).Length / 1KB, 1)

  if (-not $setValidos.ContainsKey($nombre)) {
    Write-Output "SIN COINCIDENCIA   $nombre  ->  ${nuevoAncho}x${nuevoAlto}px, ${pesoKB} KB"
    $sinCoincidencia += $nombre
  } elseif ($setConVector.ContainsKey($nombre)) {
    Write-Output "REEMPLAZA ICONO    $nombre  ->  ${nuevoAncho}x${nuevoAlto}px, ${pesoKB} KB"
    $reemplaza += $nombre
  } else {
    Write-Output "OK                 $nombre  ->  ${nuevoAncho}x${nuevoAlto}px, ${pesoKB} KB"
    $ok += $nombre
  }
}

Write-Output ""
Write-Output "======================================================"
Write-Output "$($ok.Count) OK - listos para pegar en RASTER_ICON_NAMES:"
Write-Output "======================================================"
if ($ok.Count -gt 0) {
  Write-Output ("  " + (($ok | ForEach-Object { "'$_'" }) -join ", "))
} else {
  Write-Output "  (ninguno)"
}

if ($sinCoincidencia.Count -gt 0) {
  Write-Output ""
  Write-Output "======================================================"
  Write-Output "$($sinCoincidencia.Count) SIN COINCIDENCIA - no corresponden a ningun boton"
  Write-Output "de la app. Revisar el nombre del archivo (tildes,"
  Write-Output "mayusculas, o si esa estructura no existe todavia):"
  Write-Output "======================================================"
  $sinCoincidencia | ForEach-Object { Write-Output "  - $_" }
}

if ($reemplaza.Count -gt 0) {
  Write-Output ""
  Write-Output "======================================================"
  Write-Output "$($reemplaza.Count) YA TENIAN UN ICONO DIBUJADO A MANO - si los"
  Write-Output "agregas a RASTER_ICON_NAMES, la foto reemplaza al dibujo:"
  Write-Output "======================================================"
  $reemplaza | ForEach-Object { Write-Output "  - $_" }
}
