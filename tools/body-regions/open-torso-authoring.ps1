# Neutro — open guided torso anatomical mask authoring session.
# Usage:
#   powershell -ExecutionPolicy Bypass -File tools/body-regions/open-torso-authoring.ps1
#
# Optional:
#   -SmokeTest   Run background infrastructure smoke test instead of UI
#   -SetupOnly   Refresh blend (workspace/guides/addon) then exit

param(
  [switch]$SmokeTest,
  [switch]$SetupOnly
)

$ErrorActionPreference = "Stop"
$Root = Resolve-Path (Join-Path $PSScriptRoot "..\..")
Set-Location $Root

function Resolve-BlenderExe {
  if ($env:BLENDER_EXE -and (Test-Path $env:BLENDER_EXE)) {
    return $env:BLENDER_EXE
  }
  $local = Join-Path $PSScriptRoot ".blender-path.local"
  if (Test-Path $local) {
    $line = Get-Content $local | Where-Object { $_ -match "BLENDER_EXE=" } | Select-Object -First 1
    if ($line) {
      $path = ($line -split "=", 2)[1].Trim()
      if (Test-Path $path) { return $path }
    }
  }
  $candidates = @(
    "C:\Program Files\Blender Foundation\Blender 5.1\blender.exe",
    "C:\Program Files\Blender Foundation\Blender 5.0\blender.exe",
    "C:\Program Files\Blender Foundation\Blender 4.5\blender.exe",
    "C:\Program Files\Blender Foundation\Blender 4.4\blender.exe"
  )
  foreach ($c in $candidates) {
    if (Test-Path $c) { return $c }
  }
  $found = Get-ChildItem "C:\Program Files\Blender Foundation" -Recurse -Filter blender.exe -ErrorAction SilentlyContinue |
    Select-Object -First 1 -ExpandProperty FullName
  if ($found) { return $found }
  throw "Blender not found. Set `$env:BLENDER_EXE or tools/body-regions/.blender-path.local"
}

$Blender = Resolve-BlenderExe
$Blend = Join-Path $Root "assets\blender\neutro-body\neutro_body_v1_anatomical_mask_authoring.blend"
$Mask = Join-Path $Root "assets\body-regions\neutro_body_v1_anatomical_regions_authoring.png"
$BackupDir = Join-Path $Root "assets\body-regions\backups"
$SetupPy = Join-Path $Root "tools\body-regions\blender\setup_authoring_scene.py"
$SmokePy = Join-Path $Root "tools\body-regions\blender\smoke_test_authoring.py"
$AddonPy = Join-Path $Root "tools\body-regions\blender\neutro_anatomical_mask_authoring.py"

if (-not (Test-Path $Blend)) {
  throw "Authoring blend missing: $Blend`nRun create-mask-authoring-blend.py first."
}
if (-not (Test-Path $Mask)) {
  throw "Authoring mask missing: $Mask"
}
if (-not (Test-Path $AddonPy)) {
  throw "Addon missing: $AddonPy"
}

New-Item -ItemType Directory -Force -Path $BackupDir | Out-Null
$stamp = Get-Date -Format "yyyyMMdd_HHmmss"
$backup = Join-Path $BackupDir "neutro_body_v1_anatomical_regions_open_$stamp.png"
Copy-Item -Force $Mask $backup
$baseline = Join-Path $BackupDir "neutro_body_v1_anatomical_regions_before_manual_torso.png"
if (-not (Test-Path $baseline)) {
  Copy-Item -Force $Mask $baseline
}
Set-Content -Path (Join-Path $BackupDir "LAST_BACKUP.txt") -Value $backup -Encoding utf8

Write-Host "Blender: $Blender"
Write-Host "Blend:   $Blend"
Write-Host "Backup:  $backup"

if ($SmokeTest) {
  & $Blender --background "$Blend" --python "$SetupPy" 2>&1 | Out-Host
  & $Blender --background "$Blend" --python "$SmokePy" 2>&1 | Out-Host
  exit $LASTEXITCODE
}

if ($SetupOnly) {
  & $Blender --background "$Blend" --python "$SetupPy" 2>&1 | Out-Host
  exit $LASTEXITCODE
}

# Interactive session: setup then open UI with addon registered on launch
$boot = @"
import runpy
runpy.run_path(r'$($SetupPy.Replace('\','/'))', run_name='__main__')
"@
$bootFile = Join-Path $env:TEMP "neutro_boot_authoring.py"
Set-Content -Path $bootFile -Value $boot -Encoding utf8

Write-Host ""
Write-Host "Opening guided authoring session..."
Write-Host "Sidebar: N → NEUTRO → Anatomical Mask"
Write-Host "Start with: Pecho completo (already active)"
Write-Host ""

# Launch UI (setup runs first via --python-expr after load is tricky; use two-step)
& $Blender --background "$Blend" --python "$SetupPy" 2>&1 | Out-Host
if ($LASTEXITCODE -ne 0) {
  throw "Setup failed"
}

# Open interactive Blender with addon auto-register
$register = @"
import importlib.util, bpy
from pathlib import Path
addon = Path(r'$($AddonPy.Replace('\','/'))')
spec = importlib.util.spec_from_file_location('neutro_anatomical_mask_authoring', addon)
mod = importlib.util.module_from_spec(spec)
spec.loader.exec_module(mod)
try:
    mod.unregister()
except Exception:
    pass
mod.register()
bpy.ops.neutro.prepare_authoring_session()
print('NEUTRO_AUTHORING_READY')
"@
$regFile = Join-Path $env:TEMP "neutro_register_authoring.py"
Set-Content -Path $regFile -Value $register -Encoding utf8

Start-Process -FilePath $Blender -ArgumentList @("$Blend", "--python", "$regFile")
Write-Host "Blender UI launched."
Write-Host "Manual: docs/body-3d/TORSO_MASK_AUTHORING_GUIDE.md"
