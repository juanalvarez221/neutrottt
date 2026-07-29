# SPDX-License-Identifier: MIT
"""Neutro Anatomical Mask Authoring — Blender sidebar panel.

Viewport → N → NEUTRO → Anatomical Mask

Guided torso Texture Paint for non-experts.
Does NOT auto-correct anatomy. Manual curation only.
"""
bl_info = {
    "name": "Neutro Anatomical Mask Authoring",
    "author": "Neutro",
    "version": (1, 0, 0),
    "blender": (4, 2, 0),
    "location": "View3D > Sidebar > NEUTRO",
    "description": "Guided torso UV mask authoring for Neutro body selector",
    "category": "Paint",
}

import json
import os
import shutil
import subprocess
import sys
from datetime import datetime
from pathlib import Path

import bpy
from bpy.props import (
    BoolProperty,
    EnumProperty,
    FloatProperty,
    StringProperty,
)
from mathutils import Vector

# ---------------------------------------------------------------------------
# Paths
# ---------------------------------------------------------------------------

ADDON_FILE = Path(__file__).resolve()
REPO_ROOT = ADDON_FILE.parents[3]  # tools/body-regions/blender → repo

PATHS = {
    "palette": REPO_ROOT / "assets/body-regions/neutro_body_v1_region_palette.json",
    "landmarks": REPO_ROOT / "assets/body-regions/neutro_body_v1_landmarks.json",
    "authoring": REPO_ROOT / "assets/body-regions/neutro_body_v1_anatomical_regions_authoring.png",
    "backups": REPO_ROOT / "assets/body-regions/backups",
    "blend": REPO_ROOT / "assets/blender/neutro-body/neutro_body_v1_anatomical_mask_authoring.blend",
    "quantize": REPO_ROOT / "tools/body-regions/quantize-anatomical-mask.mjs",
    "render_gate": REPO_ROOT / "tools/body-regions/render-manual-torso-gate.mjs",
    "uv_audit": REPO_ROOT / "tools/body-regions/audit-uv-seam-coherence.mjs",
}

PAINTABLE_NAME = "NEUTRO_BODY_MASK_AUTHORING"
IMAGE_NAME = "AnatomicalRegionsAuthoring"
GUIDES_COLLECTION = "ANATOMICAL_GUIDES"
CAMERAS_COLLECTION = "Cameras"

TORSO_REGIONS = [
    ("full_chest_surface", "Pecho completo", "Continuous infraclavicular chest to IMF, both volumes + sternum"),
    ("full_abdomen_region", "Abdomen completo", "Below pecs, continuous front abdomen"),
    ("right_ribs_region", "Costillas derechas", "Wide lateral wrap, not a thin strip"),
    ("left_ribs_region", "Costillas izquierdas", "Prefer Mirror from right, then tweak"),
    ("upper_back_region", "Espalda alta", "Both scapular zones, no deltoids"),
    ("lower_back_region", "Espalda baja", "Full lumbar, stop before glutes"),
    ("NON_SELECTABLE", "No seleccionable", "Erase / background"),
]

MIRROR_PAIRS = {
    "right_ribs_region": "left_ribs_region",
}

HELP_FULL_CHEST = (
    "PECHO COMPLETO\n"
    "\n"
    "Superior: curva infraclavicular continua\n"
    "Laterales: pliegues axilares anteriores\n"
    "Inferior: surcos inframamarios reales\n"
    "Centro: continuo sobre el esternon (sin seam)\n"
    "\n"
    "1) Borrar parches pectorales / islas\n"
    "2) Pintar superficie continua de pecho\n"
    "3) Revisar Front / FR30 / FL30 / Right / Left\n"
    "4) Sin rectangulo, bib, mariposa ni dos parches"
)

ORDER_HINT = (
    "ORDEN: 1 Pecho completo → 2 Abdomen\n"
    "3 Costillas R → 4 Mirror L\n"
    "5 Espalda alta → 6 Espalda baja → 7 Full back"
)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _load_palette():
    with open(PATHS["palette"], "r", encoding="utf-8") as f:
        return json.load(f)


def _hex_to_rgb(hex_color: str):
    h = hex_color.lstrip("#")
    return (
        int(h[0:2], 16) / 255.0,
        int(h[2:4], 16) / 255.0,
        int(h[4:6], 16) / 255.0,
    )


def _hex_to_rgba8(hex_color: str):
    h = hex_color.lstrip("#")
    return (
        int(h[0:2], 16),
        int(h[2:4], 16),
        int(h[4:6], 16),
        255,
    )


def _region_color(region_id: str):
    pal = _load_palette()
    if region_id == "NON_SELECTABLE":
        return _hex_to_rgb(pal["background"]["authoringColor"])
    entry = pal["regions"][region_id]
    return _hex_to_rgb(entry["authoringColor"])


def _region_rgba8(region_id: str):
    pal = _load_palette()
    if region_id == "NON_SELECTABLE":
        return _hex_to_rgba8(pal["background"]["authoringColor"])
    return _hex_to_rgba8(pal["regions"][region_id]["authoringColor"])


def _find_paintable():
    obj = bpy.data.objects.get(PAINTABLE_NAME)
    if obj and obj.type == "MESH":
        return obj
    # Fallback: largest mesh
    best = None
    n = -1
    for o in bpy.data.objects:
        if o.type == "MESH" and len(o.data.vertices) > n:
            best = o
            n = len(o.data.vertices)
    return best


def _find_image():
    img = bpy.data.images.get(IMAGE_NAME)
    if img:
        return img
    for img in bpy.data.images:
        if img.filepath and "anatomical_regions_authoring" in img.filepath.replace("\\", "/"):
            return img
    return None


def _ensure_image_loaded():
    img = _find_image()
    path = str(PATHS["authoring"])
    if img is None:
        if not PATHS["authoring"].exists():
            raise RuntimeError(f"Missing authoring mask: {path}")
        img = bpy.data.images.load(path)
        img.name = IMAGE_NAME
    else:
        # Reload from disk if needed
        img.filepath = path
        try:
            img.reload()
        except Exception:
            pass
    img.colorspace_settings.name = "sRGB"
    return img


def _configure_safe_brush(color_rgb):
    """Force Mix / strength 1 / hard falloff / exact palette color."""
    settings = bpy.context.tool_settings.image_paint
    settings.mode = "IMAGE"
    brush = getattr(settings, "brush", None)
    if brush is None:
        # Blender 5: try tool system
        brush = bpy.data.brushes.get("TexDraw")
        if brush is None:
            for b in bpy.data.brushes:
                if getattr(b, "use_paint_image", False):
                    brush = b
                    break
    if brush is None:
        return False

    try:
        brush.color = color_rgb
    except Exception:
        pass
    try:
        brush.secondary_color = (0.0, 0.0, 0.0)
    except Exception:
        pass
    try:
        brush.strength = 1.0
    except Exception:
        pass
    try:
        brush.blend = "MIX"
    except Exception:
        pass
    try:
        if hasattr(brush, "curve_preset"):
            brush.curve_preset = "CONSTANT"
    except Exception:
        pass
    try:
        brush.spacing = 10
    except Exception:
        pass
    # Occlude / normal falloff when available
    try:
        settings.use_occlude = True
    except Exception:
        pass
    try:
        settings.use_backface_culling = True
    except Exception:
        pass
    try:
        settings.use_normal_falloff = False
    except Exception:
        pass
    return True


def _enter_texture_paint(obj):
    # Avoid bpy.ops.object.select_all — fails in background / wrong context.
    try:
        for o in bpy.context.view_layer.objects:
            o.select_set(False)
    except Exception:
        pass
    try:
        obj.hide_set(False)
    except Exception:
        pass
    obj.hide_select = False
    try:
        obj.select_set(True)
    except Exception:
        pass
    try:
        bpy.context.view_layer.objects.active = obj
    except Exception:
        pass
    try:
        bpy.ops.object.mode_set(mode="TEXTURE_PAINT")
    except Exception:
        try:
            bpy.ops.object.mode_set(mode="OBJECT")
            bpy.ops.object.mode_set(mode="TEXTURE_PAINT")
        except Exception as exc:
            print("WARN cannot enter TEXTURE_PAINT:", exc)


def _timestamp():
    return datetime.now().strftime("%Y%m%d_%H%M%S")


def _create_backup(label: str | None = None) -> Path:
    PATHS["backups"].mkdir(parents=True, exist_ok=True)
    src = PATHS["authoring"]
    if not src.exists():
        raise RuntimeError(f"No authoring mask to backup: {src}")
    name = f"neutro_body_v1_anatomical_regions_{label or _timestamp()}.png"
    dst = PATHS["backups"] / name
    shutil.copy2(src, dst)
    # Also refresh "last" pointer file
    last = PATHS["backups"] / "LAST_BACKUP.txt"
    last.write_text(str(dst), encoding="utf-8")
    return dst


def _last_backup_path() -> Path | None:
    last = PATHS["backups"] / "LAST_BACKUP.txt"
    if last.exists():
        p = Path(last.read_text(encoding="utf-8").strip())
        if p.exists():
            return p
    backups = sorted(PATHS["backups"].glob("neutro_body_v1_anatomical_regions_*.png"))
    return backups[-1] if backups else None


def _run_node(script: Path) -> tuple[int, str]:
    node = shutil.which("node") or "node"
    proc = subprocess.run(
        [node, str(script)],
        cwd=str(REPO_ROOT),
        capture_output=True,
        text=True,
        encoding="utf-8",
        errors="replace",
    )
    out = (proc.stdout or "") + (proc.stderr or "")
    return proc.returncode, out


def _set_status(context, msg: str):
    scene = context.scene
    if hasattr(scene, "neutro_mask"):
        scene.neutro_mask.status = msg[:512]
    print("[NEUTRO]", msg)


# ---------------------------------------------------------------------------
# Scene properties
# ---------------------------------------------------------------------------

def _safe_viz_update(self, context):
    try:
        update_preview_material(context)
        toggle_guides(context, bool(getattr(self, "show_guides", True)))
        toggle_uv_seams(context, bool(getattr(self, "show_uv_seams", False)))
    except Exception as exc:
        print("WARN viz update:", exc)


class NeutroMaskProps(bpy.types.PropertyGroup):
    # Blender 5: use annotations only. Class-body "=" shadows RNA with _PropertyDeferred.
    active_region: EnumProperty(
        name="Active Region",
        items=[(r[0], r[1], r[2]) for r in TORSO_REGIONS],
        default="full_chest_surface",
    )
    mask_opacity: FloatProperty(
        name="Mask Opacity",
        description="Preview opacity only — does not alter the mask image",
        default=0.85,
        min=0.05,
        max=1.0,
        update=_safe_viz_update,
    )
    show_skin: BoolProperty(name="Show skin", default=True, update=_safe_viz_update)
    show_mask: BoolProperty(name="Show anatomical mask", default=True, update=_safe_viz_update)
    show_active_only: BoolProperty(name="Show active region only", default=False, update=_safe_viz_update)
    show_neighbors: BoolProperty(name="Show neighboring regions", default=True, update=_safe_viz_update)
    show_guides: BoolProperty(name="Show anatomical guides", default=True, update=_safe_viz_update)
    show_uv_seams: BoolProperty(name="Show UV seams", default=False, update=_safe_viz_update)
    status: StringProperty(name="Status", default="Ready")


def update_preview_material(context):
    props = context.scene.neutro_mask
    obj = _find_paintable()
    if not obj:
        return
    mat = None
    for m in obj.data.materials:
        if m and m.name.startswith("NeutroMaskPreview"):
            mat = m
            break
    if mat is None or not mat.use_nodes:
        return
    nt = mat.node_tree
    # Emission strength / mix driven by opacity
    mix = nt.nodes.get("NeutroMix")
    if mix and "Fac" in mix.inputs:
        try:
            opacity = float(props.mask_opacity)
        except Exception:
            opacity = 0.85
        fac = opacity if bool(props.show_mask) else 0.0
        if not bool(props.show_skin):
            fac = 1.0
        mix.inputs["Fac"].default_value = float(fac)
    # Active-only: optional color-ramp isolation is heavy; we just note status
    if props.show_active_only:
        _set_status(context, f"Active-only preview: paint with {props.active_region} (neighbors dimmed via opacity)")


def toggle_guides(context, visible: bool):
    col = bpy.data.collections.get(GUIDES_COLLECTION)
    if col:
        col.hide_viewport = not visible
        col.hide_render = True


def toggle_uv_seams(context, visible: bool):
    obj = _find_paintable()
    if not obj:
        return
    # Show seams as edge display
    for area in context.screen.areas:
        if area.type == "VIEW_3D":
            for space in area.spaces:
                if space.type == "VIEW_3D":
                    space.overlay.show_edge_seams = visible
                    space.overlay.show_edges = visible


# ---------------------------------------------------------------------------
# Operators — File
# ---------------------------------------------------------------------------

class NEUTRO_OT_load_mask(bpy.types.Operator):
    bl_idname = "neutro.load_authoring_mask"
    bl_label = "Load Authoring Mask"
    bl_description = "Reload editable RGB mask from disk"

    def execute(self, context):
        try:
            img = _ensure_image_loaded()
            obj = _find_paintable()
            if obj:
                opacity = 0.85
                try:
                    opacity = float(getattr(context.scene.neutro_mask, "mask_opacity", 0.85))
                except Exception:
                    opacity = 0.85
                _ensure_preview_material(obj, img, opacity)
                _enter_texture_paint(obj)
            _set_status(context, f"Loaded {PATHS['authoring'].name}")
            self.report({"INFO"}, "Authoring mask loaded")
            return {"FINISHED"}
        except Exception as exc:
            self.report({"ERROR"}, str(exc))
            return {"CANCELLED"}


class NEUTRO_OT_save_mask(bpy.types.Operator):
    bl_idname = "neutro.save_authoring_mask"
    bl_label = "Save Authoring Mask"
    bl_description = "Save editable mask + create timestamped backup"

    def execute(self, context):
        try:
            img = _find_image()
            if img is None:
                self.report({"ERROR"}, "No authoring image in scene")
                return {"CANCELLED"}
            path = PATHS["authoring"]
            path.parent.mkdir(parents=True, exist_ok=True)
            # Backup existing disk file before overwrite
            if path.exists():
                bak = _create_backup(_timestamp())
            else:
                bak = None
            img.filepath_raw = str(path)
            img.file_format = "PNG"
            img.save()
            # Second backup of what was just saved
            saved_bak = _create_backup(f"saved_{_timestamp()}")
            _set_status(
                context,
                f"Saved {path.name}; backup {saved_bak.name}"
                + (f" (pre {bak.name})" if bak else ""),
            )
            self.report({"INFO"}, f"Saved + backup {saved_bak.name}")
            return {"FINISHED"}
        except Exception as exc:
            self.report({"ERROR"}, str(exc))
            return {"CANCELLED"}


class NEUTRO_OT_create_backup(bpy.types.Operator):
    bl_idname = "neutro.create_backup"
    bl_label = "Create Backup"
    bl_description = "Copy current authoring PNG into backups/"

    def execute(self, context):
        try:
            # Prefer saving image buffer first if dirty
            img = _find_image()
            if img and img.is_dirty:
                img.filepath_raw = str(PATHS["authoring"])
                img.file_format = "PNG"
                img.save()
            dst = _create_backup(_timestamp())
            _set_status(context, f"Backup {dst.name}")
            self.report({"INFO"}, f"Backup → {dst.name}")
            return {"FINISHED"}
        except Exception as exc:
            self.report({"ERROR"}, str(exc))
            return {"CANCELLED"}


class NEUTRO_OT_restore_backup(bpy.types.Operator):
    bl_idname = "neutro.restore_last_backup"
    bl_label = "Restore Last Backup"
    bl_description = "Restore last backup over authoring mask (current saved to new backup first)"

    def execute(self, context):
        try:
            last = _last_backup_path()
            if last is None:
                self.report({"ERROR"}, "No backup found")
                return {"CANCELLED"}
            # Safety: backup current first
            if PATHS["authoring"].exists():
                _create_backup(f"pre_restore_{_timestamp()}")
            shutil.copy2(last, PATHS["authoring"])
            img = _ensure_image_loaded()
            img.reload()
            _set_status(context, f"Restored {last.name}")
            self.report({"INFO"}, f"Restored {last.name}")
            return {"FINISHED"}
        except Exception as exc:
            self.report({"ERROR"}, str(exc))
            return {"CANCELLED"}


# ---------------------------------------------------------------------------
# Operators — Regions / tools
# ---------------------------------------------------------------------------

class NEUTRO_OT_set_region(bpy.types.Operator):
    bl_idname = "neutro.set_active_region"
    bl_label = "Set Active Region"
    bl_description = "Activate exact palette color for Texture Paint"

    region_id: bpy.props.StringProperty(name="Region ID", default="full_chest_surface")

    def execute(self, context):
        rid = self.region_id
        context.scene.neutro_mask.active_region = rid
        color = _region_color(rid)
        obj = _find_paintable()
        if obj:
            _enter_texture_paint(obj)
        _configure_safe_brush(color)
        label = next((r[1] for r in TORSO_REGIONS if r[0] == rid), rid)
        _set_status(context, f"Active: {label}")
        self.report({"INFO"}, f"Active region: {label}")
        return {"FINISHED"}


class NEUTRO_OT_paint_mode(bpy.types.Operator):
    bl_idname = "neutro.paint_active_region"
    bl_label = "Paint active region"
    bl_description = "Texture Paint with active palette color (Mix / Hard / Strength 1)"

    def execute(self, context):
        rid = context.scene.neutro_mask.active_region
        color = _region_color(rid)
        obj = _find_paintable()
        if not obj:
            self.report({"ERROR"}, "Paintable body not found")
            return {"CANCELLED"}
        _enter_texture_paint(obj)
        _configure_safe_brush(color)
        # Draw brush tool
        try:
            bpy.ops.wm.tool_set_by_id(name="builtin_brush.Draw")
        except Exception:
            pass
        _set_status(context, "Paint mode — active region color locked")
        return {"FINISHED"}


class NEUTRO_OT_erase_mode(bpy.types.Operator):
    bl_idname = "neutro.erase_to_non_selectable"
    bl_label = "Erase to non-selectable"
    bl_description = "Paint with NON_SELECTABLE (black) — exact ID erase"

    def execute(self, context):
        context.scene.neutro_mask.active_region = "NON_SELECTABLE"
        color = _region_color("NON_SELECTABLE")
        obj = _find_paintable()
        if obj:
            _enter_texture_paint(obj)
        _configure_safe_brush(color)
        try:
            bpy.ops.wm.tool_set_by_id(name="builtin_brush.Draw")
        except Exception:
            pass
        _set_status(context, "Erase mode — NON_SELECTABLE")
        return {"FINISHED"}


class NEUTRO_OT_sample_region(bpy.types.Operator):
    bl_idname = "neutro.sample_region"
    bl_label = "Sample region"
    bl_description = "Use Blender Eyedropper then match nearest palette color"

    def execute(self, context):
        try:
            bpy.ops.wm.tool_set_by_id(name="builtin.sample_color")
        except Exception:
            try:
                bpy.ops.paint.sample_color(location=(0.5, 0.5), merged=False)
            except Exception:
                pass
        _set_status(context, "Sample tool — after pick, press a region button to lock palette ID")
        self.report({"INFO"}, "Sample tool active — then lock a torso region button")
        return {"FINISHED"}


class NEUTRO_OT_fill_connected(bpy.types.Operator):
    bl_idname = "neutro.fill_connected_area"
    bl_label = "Fill connected area"
    bl_description = "Use Blender Fill brush with active palette color"

    def execute(self, context):
        rid = context.scene.neutro_mask.active_region
        color = _region_color(rid)
        obj = _find_paintable()
        if obj:
            _enter_texture_paint(obj)
        _configure_safe_brush(color)
        try:
            bpy.ops.wm.tool_set_by_id(name="builtin_brush.Fill")
        except Exception:
            self.report({"WARNING"}, "Fill tool unavailable — paint manually")
        _set_status(context, "Fill tool — active region color")
        return {"FINISHED"}


# ---------------------------------------------------------------------------
# Mirror (topology / UV based — not 2D image flip)
# ---------------------------------------------------------------------------

def _build_vertex_mirror_map(obj, tol=0.012):
    """Map vertex index → mirrored vertex index by world X reflection."""
    mesh = obj.data
    mw = obj.matrix_world
    positions = []
    for v in mesh.vertices:
        positions.append(mw @ v.co)

    # Spatial hash
    buckets = {}
    for i, p in enumerate(positions):
        key = (round(p.x / tol), round(p.y / tol), round(p.z / tol))
        buckets.setdefault(key, []).append(i)

    mirror = {}
    for i, p in enumerate(positions):
        target = Vector((-p.x, p.y, p.z))
        key = (round(target.x / tol), round(target.y / tol), round(target.z / tol))
        candidates = buckets.get(key, [])
        best = None
        best_d = tol * tol * 4
        for j in candidates:
            q = positions[j]
            d = (q - target).length_squared
            if d < best_d:
                best_d = d
                best = j
        if best is not None:
            mirror[i] = best
    return mirror


def _mirror_region_pixels(img, src_region: str, dst_region: str, obj) -> int:
    """
    Transfer src region color to dst via mesh UV topology mirror.
    For each loop UV of a triangle, if texel ≈ src color, write dst color
    at the mirrored triangle's corresponding UV.
    """
    src_rgba = _region_rgba8(src_region)
    dst_rgba = _region_rgba8(dst_region)
    w, h = img.size
    pixels = list(img.pixels)  # float RGBA flattened
    # Work in byte space for matching
    tol = 8 / 255.0

    def get_px(u, v):
        # Blender image: v=0 at bottom
        x = int(max(0, min(w - 1, round(u * (w - 1)))))
        y = int(max(0, min(h - 1, round(v * (h - 1)))))
        i = (y * w + x) * 4
        return pixels[i : i + 4], x, y, i

    def set_px(x, y, rgba8):
        i = (y * w + x) * 4
        pixels[i] = rgba8[0] / 255.0
        pixels[i + 1] = rgba8[1] / 255.0
        pixels[i + 2] = rgba8[2] / 255.0
        pixels[i + 3] = 1.0

    def matches_src(rgba):
        return (
            abs(rgba[0] - src_rgba[0] / 255.0) <= tol
            and abs(rgba[1] - src_rgba[1] / 255.0) <= tol
            and abs(rgba[2] - src_rgba[2] / 255.0) <= tol
        )

    mirror = _build_vertex_mirror_map(obj)
    mesh = obj.data
    if not mesh.uv_layers.active:
        raise RuntimeError("Mesh has no active UV layer")
    uv_layer = mesh.uv_layers.active.data

    painted = 0
    # Clear destination region first? Soft: only overwrite where we map from src
    # Walk polygons
    for poly in mesh.polygons:
        loop_indices = list(poly.loop_indices)
        vert_indices = list(poly.vertices)
        if len(loop_indices) < 3:
            continue
        # Sample centroid UV color
        cu = cv = 0.0
        for li in loop_indices:
            uv = uv_layer[li].uv
            cu += uv.x
            cv += uv.y
        n = len(loop_indices)
        cu /= n
        cv /= n
        rgba, _, _, _ = get_px(cu, cv)
        if not matches_src(rgba):
            continue
        # Mirrored verts
        mverts = [mirror.get(vi) for vi in vert_indices]
        if any(m is None for m in mverts):
            continue
        # Find destination polygon sharing mirrored verts (approx: paint at mirrored loop UVs)
        # Build UV of mirrored positions by finding loops of mirrored verts on any poly
        # Simpler: for each source loop, map vert→mirror vert, find any UV of that mirror vert
        vert_to_uvs = {}
        for p2 in mesh.polygons:
            for li, vi in zip(p2.loop_indices, p2.vertices):
                vert_to_uvs.setdefault(vi, []).append(uv_layer[li].uv.copy())

        # Rasterize by painting small stamps at mirrored UVs of each source loop
        for li, vi in zip(loop_indices, vert_indices):
            mvi = mirror.get(vi)
            if mvi is None:
                continue
            src_uv = uv_layer[li].uv
            rgba_s, _, _, _ = get_px(src_uv.x, src_uv.y)
            if not matches_src(rgba_s):
                continue
            for muv in vert_to_uvs.get(mvi, []):
                x = int(max(0, min(w - 1, round(muv.x * (w - 1)))))
                y = int(max(0, min(h - 1, round(muv.y * (h - 1)))))
                # Stamp 3x3 for coverage
                for dy in (-1, 0, 1):
                    for dx in (-1, 0, 1):
                        xx = max(0, min(w - 1, x + dx))
                        yy = max(0, min(h - 1, y + dy))
                        set_px(xx, yy, dst_rgba)
                        painted += 1

    img.pixels = pixels
    img.update()
    return painted


class NEUTRO_OT_mirror_right_to_left(bpy.types.Operator):
    bl_idname = "neutro.mirror_right_to_left"
    bl_label = "Mirror right region to left"
    bl_description = "Topology/UV mirror for paired regions only (pectorals, ribs)"

    def execute(self, context):
        rid = context.scene.neutro_mask.active_region
        if rid not in MIRROR_PAIRS:
            # If left selected, allow mirroring from its right pair
            inv = {v: k for k, v in MIRROR_PAIRS.items()}
            if rid in inv:
                src, dst = inv[rid], rid
            else:
                self.report(
                    {"ERROR"},
                    "Mirror only for Pectorales / Costillas. Select a paired region.",
                )
                return {"CANCELLED"}
        else:
            src, dst = rid, MIRROR_PAIRS[rid]

        obj = _find_paintable()
        img = _find_image()
        if not obj or not img:
            self.report({"ERROR"}, "Body or mask image missing")
            return {"CANCELLED"}

        try:
            # Save + backup before destructive mirror
            img.filepath_raw = str(PATHS["authoring"])
            img.file_format = "PNG"
            img.save()
            _create_backup(f"pre_mirror_{_timestamp()}")

            count = _mirror_region_pixels(img, src, dst, obj)
            img.filepath_raw = str(PATHS["authoring"])
            img.save()
            _create_backup(f"post_mirror_{_timestamp()}")
            context.scene.neutro_mask.active_region = dst
            _configure_safe_brush(_region_color(dst))
            _set_status(context, f"Mirrored {src} → {dst} ({count} stamps)")
            self.report({"INFO"}, f"Mirrored {src} → {dst}")
            return {"FINISHED"}
        except Exception as exc:
            self.report({"ERROR"}, str(exc))
            return {"CANCELLED"}


# ---------------------------------------------------------------------------
# Cameras (runtime front=+Z, back=-Z)
# ---------------------------------------------------------------------------

CAMERA_SPECS = [
    ("FRONT", (0.0, 1.15, 2.6)),
    ("FRONT_RIGHT_30", (-1.3, 1.15, 2.25)),
    ("FRONT_LEFT_30", (1.3, 1.15, 2.25)),
    ("RIGHT", (-2.6, 1.15, 0.0)),
    ("LEFT", (2.6, 1.15, 0.0)),
    ("BACK", (0.0, 1.15, -2.6)),
    ("BACK_RIGHT_30", (-1.3, 1.15, -2.25)),
    ("BACK_LEFT_30", (1.3, 1.15, -2.25)),
]


def _ensure_runtime_cameras(obj):
    """Create/update cameras in runtime coords. Blender may be Z-up; map carefully.

    Authoring blend from GLB/source: prefer object-space relative to body.
    Runtime: +Y up, +Z front. If Blender scene is Y-up (glTF), use (x,y,z) directly.
    If Z-up, convert (x,y,z)_runtime → (x, -z, y)_blender.
    """
    col = bpy.data.collections.get(CAMERAS_COLLECTION)
    if col is None:
        col = bpy.data.collections.new(CAMERAS_COLLECTION)
        bpy.context.scene.collection.children.link(col)

    # Detect up axis heuristically from body dimensions
    bb = [obj.matrix_world @ Vector(c) for c in obj.bound_box]
    dx = max(v.x for v in bb) - min(v.x for v in bb)
    dy = max(v.y for v in bb) - min(v.y for v in bb)
    dz = max(v.z for v in bb) - min(v.z for v in bb)
    z_up = dz >= dy  # taller in Z → Blender Z-up

    cx = sum(v.x for v in bb) / 8.0
    cy = sum(v.y for v in bb) / 8.0
    cz = sum(v.z for v in bb) / 8.0
    center = Vector((cx, cy, cz))

    target = bpy.data.objects.get("NeutroCamTarget")
    if target is None:
        target = bpy.data.objects.new("NeutroCamTarget", None)
        col.objects.link(target)
    target.location = center
    target.hide_select = True
    target.hide_render = True

    created = []
    for name, (rx, ry, rz) in CAMERA_SPECS:
        # runtime offset from body center: (x, y_height, z_front)
        # CAMERA_SPECS already absolute-ish; re-center
        if z_up:
            # runtime (x,y,z) → blender (x, -z, y)
            loc = Vector((cx + rx, cy - rz, cz + (ry - 1.15)))
        else:
            loc = Vector((cx + rx, cy + (ry - 1.15), cz + rz))

        cam_obj = bpy.data.objects.get(f"cam_{name}")
        if cam_obj is None:
            cam_data = bpy.data.cameras.new(name)
            cam_data.lens = 50
            cam_obj = bpy.data.objects.new(f"cam_{name}", cam_data)
            col.objects.link(cam_obj)
        cam_obj.location = loc
        # Track to target
        track = None
        for c in cam_obj.constraints:
            if c.type == "TRACK_TO":
                track = c
                break
        if track is None:
            track = cam_obj.constraints.new(type="TRACK_TO")
        track.target = target
        track.track_axis = "TRACK_NEGATIVE_Z"
        track.up_axis = "UP_Y"
        cam_obj.hide_select = True
        cam_obj.hide_render = True
        created.append(cam_obj)
    return created


class NEUTRO_OT_set_camera(bpy.types.Operator):
    bl_idname = "neutro.set_review_camera"
    bl_label = "Set Camera"
    bl_description = "Jump to torso review camera (runtime front=+Z)"

    cam_id: bpy.props.StringProperty(name="Camera ID", default="FRONT")

    def execute(self, context):
        obj = _find_paintable()
        if obj:
            _ensure_runtime_cameras(obj)
        cam = bpy.data.objects.get(f"cam_{self.cam_id}")
        if cam is None:
            self.report({"ERROR"}, f"Camera cam_{self.cam_id} missing")
            return {"CANCELLED"}
        context.scene.camera = cam
        for area in context.screen.areas:
            if area.type == "VIEW_3D":
                for space in area.spaces:
                    if space.type == "VIEW_3D":
                        space.region_3d.view_perspective = "CAMERA"
                        try:
                            bpy.ops.view3d.view_camera()
                        except Exception:
                            pass
                area.tag_redraw()
        _set_status(context, f"Camera {self.cam_id}")
        return {"FINISHED"}


# ---------------------------------------------------------------------------
# Guides
# ---------------------------------------------------------------------------

def _make_curve(name, points, col):
    existing = bpy.data.objects.get(name)
    if existing:
        bpy.data.objects.remove(existing, do_unlink=True)
    curve_data = bpy.data.curves.new(name=name, type="CURVE")
    curve_data.dimensions = "3D"
    curve_data.bevel_depth = 0.0015
    spline = curve_data.splines.new("POLY")
    spline.points.add(len(points) - 1)
    for i, p in enumerate(points):
        spline.points[i].co = (p[0], p[1], p[2], 1.0)
    obj = bpy.data.objects.new(name, curve_data)
    col.objects.link(obj)
    obj.hide_render = True
    obj.hide_select = True
    obj.display_type = "WIRE"
    # Non-selectable helper material
    mat = bpy.data.materials.get("NeutroGuideMat")
    if mat is None:
        mat = bpy.data.materials.new("NeutroGuideMat")
        mat.use_nodes = True
        nt = mat.node_tree
        nt.nodes.clear()
        out = nt.nodes.new("ShaderNodeOutputMaterial")
        emis = nt.nodes.new("ShaderNodeEmission")
        emis.inputs["Color"].default_value = (0.2, 0.85, 0.95, 1.0)
        emis.inputs["Strength"].default_value = 2.0
        nt.links.new(emis.outputs["Emission"], out.inputs["Surface"])
    if obj.data.materials:
        obj.data.materials[0] = mat
    else:
        obj.data.materials.append(mat)
    return obj


def ensure_anatomical_guides():
    col = bpy.data.collections.get(GUIDES_COLLECTION)
    if col is None:
        col = bpy.data.collections.new(GUIDES_COLLECTION)
        bpy.context.scene.collection.children.link(col)
    col.hide_render = True

    lm = json.loads(PATHS["landmarks"].read_text(encoding="utf-8"))
    p = lm["points"]

    def pt(key):
        return tuple(p[key])

    # Sternum line
    _make_curve(
        "guide_sternal_line",
        [pt("sternumTop"), pt("sternumBottom"), pt("waistFront")],
        col,
    )
    # Clavicular base
    _make_curve(
        "guide_clavicular_base",
        [pt("clavicleRight"), pt("sternumTop"), pt("clavicleLeft")],
        col,
    )
    # Anterior axillary folds
    _make_curve(
        "guide_axillary_anterior_R",
        [pt("anteriorAxillaryFoldRight"), pt("inframammaryLateralRight")],
        col,
    )
    _make_curve(
        "guide_axillary_anterior_L",
        [pt("anteriorAxillaryFoldLeft"), pt("inframammaryLateralLeft")],
        col,
    )
    # Posterior axillary folds
    _make_curve(
        "guide_axillary_posterior_R",
        [pt("posteriorAxillaryFoldRight"), (pt("posteriorAxillaryFoldRight")[0], lm["levels"]["inferiorScapular"], pt("posteriorAxillaryFoldRight")[2])],
        col,
    )
    _make_curve(
        "guide_axillary_posterior_L",
        [pt("posteriorAxillaryFoldLeft"), (pt("posteriorAxillaryFoldLeft")[0], lm["levels"]["inferiorScapular"], pt("posteriorAxillaryFoldLeft")[2])],
        col,
    )
    # Inframammary
    _make_curve(
        "guide_inframammary_R",
        [pt("inframammaryMedialRight"), pt("inframammaryLateralRight")],
        col,
    )
    _make_curve(
        "guide_inframammary_L",
        [pt("inframammaryMedialLeft"), pt("inframammaryLateralLeft")],
        col,
    )
    # Inferior scapular line (horizontal-ish)
    y = lm["levels"]["inferiorScapular"]
    _make_curve(
        "guide_inferior_scapular",
        [(-0.18, y, -0.18), (0.0, y, -0.18), (0.18, y, -0.18)],
        col,
    )
    # Waist
    _make_curve(
        "guide_waist",
        [pt("waistFront"), pt("waistBack")],
        col,
    )
    # Lumbar-pelvic transition
    y2 = lm["levels"]["iliacCrest"]
    _make_curve(
        "guide_lumbar_pelvic",
        [(-0.12, y2 + 0.04, -0.16), (0.0, y2 + 0.02, -0.17), (0.12, y2 + 0.04, -0.16)],
        col,
    )
    return col


# ---------------------------------------------------------------------------
# Preview material
# ---------------------------------------------------------------------------

def _ensure_preview_material(obj, img, opacity=0.85):
    mat = bpy.data.materials.get("NeutroMaskPreview")
    if mat is None:
        mat = bpy.data.materials.new("NeutroMaskPreview")
    mat.use_nodes = True
    nt = mat.node_tree
    nt.nodes.clear()

    out = nt.nodes.new("ShaderNodeOutputMaterial")
    out.location = (400, 0)
    mix = nt.nodes.new("ShaderNodeMixShader")
    mix.name = "NeutroMix"
    mix.location = (200, 0)
    mix.inputs["Fac"].default_value = float(opacity)

    skin = nt.nodes.new("ShaderNodeBsdfPrincipled")
    skin.name = "NeutroSkin"
    skin.location = (0, 100)
    skin.inputs["Base Color"].default_value = (0.72, 0.58, 0.50, 1.0)
    skin.inputs["Roughness"].default_value = 0.55

    emis = nt.nodes.new("ShaderNodeEmission")
    emis.location = (0, -120)
    tex = nt.nodes.new("ShaderNodeTexImage")
    tex.name = "NeutroMaskTex"
    tex.image = img
    tex.interpolation = "Closest"
    tex.location = (-220, -120)

    nt.links.new(tex.outputs["Color"], emis.inputs["Color"])
    nt.links.new(skin.outputs["BSDF"], mix.inputs[1])
    nt.links.new(emis.outputs["Emission"], mix.inputs[2])
    nt.links.new(mix.outputs["Shader"], out.inputs["Surface"])

    obj.data.materials.clear()
    obj.data.materials.append(mat)
    return mat


# ---------------------------------------------------------------------------
# Validate / Quantize / Render
# ---------------------------------------------------------------------------

class NEUTRO_OT_validate_mask(bpy.types.Operator):
    bl_idname = "neutro.validate_current_mask"
    bl_label = "Validate Current Mask"
    bl_description = "Technical integrity only — not anatomical quality"

    def execute(self, context):
        try:
            # Save first so disk matches buffer
            img = _find_image()
            if img:
                img.filepath_raw = str(PATHS["authoring"])
                img.file_format = "PNG"
                img.save()

            pal = _load_palette()
            known = {_hex_to_rgba8(pal["background"]["authoringColor"])[:3]}
            for e in pal["regions"].values():
                known.add(_hex_to_rgba8(e["authoringColor"])[:3])

            # Analyze via pixels
            img = _ensure_image_loaded()
            w, h = img.size
            px = list(img.pixels)
            unknown = 0
            transparent = 0
            present = set()
            # Sample every 4th pixel for speed
            step = 4
            for y in range(0, h, step):
                for x in range(0, w, step):
                    i = (y * w + x) * 4
                    r, g, b, a = px[i], px[i + 1], px[i + 2], px[i + 3]
                    if a < 0.05:
                        transparent += 1
                        continue
                    rgb8 = (int(round(r * 255)), int(round(g * 255)), int(round(b * 255)))
                    # nearest known within 18
                    hit = None
                    best = 999999
                    for kr, kg, kb in known:
                        d = (rgb8[0] - kr) ** 2 + (rgb8[1] - kg) ** 2 + (rgb8[2] - kb) ** 2
                        if d < best:
                            best = d
                            hit = (kr, kg, kb)
                    if best > 18 * 18:
                        unknown += 1
                    else:
                        present.add(hit)

            torso_ids = [
                "full_chest_surface",
                "full_abdomen_region",
                "right_ribs_region",
                "left_ribs_region",
                "upper_back_region",
                "lower_back_region",
            ]
            missing = []
            for tid in torso_ids:
                c = _hex_to_rgba8(pal["regions"][tid]["authoringColor"])[:3]
                if c not in present:
                    missing.append(tid)

            # Optional UV seam audit (on runtime if exists)
            seam_msg = "seam audit skipped"
            if PATHS["uv_audit"].exists() and (
                REPO_ROOT / "public/models/interaction/neutro_body_v1_anatomical_region_ids.png"
            ).exists():
                code, out = _run_node(PATHS["uv_audit"])
                for line in out.splitlines():
                    if "uv_seam_id_mismatches" in line:
                        seam_msg = line.strip()
                        break

            msg = (
                f"unknown≈{unknown} transparent≈{transparent} "
                f"missing_torso={missing or 'none'} | {seam_msg}"
            )
            _set_status(context, msg)
            self.report({"INFO"}, msg)
            print("[NEUTRO VALIDATE]", msg)
            return {"FINISHED"}
        except Exception as exc:
            self.report({"ERROR"}, str(exc))
            return {"CANCELLED"}


class NEUTRO_OT_quantize_export(bpy.types.Operator):
    bl_idname = "neutro.quantize_export"
    bl_label = "Quantize and Export Runtime Mask"
    bl_description = "Save authoring PNG then run quantize-anatomical-mask.mjs"

    def execute(self, context):
        try:
            img = _find_image()
            if img:
                img.filepath_raw = str(PATHS["authoring"])
                img.file_format = "PNG"
                img.save()
                _create_backup(f"pre_quantize_{_timestamp()}")
            code, out = _run_node(PATHS["quantize"])
            print(out)
            if code != 0:
                self.report({"ERROR"}, f"Quantize failed ({code}). See console.")
                _set_status(context, f"Quantize FAIL {code}")
                return {"CANCELLED"}
            if "unknown" in out.lower() and "unknown 0" not in out.lower():
                # still ok if exit 0
                pass
            _set_status(context, "Quantize OK — runtime mask written")
            self.report({"INFO"}, "Runtime mask exported")
            return {"FINISHED"}
        except Exception as exc:
            self.report({"ERROR"}, str(exc))
            return {"CANCELLED"}


class NEUTRO_OT_render_torso_gate(bpy.types.Operator):
    bl_idname = "neutro.render_torso_gate"
    bl_label = "Render Torso Gate"
    bl_description = "Quantize then render 19 Gate Torso evidence images"

    def execute(self, context):
        try:
            # Ensure fresh quantize
            bpy.ops.neutro.quantize_export()
            code, out = _run_node(PATHS["render_gate"])
            print(out)
            if code != 0:
                self.report({"ERROR"}, f"Render gate failed ({code})")
                return {"CANCELLED"}
            _set_status(context, "Rendered artifacts/manual-anatomical-mask-gate-torso/")
            self.report({"INFO"}, "Torso gate renders done")
            return {"FINISHED"}
        except Exception as exc:
            self.report({"ERROR"}, str(exc))
            return {"CANCELLED"}


class NEUTRO_OT_prepare_session(bpy.types.Operator):
    bl_idname = "neutro.prepare_authoring_session"
    bl_label = "Prepare Authoring Session"
    bl_description = "Select body, load mask, Texture Paint, Pec R, Front, guides"

    def execute(self, context):
        try:
            obj = _find_paintable()
            if not obj:
                self.report({"ERROR"}, "No mesh body found")
                return {"CANCELLED"}
            if obj.name != PAINTABLE_NAME:
                obj.name = PAINTABLE_NAME
            # Lock transforms
            obj.lock_location = (True, True, True)
            obj.lock_rotation = (True, True, True)
            obj.lock_scale = (True, True, True)
            obj.hide_select = False

            img = _ensure_image_loaded()
            opacity = 0.85
            try:
                opacity = float(context.scene.neutro_mask.mask_opacity)
            except Exception:
                pass
            _ensure_preview_material(obj, img, opacity)
            ensure_anatomical_guides()
            _ensure_runtime_cameras(obj)
            toggle_guides(context, True)

            # Hide / protect helpers
            for o in bpy.data.objects:
                if o == obj:
                    continue
                if o.type in {"LIGHT", "CAMERA", "EMPTY", "CURVE", "ARMATURE"}:
                    o.hide_select = True
                if o.name.startswith("guide_") or o.name.startswith("cam_") or o.name.startswith("lm_"):
                    o.hide_select = True
                if o.name.startswith("swatch_"):
                    o.hide_select = True

            _enter_texture_paint(obj)
            context.scene.neutro_mask.active_region = "full_chest_surface"
            _configure_safe_brush(_region_color("full_chest_surface"))
            # Prefer direct camera assign in background (viewport ops may be unavailable)
            front = bpy.data.objects.get("cam_FRONT")
            if front is not None:
                context.scene.camera = front
            _set_status(context, "Session ready — Pecho completo / Front")
            self.report({"INFO"}, "Authoring session prepared")
            return {"FINISHED"}
        except Exception as exc:
            self.report({"ERROR"}, str(exc))
            return {"CANCELLED"}


# ---------------------------------------------------------------------------
# UI Panel
# ---------------------------------------------------------------------------

class NEUTRO_PT_anatomical_mask(bpy.types.Panel):
    bl_label = "Anatomical Mask"
    bl_idname = "NEUTRO_PT_anatomical_mask"
    bl_space_type = "VIEW_3D"
    bl_region_type = "UI"
    bl_category = "NEUTRO"

    def draw(self, context):
        layout = self.layout
        props = context.scene.neutro_mask

        box = layout.box()
        box.label(text="Archivo", icon="FILE")
        row = box.row(align=True)
        row.operator("neutro.load_authoring_mask", text="Load")
        row.operator("neutro.save_authoring_mask", text="Save")
        row = box.row(align=True)
        row.operator("neutro.create_backup", text="Backup")
        row.operator("neutro.restore_last_backup", text="Restore")
        box.operator("neutro.prepare_authoring_session", text="Prepare Session", icon="PLAY")

        box = layout.box()
        box.label(text="Regiones del torso", icon="BRUSH_DATA")
        for rid, label, _tip in TORSO_REGIONS:
            op = box.operator("neutro.set_active_region", text=label)
            op.region_id = rid
        box.label(text=f"Activa: {props.active_region}")

        box = layout.box()
        box.label(text="Herramientas", icon="TOOL_SETTINGS")
        col = box.column(align=True)
        col.operator("neutro.paint_active_region", text="Paint active region")
        col.operator("neutro.erase_to_non_selectable", text="Erase to non-selectable")
        col.operator("neutro.sample_region", text="Sample region")
        col.operator("neutro.fill_connected_area", text="Fill connected area")

        box = layout.box()
        box.label(text="Simetria", icon="MOD_MIRROR")
        box.operator("neutro.mirror_right_to_left", text="Mirror right region to left")
        box.label(text="Solo pectorales / costillas")

        box = layout.box()
        box.label(text="Visualizacion", icon="HIDE_OFF")
        box.prop(props, "show_skin")
        box.prop(props, "show_mask")
        box.prop(props, "mask_opacity", slider=True)
        box.prop(props, "show_active_only")
        box.prop(props, "show_neighbors")
        box.prop(props, "show_guides")
        box.prop(props, "show_uv_seams")

        box = layout.box()
        box.label(text="Camaras (runtime +Z front)", icon="CAMERA_DATA")
        grid = box.grid_flow(columns=2, align=True)
        for name, _ in CAMERA_SPECS:
            op = grid.operator("neutro.set_review_camera", text=name.replace("_", " "))
            op.cam_id = name

        box = layout.box()
        box.label(text="Ayuda — Pecho completo", icon="INFO")
        for line in HELP_FULL_CHEST.split("\n"):
            box.label(text=line)
        box.separator()
        for line in ORDER_HINT.split("\n"):
            box.label(text=line)

        box = layout.box()
        box.label(text="Pipeline", icon="EXPORT")
        box.operator("neutro.validate_current_mask", text="Validate Current Mask")
        box.operator("neutro.quantize_export", text="Quantize and Export Runtime Mask")
        box.operator("neutro.render_torso_gate", text="Render Torso Gate")

        layout.label(text=props.status)


# ---------------------------------------------------------------------------
# Registration
# ---------------------------------------------------------------------------

CLASSES = (
    NeutroMaskProps,
    NEUTRO_OT_load_mask,
    NEUTRO_OT_save_mask,
    NEUTRO_OT_create_backup,
    NEUTRO_OT_restore_backup,
    NEUTRO_OT_set_region,
    NEUTRO_OT_paint_mode,
    NEUTRO_OT_erase_mode,
    NEUTRO_OT_sample_region,
    NEUTRO_OT_fill_connected,
    NEUTRO_OT_mirror_right_to_left,
    NEUTRO_OT_set_camera,
    NEUTRO_OT_validate_mask,
    NEUTRO_OT_quantize_export,
    NEUTRO_OT_render_torso_gate,
    NEUTRO_OT_prepare_session,
    NEUTRO_PT_anatomical_mask,
)


def register():
    for cls in CLASSES:
        bpy.utils.register_class(cls)
    bpy.types.Scene.neutro_mask = bpy.props.PointerProperty(type=NeutroMaskProps)


def unregister():
    if hasattr(bpy.types.Scene, "neutro_mask"):
        del bpy.types.Scene.neutro_mask
    for cls in reversed(CLASSES):
        bpy.utils.unregister_class(cls)


if __name__ == "__main__":
    register()
