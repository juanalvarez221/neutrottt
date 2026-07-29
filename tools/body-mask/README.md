# Body Mask Pipeline

Fuente anatomica unica: `assets/body-regions/neutro_body_v1_anatomical_regions.json`

Genera:
1. UV Region ID mask PNG
2. Manifest JSON (+ bundled TS copy)
3. Adjacency graph
4. Atlas QA en artifacts/body-public-region-atlas-v2/

```bash
node tools/body-mask/bake-region-mask.mjs
node tools/body-mask/render-atlas.mjs
node tools/body-mask/audit-uv-mask.mjs
```

Editar control points en el JSON anatomico y regenerar. El highlight visual NO depende de face IDs.
