# Anatomical UV mask authoring (Neutro body v1)

## Guided session (recommended)

```powershell
powershell -ExecutionPolicy Bypass -File tools/body-regions/open-torso-authoring.ps1
```

Non-expert guide: `docs/body-3d/TORSO_MASK_AUTHORING_GUIDE.md`

Blender panel: **N → NEUTRO → Anatomical Mask**

Addon: `tools/body-regions/blender/neutro_anatomical_mask_authoring.py`


## Blender

Do not hardcode personal paths in product code. Set locally:

```powershell
$env:BLENDER_EXE = "C:\Program Files\Blender Foundation\Blender 5.1\blender.exe"
# or tools/body-regions/.blender-path.local
```

Create / refresh the authoring scene:

```powershell
& $env:BLENDER_EXE --background --python tools/body-regions/create-mask-authoring-blend.py
```

Open:

`assets/blender/neutro-body/neutro_body_v1_anatomical_mask_authoring.blend`

Paint with:

- Texture Paint on the 3D viewport (not blind UV)
- Solid palette colors from `assets/body-regions/neutro_body_v1_region_palette.json`
- Constant falloff / no color mixing
- Save image to `assets/body-regions/neutro_body_v1_anatomical_regions_authoring.png`

## Quantize → runtime

```powershell
node tools/body-regions/quantize-anatomical-mask.mjs
```

Writes:

- `public/models/interaction/neutro_body_v1_anatomical_region_ids.png`
- `public/models/interaction/neutro_body_v1_anatomical_region_ids.json`
- bundled `src/widgets/body-3d/domain/generated/publicRegionMaskManifest.json`

## Gate torso evidence

```powershell
node tools/body-regions/render-manual-torso-gate.mjs
node tools/body-regions/audit-uv-seam-coherence.mjs
```

Artifacts under `artifacts/manual-anatomical-mask-gate-torso/` are local QA only — do not commit.

## Gate scope

Approve torso first (pectorals, full chest, abdomen, ribs L/R, upper/lower/full back).
Do not start limb gate until torso visual PASS.
