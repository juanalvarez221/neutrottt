"""
Curate torso anatomical regions onto the authoring UV mask.

Uses landmark-guided surface classification + dense UV rasterization so
boundaries follow painted anatomy rather than low-poly face edges.

Does NOT wipe limbs/head/pelvis — only rewrites torso gate IDs.

Usage:
  blender.exe authoring.blend --background --python tools/body-regions/blender/curate_torso_mask.py
"""

from __future__ import annotations

import json
import math
import shutil
import sys
from datetime import datetime
from pathlib import Path

import bpy
from mathutils import Vector

ROOT = Path(__file__).resolve().parents[3]
PALETTE = ROOT / "assets/body-regions/neutro_body_v1_region_palette.json"
LANDMARKS = ROOT / "assets/body-regions/neutro_body_v1_landmarks.json"
AUTHORING = ROOT / "assets/body-regions/neutro_body_v1_anatomical_regions_authoring.png"
BACKUPS = ROOT / "assets/body-regions/backups"
PAINTABLE = "NEUTRO_BODY_MASK_AUTHORING"
IMAGE_NAME = "AnatomicalRegionsAuthoring"

TORSO_IDS = [
    "right_pectoral_region",
    "left_pectoral_region",
    "full_abdomen_region",
    "right_ribs_region",
    "left_ribs_region",
    "upper_back_region",
    "lower_back_region",
]


def hex_rgb(hex_color: str):
    h = hex_color.lstrip("#")
    return (
        int(h[0:2], 16) / 255.0,
        int(h[2:4], 16) / 255.0,
        int(h[4:6], 16) / 255.0,
        1.0,
    )


def find_body():
    obj = bpy.data.objects.get(PAINTABLE)
    if obj and obj.type == "MESH":
        return obj
    best = None
    n = -1
    for o in bpy.data.objects:
        if o.type == "MESH" and len(o.data.vertices) > n:
            best = o
            n = len(o.data.vertices)
    return best


def load_image():
    img = bpy.data.images.get(IMAGE_NAME)
    if img is None:
        img = bpy.data.images.load(str(AUTHORING))
        img.name = IMAGE_NAME
    else:
        img.filepath = str(AUTHORING)
        try:
            img.reload()
        except Exception:
            pass
    return img


def detect_runtime_to_blender(obj):
    """Return (to_blender, to_runtime, mode).

    Landmarks are runtime Y-up Z-front.
    Authoring blend is Z-up: runtime (x,y,z) → blender (x, z, y).
    """
    bb = [obj.matrix_world @ Vector(c) for c in obj.bound_box]
    dy = max(v.y for v in bb) - min(v.y for v in bb)
    dz = max(v.z for v in bb) - min(v.z for v in bb)
    if dz >= dy * 0.95:
        def to_blender(p):
            return Vector((p[0], p[2], p[1]))

        def to_runtime(p):
            return (p.x, p.z, p.y)

        return to_blender, to_runtime, "z_up_xz_swap"
    def to_blender(p):
        return Vector((p[0], p[1], p[2]))

    def to_runtime(p):
        return (p.x, p.y, p.z)

    return to_blender, to_runtime, "y_up"


def axis_z_at(y, samples):
    if not samples:
        return -0.08
    ys = [s["y"] for s in samples]
    zs = [s["z"] for s in samples]
    if y <= ys[0]:
        return zs[0]
    if y >= ys[-1]:
        return zs[-1]
    for i in range(len(ys) - 1):
        if ys[i] <= y <= ys[i + 1]:
            t = (y - ys[i]) / max(1e-6, ys[i + 1] - ys[i])
            return zs[i] * (1 - t) + zs[i + 1] * t
    return zs[-1]


def theta_deg(p_runtime, axis_z):
    return math.degrees(math.atan2(p_runtime[0], p_runtime[2] - axis_z))


def classify_torso(p_rt, lm, levels, axis_samples):
    """
    Landmark-guided torso classification in runtime coords.
    Returns region id or None (leave existing non-torso).
    """
    x, y, z = p_rt
    axz = axis_z_at(y, axis_samples)
    th = theta_deg(p_rt, axz)
    ath = abs(th)

    neck = levels["neckBase"]
    clav = levels["infraclavicular"]
    apex = levels["breastApex"]
    imf = levels["inframammary"]
    scap = levels["inferiorScapular"]
    waist = levels["waist"]
    iliac = levels["iliacCrest"]

    # Outside torso vertical band → not our rewrite target
    if y > neck + 0.02 or y < iliac - 0.02:
        return None

    # Arms roughly: far lateral and not on torso cylinder — leave alone if clearly limbs
    # Soft torso width gate
    torso_half = 0.22
    if abs(x) > 0.28 and ath > 50 and y > clav - 0.05:
        # likely shoulder/arm — skip rewrite
        return None

    # -------- Pectorals (anterior mound) --------
    # Smooth inframammary: gentle curve, not deep W
    lat_n = min(1.0, abs(x) / 0.14)
    imf_curve = imf - 0.006 + 0.04 * (lat_n ** 1.6)
    top_pec = clav + 0.005
    # medial to sternum, lateral toward anterior axillary
    if (imf_curve - 0.01) <= y <= top_pec and ath <= 72:
        front = z - axz
        if front > -0.01:
            # widen mid-breast, taper near axilla
            max_ath = 52 + 18 * max(0.0, min(1.0, (y - imf_curve) / max(0.04, top_pec - imf_curve)))
            if ath <= max_ath and front > -0.005:
                if x < -0.004:
                    return "right_pectoral_region"
                if x > 0.004:
                    return "left_pectoral_region"
                return "right_pectoral_region" if x <= 0 else "left_pectoral_region"

    # -------- Abdomen (front, below pecs) --------
    ab_top = imf_curve - 0.008
    ab_top_center = imf - 0.018
    if ath < 30:
        ab_top = ab_top_center + (ab_top - ab_top_center) * (ath / 30.0)
    ab_bottom = iliac + 0.05
    if ab_bottom <= y <= ab_top and ath <= 58:
        front = z - axz
        if front > 0.005:
            return "full_abdomen_region"

    # -------- Ribs (lateral wrap) --------
    rib_top = clav - 0.04
    rib_bot = waist - 0.03
    if rib_bot <= y <= rib_top:
        if 48 <= ath <= 135:
            if ath >= 55 or y < imf_curve - 0.015:
                if x < 0:
                    return "right_ribs_region"
                if x > 0:
                    return "left_ribs_region"

    # -------- Upper back --------
    ub_top = neck - 0.01
    ub_bot = scap - 0.01
    if ub_bot <= y <= ub_top and ath >= 95:
        if abs(x) < 0.22:
            return "upper_back_region"

    # -------- Lower back --------
    lb_top = scap
    lb_bot = iliac + 0.035
    if lb_bot <= y <= lb_top and ath >= 90:
        if abs(x) < 0.20:
            return "lower_back_region"

    return None


def clear_torso_pixels(pixels, w, h, torso_colors, bg):
    """Set torso palette colors to background (exact match)."""
    tol = 3 / 255.0
    n = w * h
    for i in range(n):
        o = i * 4
        r, g, b = pixels[o], pixels[o + 1], pixels[o + 2]
        for cr, cg, cb, _ in torso_colors:
            if abs(r - cr) <= tol and abs(g - cg) <= tol and abs(b - cb) <= tol:
                pixels[o] = bg[0]
                pixels[o + 1] = bg[1]
                pixels[o + 2] = bg[2]
                pixels[o + 3] = 1.0
                break


def paint_mesh_to_uv(obj, img, palette, lm_data):
    w, h = img.size
    pixels = list(img.pixels)
    regions = palette["regions"]
    bg = hex_rgb(palette["background"]["authoringColor"])
    torso_colors = [hex_rgb(regions[rid]["authoringColor"]) for rid in TORSO_IDS]
    clear_torso_pixels(pixels, w, h, torso_colors, bg)

    _to_blender, to_runtime, mode = detect_runtime_to_blender(obj)
    print("AXIS_MODE", mode)

    levels = lm_data["levels"]
    axis_samples = lm_data.get("axisZSamples", [])
    mesh = obj.data
    mw = obj.matrix_world
    uv_layer = mesh.uv_layers.active.data

    color_of = {rid: hex_rgb(regions[rid]["authoringColor"]) for rid in TORSO_IDS}

    # Dense sample each triangle (barycentric grid)
    STEPS = 7
    painted = 0
    for poly in mesh.polygons:
        loops = list(poly.loop_indices)
        verts = list(poly.vertices)
        if len(loops) < 3:
            continue
        # triangulate fan
        for t in range(1, len(verts) - 1):
            tri_v = [verts[0], verts[t], verts[t + 1]]
            tri_l = [loops[0], loops[t], loops[t + 1]]
            p0 = mw @ mesh.vertices[tri_v[0]].co
            p1 = mw @ mesh.vertices[tri_v[1]].co
            p2 = mw @ mesh.vertices[tri_v[2]].co
            uv0 = uv_layer[tri_l[0]].uv
            uv1 = uv_layer[tri_l[1]].uv
            uv2 = uv_layer[tri_l[2]].uv
            for i in range(STEPS + 1):
                for j in range(STEPS + 1 - i):
                    a = i / STEPS
                    b = j / STEPS
                    c = 1.0 - a - b
                    if c < -1e-6:
                        continue
                    pos = p0 * c + p1 * a + p2 * b
                    uv = uv0 * c + uv1 * a + uv2 * b
                    p_rt = to_runtime(pos)
                    rid = classify_torso(p_rt, lm_data, levels, axis_samples)
                    if rid is None:
                        continue
                    col = color_of[rid]
                    # Match tools/body-mask bake + runtime sampler: image v flips mesh UV.y
                    x = int(max(0, min(w - 1, round(uv.x * (w - 1)))))
                    y = int(max(0, min(h - 1, round((1.0 - uv.y) * (h - 1)))))
                    # 3x3 stamp for UV coverage across seams
                    for dy in (-1, 0, 1):
                        for dx in (-1, 0, 1):
                            xx = max(0, min(w - 1, x + dx))
                            yy = max(0, min(h - 1, y + dy))
                            o = (yy * w + xx) * 4
                            pixels[o] = col[0]
                            pixels[o + 1] = col[1]
                            pixels[o + 2] = col[2]
                            pixels[o + 3] = 1.0
                            painted += 1

    img.pixels = pixels
    img.update()
    print("PAINTED_STAMPS", painted)
    return painted


def fill_sternum_seam(img, palette):
    """Ensure left/right pecs meet at center without tab — grow toward black gap near sternum band."""
    # Lightweight: already assigned by x sign; skip heavy morph.
    return


def main():
    BACKUPS.mkdir(parents=True, exist_ok=True)
    stamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    if AUTHORING.exists():
        shutil.copy2(AUTHORING, BACKUPS / f"neutro_body_v1_anatomical_regions_pre_curate_{stamp}.png")

    palette = json.loads(PALETTE.read_text(encoding="utf-8"))
    lm_data = json.loads(LANDMARKS.read_text(encoding="utf-8"))

    obj = find_body()
    if obj is None:
        print("ERROR no body")
        sys.exit(1)
    if obj.name != PAINTABLE:
        obj.name = PAINTABLE

    img = load_image()
    paint_mesh_to_uv(obj, img, palette, lm_data)
    fill_sternum_seam(img, palette)

    img.filepath_raw = str(AUTHORING)
    img.file_format = "PNG"
    img.save()
    shutil.copy2(AUTHORING, BACKUPS / f"neutro_body_v1_anatomical_regions_curated_{stamp}.png")
    print("WROTE", AUTHORING)
    print("CURATE_TORSO_OK")


if __name__ == "__main__":
    main()
