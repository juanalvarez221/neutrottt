"""
Bake PublicBaseBodyRegionId → UV region ID mask (lossless PNG).

Authority for VISUAL highlight borders (not face triangles).

Run:
  blender --background --python tools/blender/public_regions/bake_uv_region_mask.py
"""

from __future__ import annotations

import json
import math
import sys
from collections import defaultdict
from pathlib import Path

import bpy
import bmesh
from mathutils import Vector

REPO = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from generate_neutro_body_v1_public_regions_v2 import bake_source  # noqa: E402
from neutro_body_interaction.public_region_partition import (  # noqa: E402
    PUBLIC_BASE_SELECTABLE,
    ROUTING_ONLY_BASE,
    NON_SELECTABLE_BASE,
    partition_public_regions,
)
from public_regions.breast_landmarks import find_breast_side_landmarks  # noqa: E402
from public_regions.breast_field import (  # noqa: E402
    build_breast_field,
    contour_control_points,
    mirror_field_x,
)

SOURCE = REPO / "assets/blender/neutro-body/neutro_body_v1_complete_source.blend"
FACE_MASKS = REPO / "assets/body-regions/neutro_body_v1_public_region_faces.json"
ANATOMY_JSON = REPO / "assets/body-regions/neutro_body_v1_anatomical_regions.json"
OUT_PNG = REPO / "public/models/interaction/neutro_body_v1_public_region_mask.png"
OUT_MANIFEST = REPO / "public/models/interaction/neutro_body_v1_public_region_mask.json"
OUT_PREVIEW = REPO / "artifacts/body-public-region-atlas-v2/uv-mask-preview.png"
RES = 2048

# Stable mask indices (0 = non selectable / empty)
REGION_ORDER = (
    "NON_SELECTABLE",
    *PUBLIC_BASE_SELECTABLE,
    *ROUTING_ONLY_BASE,
)


def log(msg: str) -> None:
    print(f"[uv-mask] {msg}", flush=True)


def region_index_map() -> dict[str, int]:
    return {name: i for i, name in enumerate(REGION_ORDER)}


def barycentric(px, py, ax, ay, bx, by, cx, cy):
    v0x, v0y = bx - ax, by - ay
    v1x, v1y = cx - ax, cy - ay
    v2x, v2y = px - ax, py - ay
    den = v0x * v1y - v1x * v0y
    if abs(den) < 1e-12:
        return -1.0, -1.0, -1.0
    v = (v2x * v1y - v1x * v2y) / den
    w = (v0x * v2y - v2x * v0y) / den
    u = 1.0 - v - w
    return u, v, w


def rasterize_tri(buf, w, h, uv0, uv1, uv2, value: int):
    """Fill UV triangle into R buffer (ints)."""
    pts = [(uv0[0] * (w - 1), (1.0 - uv0[1]) * (h - 1)),
           (uv1[0] * (w - 1), (1.0 - uv1[1]) * (h - 1)),
           (uv2[0] * (w - 1), (1.0 - uv2[1]) * (h - 1))]
    xs = [p[0] for p in pts]
    ys = [p[1] for p in pts]
    minx = max(0, int(math.floor(min(xs))))
    maxx = min(w - 1, int(math.ceil(max(xs))))
    miny = max(0, int(math.floor(min(ys))))
    maxy = min(h - 1, int(math.ceil(max(ys))))
    ax, ay = pts[0]
    bx, by = pts[1]
    cx, cy = pts[2]
    for y in range(miny, maxy + 1):
        row = y * w
        for x in range(minx, maxx + 1):
            u, v, ww = barycentric(x + 0.5, y + 0.5, ax, ay, bx, by, cx, cy)
            if u >= -1e-4 and v >= -1e-4 and ww >= -1e-4:
                buf[row + x] = value


def rasterize_tri_world_classify(
    buf,
    w,
    h,
    uv0,
    uv1,
    uv2,
    p0: Vector,
    p1: Vector,
    p2: Vector,
    default_val: int,
    classify_fn,
):
    """
    Rasterize UV triangle; each texel classified by world position (smooth borders).
    classify_fn(world_pos, default_val) -> int mask index
    """
    pts = [(uv0[0] * (w - 1), (1.0 - uv0[1]) * (h - 1)),
           (uv1[0] * (w - 1), (1.0 - uv1[1]) * (h - 1)),
           (uv2[0] * (w - 1), (1.0 - uv2[1]) * (h - 1))]
    xs = [p[0] for p in pts]
    ys = [p[1] for p in pts]
    minx = max(0, int(math.floor(min(xs))))
    maxx = min(w - 1, int(math.ceil(max(xs))))
    miny = max(0, int(math.floor(min(ys))))
    maxy = min(h - 1, int(math.ceil(max(ys))))
    ax, ay = pts[0]
    bx, by = pts[1]
    cx, cy = pts[2]
    for y in range(miny, maxy + 1):
        row = y * w
        for x in range(minx, maxx + 1):
            u, v, ww = barycentric(x + 0.5, y + 0.5, ax, ay, bx, by, cx, cy)
            if u < -1e-4 or v < -1e-4 or ww < -1e-4:
                continue
            world = p0 * u + p1 * v + p2 * ww
            buf[row + x] = classify_fn(world, default_val)


def dilate_ids(buf, w, h, passes=1):
    """Fill empty (0) texels from neighboring non-zero to close UV seams."""
    for _ in range(passes):
        nxt = buf[:]
        for y in range(h):
            for x in range(w):
                i = y * w + x
                if buf[i] != 0:
                    continue
                votes = defaultdict(int)
                for dy in (-1, 0, 1):
                    for dx in (-1, 0, 1):
                        if dx == 0 and dy == 0:
                            continue
                        nx, ny = x + dx, y + dy
                        if nx < 0 or ny < 0 or nx >= w or ny >= h:
                            continue
                        v = buf[ny * w + nx]
                        if v:
                            votes[v] += 1
                if votes:
                    nxt[i] = max(votes.items(), key=lambda kv: kv[1])[0]
        buf[:] = nxt


def smooth_boundary(buf, w, h, region_ids: set[int], passes=2):
    """Majority filter on boundary of selected regions (reduces stair-steps)."""
    for _ in range(passes):
        nxt = buf[:]
        for y in range(1, h - 1):
            for x in range(1, w - 1):
                i = y * w + x
                cur = buf[i]
                if cur not in region_ids and cur != 0:
                    # still smooth if neighbor is curated torso
                    pass
                votes = defaultdict(int)
                for dy in (-1, 0, 1):
                    for dx in (-1, 0, 1):
                        votes[buf[(y + dy) * w + (x + dx)]] += 1
                best = max(votes.items(), key=lambda kv: kv[1])[0]
                # Only flip if current is minority on torso-critical set
                if cur in region_ids or best in region_ids:
                    if votes[cur] <= 3 and best != cur:
                        nxt[i] = best
        buf[:] = nxt


def face_uv_coords(mesh, poly, uv_layer):
    """Return list of (u,v) per loop vertex for polygon."""
    uvs = []
    for li in poly.loop_indices:
        uv = uv_layer.data[li].uv
        uvs.append((float(uv.x), float(uv.y)))
    return uvs


def world_to_uv_nearest(mesh, mw, uv_layer, point: Vector) -> tuple[float, float] | None:
    """Approximate: nearest vertex UV to world point."""
    best = None
    best_d = 1e18
    # Build vertex → one UV (first loop)
    v_uv = {}
    for poly in mesh.polygons:
        for li, vi in zip(poly.loop_indices, poly.vertices):
            if vi not in v_uv:
                uv = uv_layer.data[li].uv
                v_uv[vi] = (float(uv.x), float(uv.y))
    for vi, uv in v_uv.items():
        d = (mw @ mesh.vertices[vi].co - point).length_squared
        if d < best_d:
            best_d = d
            best = uv
    return best


def fill_polygon_uv(buf, w, h, poly_uv: list[tuple[float, float]], value: int):
    """Scanline fill polygon in UV (simple y-bucket)."""
    if len(poly_uv) < 3:
        return
    pts = [(u * (w - 1), (1.0 - v) * (h - 1)) for u, v in poly_uv]
    miny = max(0, int(math.floor(min(p[1] for p in pts))))
    maxy = min(h - 1, int(math.ceil(max(p[1] for p in pts))))
    n = len(pts)
    for y in range(miny, maxy + 1):
        ys = y + 0.5
        xs = []
        for i in range(n):
            x0, y0 = pts[i]
            x1, y1 = pts[(i + 1) % n]
            if (y0 <= ys < y1) or (y1 <= ys < y0):
                t = (ys - y0) / (y1 - y0 + 1e-12)
                xs.append(x0 + t * (x1 - x0))
        xs.sort()
        for i in range(0, len(xs) - 1, 2):
            x_start = max(0, int(math.floor(xs[i])))
            x_end = min(w - 1, int(math.ceil(xs[i + 1])))
            row = y * w
            for x in range(x_start, x_end + 1):
                buf[row + x] = value


def pec_uv_polygon(side: str, bl, mesh, mw, uv_layer) -> list[tuple[float, float]]:
    """Curated closed contour in UV from breast landmarks (smooth visual pec)."""
    anchors = [
        bl.sternum_superior,
        bl.infraclavicular_mid,
        bl.clavicle_lateral,
        bl.anterior_axillary_fold,
        bl.inframammary_lateral,
        bl.inframammary_medial,
        bl.sternum_mid,
    ]
    # Add apex as interior guide by expanding midpoints slightly toward apex
    poly = []
    for p in anchors:
        uv = world_to_uv_nearest(mesh, mw, uv_layer, p)
        if uv:
            poly.append(uv)
    # Ensure closed-ish unique
    cleaned = []
    for uv in poly:
        if not cleaned or (abs(cleaned[-1][0] - uv[0]) + abs(cleaned[-1][1] - uv[1])) > 1e-4:
            cleaned.append(uv)
    return cleaned


def write_png_r8(path: Path, buf, w, h):
    """Write grayscale PNG where pixel = region index (0-255).

    `buf` is top-down (y=0 = UV v=1). Blender image pixels are bottom-up.
    """
    img = bpy.data.images.new("RegionMask", width=w, height=h, alpha=False, float_buffer=False)
    pixels = [0.0] * (w * h * 4)
    for y in range(h):
        src_row = y * w
        dst_row = (h - 1 - y) * w
        for x in range(w):
            t = buf[src_row + x] / 255.0
            o = (dst_row + x) * 4
            pixels[o] = t
            pixels[o + 1] = t
            pixels[o + 2] = t
            pixels[o + 3] = 1.0
    img.pixels = pixels
    img.filepath_raw = str(path)
    img.file_format = "PNG"
    path.parent.mkdir(parents=True, exist_ok=True)
    img.save()
    bpy.data.images.remove(img)


def write_preview_color(path: Path, buf, w, h, idx_map):
    """Colored preview for QA (same V orientation fix as R8 mask)."""
    import colorsys
    img = bpy.data.images.new("RegionMaskPreview", width=w, height=h, alpha=False)
    pixels = [0.0] * (w * h * 4)
    for y in range(h):
        src_row = y * w
        dst_row = (h - 1 - y) * w
        for x in range(w):
            v = buf[src_row + x]
            if v == 0:
                r = g = b = 0.08
            else:
                hue = (v * 0.618033) % 1.0
                r, g, b = colorsys.hsv_to_rgb(hue, 0.55, 0.92)
            o = (dst_row + x) * 4
            pixels[o] = r
            pixels[o + 1] = g
            pixels[o + 2] = b
            pixels[o + 3] = 1.0
    img.pixels = pixels
    img.filepath_raw = str(path)
    img.file_format = "PNG"
    path.parent.mkdir(parents=True, exist_ok=True)
    img.save()
    bpy.data.images.remove(img)
    return {v: k for k, v in idx_map.items()}


def main():
    idx_map = region_index_map()
    log(f"regions={len(idx_map)} res={RES}")

    baked, rig, _ = bake_source()
    # Prefer authoritative face sets if present
    face_region: dict[int, str] = {}
    if FACE_MASKS.exists():
        data = json.loads(FACE_MASKS.read_text(encoding="utf-8"))
        for rid, payload in data.get("regions", {}).items():
            for fi in payload.get("faceIndices", []):
                face_region[int(fi)] = rid
        log(f"loaded face masks faces={len(face_region)}")
    else:
        result = partition_public_regions(baked, rig, Vector((0, 0, 0)))
        face_region = result.face_region
        log(f"partitioned faces={len(face_region)}")

    mesh = baked.data
    mw = baked.matrix_world
    if not mesh.uv_layers:
        raise RuntimeError("BodyVisual bake missing UV layers")
    uv_layer = mesh.uv_layers.active or mesh.uv_layers[0]
    log(f"uv_layer={uv_layer.name}")

    w = h = RES
    buf = [0] * (w * h)

    # Landmarks + curated breast fields (right authoritative, left mirrored)
    result_lm = partition_public_regions(baked, rig, Vector((0, 0, 0)))
    lm = result_lm.landmarks
    centroids = {}
    normals = {}
    for poly in mesh.polygons:
        c = Vector((0, 0, 0))
        for vi in poly.vertices:
            c += mw @ mesh.vertices[vi].co
        centroids[poly.index] = c / float(len(poly.vertices))
        normals[poly.index] = (mw.to_3x3() @ poly.normal).normalized()
    remaining = set(centroids.keys())

    bl_r = find_breast_side_landmarks(
        mesh, mw, side="right", lm=lm, centroids=centroids, normals=normals, remaining=remaining
    )
    bl_l = find_breast_side_landmarks(
        mesh, mw, side="left", lm=lm, centroids=centroids, normals=normals, remaining=remaining
    )
    field_r = build_breast_field(bl_r, lm)
    field_l = mirror_field_x(field_r, "left", lm, bl_l)
    # Shared IMF so full_chest / abdomen share exact visual boundary
    shared_imf = min(field_r.imf_z, field_l.imf_z)
    field_r.imf_z = shared_imf
    field_l.imf_z = shared_imf
    pec_r_i = idx_map["right_pectoral_region"]
    pec_l_i = idx_map["left_pectoral_region"]
    abd_i = idx_map["full_abdomen_region"]
    ribs_r_i = idx_map["right_ribs_region"]
    ribs_l_i = idx_map["left_ribs_region"]
    log(f"breast fields imf={shared_imf:.4f} apexR.z={field_r.apex.z:.4f}")

    torso_override = {
        "right_pectoral_region",
        "left_pectoral_region",
        "full_abdomen_region",
        "right_ribs_region",
        "left_ribs_region",
        "upper_back_region",
        "lower_back_region",
        "right_shoulder_surface",
        "left_shoulder_surface",
    }

    def classify_torso(world: Vector, default_val: int) -> int:
        mr = field_r.membership(world)
        ml = field_l.membership(world)
        if mr >= 0.45 or ml >= 0.45:
            return pec_r_i if mr >= ml else pec_l_i
        # Below shared IMF on anterior → force abdomen over pec bleed
        if world.z < shared_imf - 0.002 and world.y < 0.04:
            if abs(world.x - lm.sternum_x) < lm.shoulder_width * 0.42:
                if default_val in (pec_r_i, pec_l_i, abd_i, 0):
                    return abd_i
        return default_val

    # Rasterize every face by region (anterior chest band uses world soft classify)
    chest_z_lo = shared_imf - 0.05
    chest_z_hi = max(field_r.z_top, field_l.z_top) + 0.04
    for poly in mesh.polygons:
        rid = face_region.get(poly.index)
        if not rid:
            continue
        if rid in NON_SELECTABLE_BASE:
            val = 0
        else:
            val = idx_map.get(rid, 0)
        if val == 0 and rid not in NON_SELECTABLE_BASE:
            continue
        uvs = face_uv_coords(mesh, poly, uv_layer)
        if len(uvs) < 3:
            continue
        world_verts = [mw @ mesh.vertices[vi].co for vi in poly.vertices]
        c = centroids.get(poly.index)
        in_chest_band = (
            c is not None
            and chest_z_lo <= c.z <= chest_z_hi
            and c.y < 0.06
        )
        use_world = rid in torso_override or val in (pec_r_i, pec_l_i, abd_i) or in_chest_band
        for i in range(1, len(uvs) - 1):
            if use_world:
                rasterize_tri_world_classify(
                    buf,
                    w,
                    h,
                    uvs[0],
                    uvs[i],
                    uvs[i + 1],
                    world_verts[0],
                    world_verts[i],
                    world_verts[i + 1],
                    val,
                    classify_torso,
                )
            else:
                rasterize_tri(buf, w, h, uvs[0], uvs[i], uvs[i + 1], val)

    log("rasterized faces → UV (torso world-classified)")
    dilate_ids(buf, w, h, passes=2)

    torso_critical = {pec_r_i, pec_l_i, abd_i}
    # Light boundary polish only (preserve curved IMF)
    smooth_boundary(buf, w, h, torso_critical, passes=1)
    dilate_ids(buf, w, h, passes=1)

    contours = {
        "right_pectoral_region": {
            "controlPointsWorld": contour_control_points(field_r),
            "symmetrySource": "authoritative",
            "imf_z": shared_imf,
        },
        "left_pectoral_region": {
            "controlPointsWorld": contour_control_points(field_l),
            "symmetrySource": "mirror_x_from_right",
            "imf_z": shared_imf,
        },
    }

    # Counts
    counts = defaultdict(int)
    for v in buf:
        counts[v] += 1
    log(f"nonzero_texels={sum(1 for v in buf if v)} / {w*h}")

    write_png_r8(OUT_PNG, buf, w, h)
    log(f"wrote {OUT_PNG}")
    write_preview_color(OUT_PREVIEW, buf, w, h, idx_map)
    log(f"wrote preview {OUT_PREVIEW}")

    # Anatomical source + manifest
    regions_meta = {}
    for name, idx in idx_map.items():
        if name == "NON_SELECTABLE":
            continue
        regions_meta[name] = {
            "maskIndex": idx,
            "texelCount": counts.get(idx, 0),
            "classification": (
                "selectable"
                if name in PUBLIC_BASE_SELECTABLE
                else ("routing_only" if name in ROUTING_ONLY_BASE else "other")
            ),
        }

    anatomy = {
        "model": "neutro_body_v1",
        "version": 1,
        "method": "uv_region_id_mask",
        "sourceMesh": "assets/blender/neutro-body/neutro_body_v1_complete_source.blend",
        "uvLayer": uv_layer.name,
        "mask": {
            "path": "public/models/interaction/neutro_body_v1_public_region_mask.png",
            "resolution": [RES, RES],
            "encoding": "r8_index",
            "filter": "nearest_with_shader_supersample",
            "indexScale": 255,
        },
        "regions": regions_meta,
        "publicTaxonomy": {
            "torso": [
                "right_pectoral_region",
                "left_pectoral_region",
                "full_abdomen_region",
                "right_ribs_region",
                "left_ribs_region",
                "upper_back_region",
                "lower_back_region",
            ],
            "composites": {
                "full_chest": ["left_pectoral_region", "right_pectoral_region"],
                "full_back": ["upper_back_region", "lower_back_region"],
            },
        },
        "notes": {
            "faceSets": "metrics/adjacency only — not visual border authority",
            "visualAuthority": "UV region ID mask + world-space breast field + shader supersampling",
            "gluteHipPublic": "kept as selectable pending product review",
        },
        "contours": contours,
        "landmarks": {
            "sternum_x": lm.sternum_x,
            "shared_imf_z": shared_imf,
            "right_apex": [round(field_r.apex.x, 5), round(field_r.apex.y, 5), round(field_r.apex.z, 5)],
            "left_apex": [round(field_l.apex.x, 5), round(field_l.apex.y, 5), round(field_l.apex.z, 5)],
        },
    }
    ANATOMY_JSON.parent.mkdir(parents=True, exist_ok=True)
    ANATOMY_JSON.write_text(json.dumps(anatomy, indent=2), encoding="utf-8")

    manifest = {
        "model": "neutro_body_v1",
        "maskTexture": "/models/interaction/neutro_body_v1_public_region_mask.png",
        "resolution": RES,
        "encoding": "r8_index",
        "indexScale": 255,
        "regions": {k: {"maskIndex": v["maskIndex"]} for k, v in regions_meta.items()},
        "composites": anatomy["publicTaxonomy"]["composites"],
    }
    OUT_MANIFEST.write_text(json.dumps(manifest, indent=2), encoding="utf-8")
    log(f"wrote {OUT_MANIFEST}")
    log(f"wrote {ANATOMY_JSON}")
    log("DONE")


if __name__ == "__main__":
    main()
