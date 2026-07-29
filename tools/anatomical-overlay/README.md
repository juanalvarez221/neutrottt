# Anatomical highlight overlay pipeline

Authority for **visual** torso regions: curated 3D control points in
`assets/body-regions/neutro_body_v1_anatomical_boundaries.json`.

## Reproduce

```bash
node tools/anatomical-overlay/probe-landmarks.mjs
node tools/anatomical-overlay/bake-highlight.mjs
node tools/anatomical-overlay/render-gate1.mjs
```

Optional denser overlay:

```bash
# PowerShell
$env:OVERLAY_SUBDIV="2"; node tools/anatomical-overlay/bake-highlight.mjs
```

## Outputs

- `public/models/interaction/neutro_body_v1_anatomical_highlight.glb`
- `artifacts/anatomical-highlight-gate-1/*.png`
- `assets/body-regions/neutro_body_v1_landmarks.json`

## Blender authoring (optional)

If Blender is installed:

```bash
blender --background --python tools/anatomical-overlay/create-authoring-blend.py
```

Creates `assets/blender/neutro-body/neutro_body_v1_anatomical_regions_authoring.blend`.
Edit Bezier control points there, sync back into the boundaries JSON, then rebake.
