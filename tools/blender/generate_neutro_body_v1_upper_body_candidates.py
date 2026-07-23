"""
Generate Neutro Body V1 upper-body candidates U1–U4 (shoulders + arms only).

Source (immutable):
  assets/blender/neutro-body/neutro_body_v1_proportions_source.blend
  (= P2 Slightly Taller)

Locked macros:
  muscle=0.40  weight=0.575  height=0.575  proportions=0.50

MPFB local targets (from data/targets/target.json + .target.gz files)
--------------------------------------------------------------------
Shoulders (unsided, range -1..+1, neutral 0):
  measure-shoulder-dist-decr-incr
    negative → measure-shoulder-dist-decr  (narrower)
    positive → measure-shoulder-dist-incr  (wider)
  Also available but NOT used here (too broad / muscle / pose-like):
    torso-scale-horiz-*, torso-vshape-*, torso-trans-*, upperarm-shoulder-muscle-*

Arms volume (sided L/R, range -1..+1, neutral 0) — soft volume, NOT macro muscle:
  upperarm-fat-decr-incr   → l/r-upperarm-fat-decr|incr
  lowerarm-fat-decr-incr   → l/r-lowerarm-fat-decr|incr

Application path (same as Model panel):
  TargetService.load_target / set_target_value via opposed-modifier logic
  (_modelsubpanels._set_opposed_modifier_value)

U2: shoulder slider = 0 + (-1-0)*0.10 = -0.10
U3: upperarm-fat = lowerarm-fat = +0.10 on BOTH sides
U4: U2 + U3

Run:
  blender.exe --background --python tools/blender/generate_neutro_body_v1_upper_body_candidates.py
"""

from __future__ import annotations

import hashlib
import json
import math
import os
import sys
import traceback
from pathlib import Path

import bpy
from mathutils import Vector

SCRIPT_PATH = Path(__file__).resolve()
REPO_ROOT = SCRIPT_PATH.parents[2]
SOURCE_PATH = REPO_ROOT / "assets" / "blender" / "neutro-body" / "neutro_body_v1_proportions_source.blend"
OUT_BLEND_DIR = REPO_ROOT / "assets" / "blender" / "neutro-body" / "upper-body-candidates"
ARTIFACT_DIR = REPO_ROOT / "artifacts" / "body-v1-upper-body"
COMPARISON_PATH = ARTIFACT_DIR / "comparison.json"

LOCKED = {
    "muscle": 0.40,
    "weight": 0.575,
    "height": 0.575,
    "proportions": 0.50,
}

# Opposed-modifier range (FloatProperty min/max from _modelsubpanels.py)
OPPOSED_RANGE = (-1.0, 1.0)
NEUTRAL = 0.0

# Exact displacements from neutral toward extremes
SHOULDER_VALUE = NEUTRAL + (OPPOSED_RANGE[0] - NEUTRAL) * 0.10  # -0.10 → narrower
ARM_FAT_VALUE = NEUTRAL + (OPPOSED_RANGE[1] - NEUTRAL) * 0.10   # +0.10 → fuller soft volume


def log(msg: str) -> None:
    print(f"[neutro-upper] {msg}", flush=True)


def fail(msg: str, code: int = 1) -> None:
    log(f"FAIL: {msg}")
    sys.exit(code)


def sha256_file(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as f:
        for chunk in iter(lambda: f.read(1024 * 1024), b""):
            h.update(chunk)
    return h.hexdigest().upper()


def ensure_mpfb() -> None:
    if "bl_ext.blender_org.mpfb" not in bpy.context.preferences.addons.keys():
        fail("MPFB not enabled")
    import bl_ext.blender_org.mpfb  # noqa: F401


def open_blend(path: Path) -> None:
    if not path.is_file():
        fail(f"Missing: {path}")
    bpy.ops.wm.open_mainfile(filepath=str(path))
    log(f"Opened {path.name}")


def find_human() -> bpy.types.Object:
    obj = bpy.data.objects.get("Human")
    if obj is None:
        meshes = [o for o in bpy.data.objects if o.type == "MESH"]
        if len(meshes) != 1:
            fail(f"Expected Human, found {[o.name for o in meshes]}")
        obj = meshes[0]
    bpy.ops.object.select_all(action="DESELECT")
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj
    return obj


def read_macro(basemesh: bpy.types.Object, name: str) -> float:
    from bl_ext.blender_org.mpfb.entities.objectproperties import HumanObjectProperties

    v = HumanObjectProperties.get_value(name, entity_reference=basemesh)
    if v is None:
        fail(f"Macro {name} is None")
    return float(v)


def assert_locked_macros(basemesh: bpy.types.Object) -> None:
    for k, expected in LOCKED.items():
        got = read_macro(basemesh, k)
        if abs(got - expected) > 1e-3:
            fail(f"Macro lock broken: {k}={got} expected {expected}")


def targets_dir() -> str:
    from bl_ext.blender_org.mpfb.services import LocationService

    return LocationService.get_mpfb_data("targets")


def set_opposed_unsided(basemesh: bpy.types.Object, section: str, positive: str, negative: str, value: float) -> None:
    """Mirror _set_opposed_modifier_value for unsided targets."""
    from bl_ext.blender_org.mpfb.services import ObjectService, TargetService

    ObjectService.activate_blender_object(basemesh)
    root = targets_dir()
    value = float(max(OPPOSED_RANGE[0], min(OPPOSED_RANGE[1], value)))

    if value < 0.0001 and TargetService.has_target(basemesh, positive):
        TargetService.set_target_value(basemesh, positive, 0.0, delete_target_on_zero=True)
    if value > -0.0001 and TargetService.has_target(basemesh, negative):
        TargetService.set_target_value(basemesh, negative, 0.0, delete_target_on_zero=True)

    if value > 0.0:
        if not TargetService.has_target(basemesh, positive):
            path = os.path.join(root, section, positive + ".target.gz")
            TargetService.load_target(basemesh, path, weight=value, name=positive)
        else:
            TargetService.set_target_value(basemesh, positive, value, delete_target_on_zero=True)
    if value < 0.0:
        if not TargetService.has_target(basemesh, negative):
            path = os.path.join(root, section, negative + ".target.gz")
            TargetService.load_target(basemesh, path, weight=abs(value), name=negative)
        else:
            TargetService.set_target_value(basemesh, negative, abs(value), delete_target_on_zero=True)
    log(f"Opposed unsided {section}/{positive}|{negative} = {value:.4f}")


def set_opposed_sided(
    basemesh: bpy.types.Object,
    section: str,
    *,
    pos_l: str,
    pos_r: str,
    neg_l: str,
    neg_r: str,
    value: float,
) -> None:
    """Apply identical opposed value to left and right (forced symmetry)."""
    from bl_ext.blender_org.mpfb.services import ObjectService, TargetService

    ObjectService.activate_blender_object(basemesh)
    root = targets_dir()
    value = float(max(OPPOSED_RANGE[0], min(OPPOSED_RANGE[1], value)))

    for positive, negative in ((pos_l, neg_l), (pos_r, neg_r)):
        if value < 0.0001 and TargetService.has_target(basemesh, positive):
            TargetService.set_target_value(basemesh, positive, 0.0, delete_target_on_zero=True)
        if value > -0.0001 and TargetService.has_target(basemesh, negative):
            TargetService.set_target_value(basemesh, negative, 0.0, delete_target_on_zero=True)
        if value > 0.0:
            if not TargetService.has_target(basemesh, positive):
                path = os.path.join(root, section, positive + ".target.gz")
                TargetService.load_target(basemesh, path, weight=value, name=positive)
            else:
                TargetService.set_target_value(basemesh, positive, value, delete_target_on_zero=True)
        if value < 0.0:
            if not TargetService.has_target(basemesh, negative):
                path = os.path.join(root, section, negative + ".target.gz")
                TargetService.load_target(basemesh, path, weight=abs(value), name=negative)
            else:
                TargetService.set_target_value(basemesh, negative, abs(value), delete_target_on_zero=True)
    log(f"Opposed sided {section} L/R = {value:.4f}")


def apply_narrow_shoulders(basemesh: bpy.types.Object) -> dict:
    set_opposed_unsided(
        basemesh,
        "torso",
        positive="measure-shoulder-dist-incr",
        negative="measure-shoulder-dist-decr",
        value=SHOULDER_VALUE,
    )
    return {
        "category": "measure-shoulder-dist-decr-incr",
        "section": "torso",
        "value": SHOULDER_VALUE,
        "meaning": "negative = narrower shoulder distance",
    }


def apply_natural_arms(basemesh: bpy.types.Object) -> list[dict]:
    set_opposed_sided(
        basemesh,
        "arms",
        pos_l="l-upperarm-fat-incr",
        pos_r="r-upperarm-fat-incr",
        neg_l="l-upperarm-fat-decr",
        neg_r="r-upperarm-fat-decr",
        value=ARM_FAT_VALUE,
    )
    set_opposed_sided(
        basemesh,
        "arms",
        pos_l="l-lowerarm-fat-incr",
        pos_r="r-lowerarm-fat-incr",
        neg_l="l-lowerarm-fat-decr",
        neg_r="r-lowerarm-fat-decr",
        value=ARM_FAT_VALUE,
    )
    return [
        {
            "category": "upperarm-fat-decr-incr",
            "section": "arms",
            "valueLeft": ARM_FAT_VALUE,
            "valueRight": ARM_FAT_VALUE,
            "meaning": "positive = soft upper-arm volume (fat), not macro muscle",
        },
        {
            "category": "lowerarm-fat-decr-incr",
            "section": "arms",
            "valueLeft": ARM_FAT_VALUE,
            "valueRight": ARM_FAT_VALUE,
            "meaning": "positive = soft forearm volume (fat)",
        },
    ]


# ---------------------------------------------------------------------------
# Geometry helpers
# ---------------------------------------------------------------------------

def depsgraph_eval(obj: bpy.types.Object):
    return obj.evaluated_get(bpy.context.evaluated_depsgraph_get())


def _set_masks(obj: bpy.types.Object, enabled: bool) -> list:
    prior = []
    for m in obj.modifiers:
        if m.type == "MASK":
            prior.append((m, m.show_viewport, m.show_render))
            m.show_viewport = enabled
            m.show_render = enabled
    if prior:
        bpy.context.view_layer.update()
    return prior


def _restore_masks(prior: list) -> None:
    for m, vp, rr in prior:
        m.show_viewport = vp
        m.show_render = rr
    if prior:
        bpy.context.view_layer.update()


def world_bbox(obj: bpy.types.Object) -> tuple[Vector, Vector]:
    ev = depsgraph_eval(obj)
    corners = [ev.matrix_world @ Vector(c) for c in ev.bound_box]
    xs = [c.x for c in corners]
    ys = [c.y for c in corners]
    zs = [c.z for c in corners]
    return Vector((min(xs), min(ys), min(zs))), Vector((max(xs), max(ys), max(zs)))


def group_centroid(obj: bpy.types.Object, name: str, wmin: float = 0.3) -> Vector | None:
    if name not in obj.vertex_groups:
        return None
    prior = _set_masks(obj, False)
    try:
        ev = depsgraph_eval(obj)
        mesh = ev.to_mesh()
        try:
            use_orig = len(mesh.vertices) != len(obj.data.vertices)
            verts = obj.data.vertices if use_orig else mesh.vertices
            matrix = obj.matrix_world if use_orig else ev.matrix_world
            gidx = obj.vertex_groups[name].index
            pts = []
            for i, v in enumerate(obj.data.vertices):
                w = 0.0
                for g in v.groups:
                    if g.group == gidx:
                        w = g.weight
                        break
                if w >= wmin:
                    pts.append(matrix @ verts[i].co)
            if not pts:
                return None
            acc = Vector((0, 0, 0))
            for p in pts:
                acc += p
            return acc / len(pts)
        finally:
            ev.to_mesh_clear()
    finally:
        _restore_masks(prior)


def verts_in_groups(obj: bpy.types.Object, group_names: list[str], wmin: float = 0.2) -> list[Vector]:
    names = [n for n in group_names if n in obj.vertex_groups]
    if not names:
        return []
    idxs = {obj.vertex_groups[n].index for n in names}
    prior = _set_masks(obj, False)
    try:
        ev = depsgraph_eval(obj)
        mesh = ev.to_mesh()
        try:
            use_orig = len(mesh.vertices) != len(obj.data.vertices)
            verts = obj.data.vertices if use_orig else mesh.vertices
            matrix = obj.matrix_world if use_orig else ev.matrix_world
            out = []
            for i, v in enumerate(obj.data.vertices):
                for g in v.groups:
                    if g.group in idxs and g.weight >= wmin:
                        out.append(matrix @ verts[i].co)
                        break
            return out
        finally:
            ev.to_mesh_clear()
    finally:
        _restore_masks(prior)


def estimate_triangles(mesh) -> int:
    return sum(max(0, len(p.vertices) - 2) for p in mesh.polygons)


def measure_upper(obj: bpy.types.Object) -> dict:
    mn, mx = world_bbox(obj)
    dims = mx - mn

    l_clav = group_centroid(obj, "joint-l-clavicle")
    r_clav = group_centroid(obj, "joint-r-clavicle")
    l_elbow = group_centroid(obj, "joint-l-elbow")
    r_elbow = group_centroid(obj, "joint-r-elbow")
    l_hand = group_centroid(obj, "joint-l-hand")
    r_hand = group_centroid(obj, "joint-r-hand")
    l_wrist = group_centroid(obj, "joint-l-wrist") or l_hand
    r_wrist = group_centroid(obj, "joint-r-wrist") or r_hand

    # Shoulder width: lateral span of body verts near clavicle Z (more reliable than tiny joint cubes alone)
    shoulder_width = "No fiable"
    shoulder_z = None
    if l_clav and r_clav:
        shoulder_z = (l_clav.z + r_clav.z) * 0.5
        band = 0.06
        body_pts = verts_in_groups(obj, ["body"], 0.15)
        band_pts = [p for p in body_pts if abs(p.z - shoulder_z) <= band]
        if len(band_pts) >= 20:
            xs = [p.x for p in band_pts]
            shoulder_width = float(max(xs) - min(xs))
        else:
            # fallback joint distance (often underestimates)
            shoulder_width = "No fiable"

    # Upper-arm / forearm length
    def avg_len(a, b, c, d):
        if a and b and c and d:
            return float(((b - a).length + (d - c).length) * 0.5)
        return "No fiable"

    upper_arm_len = avg_len(l_clav, l_elbow, r_clav, r_elbow)
    forearm_len = avg_len(l_elbow, l_wrist, r_elbow, r_wrist)

    # Thickness proxies: local bbox of arm verts around mid upper-arm / mid forearm
    def segment_thickness(p0, p1, side_prefix: str) -> float | str:
        if p0 is None or p1 is None:
            return "No fiable"
        mid = (p0 + p1) * 0.5
        # Collect nearby body verts
        pts = verts_in_groups(obj, ["body", "Left", "Right"], 0.1)
        if not pts:
            return "No fiable"
        axis = (p1 - p0)
        length = axis.length
        if length < 1e-6:
            return "No fiable"
        axis_n = axis / length
        near = []
        for p in pts:
            rel = p - p0
            t = rel.dot(axis_n) / length
            if 0.25 <= t <= 0.75:
                radial = (rel - axis_n * rel.dot(axis_n)).length
                if radial < 0.12:  # within arm envelope
                    near.append(p)
        if len(near) < 8:
            return "No fiable"
        # Thickness ≈ mean diameter in plane perpendicular to axis (use YZ or XZ variance)
        # Approximate as 2 * mean radial distance
        rads = []
        for p in near:
            rel = p - mid
            rads.append((rel - axis_n * rel.dot(axis_n)).length)
        return float(2.0 * (sum(rads) / len(rads)))

    upper_arm_th = segment_thickness(l_clav, l_elbow, "l")
    if isinstance(upper_arm_th, float):
        th_r = segment_thickness(r_clav, r_elbow, "r")
        if isinstance(th_r, float):
            upper_arm_th = (upper_arm_th + th_r) * 0.5

    forearm_th = segment_thickness(l_elbow, l_wrist, "l")
    if isinstance(forearm_th, float):
        th_r = segment_thickness(r_elbow, r_wrist, "r")
        if isinstance(th_r, float):
            forearm_th = (forearm_th + th_r) * 0.5

    # Minimum arm–torso gap: min distance from upper-arm midpoints to torso midline slab
    arm_torso_gap = "No fiable"
    if l_elbow and r_elbow and l_clav and r_clav:
        torso_pts = verts_in_groups(obj, ["body"], 0.2)
        # torso candidates: |x| small
        torso_core = [p for p in torso_pts if abs(p.x) < 0.12]
        if torso_core:
            gaps = []
            for mid in ((l_clav + l_elbow) * 0.5, (r_clav + r_elbow) * 0.5):
                dmin = min((p - mid).length for p in torso_core)
                # Approximate clearance toward torso: use |mid.x| - max torso |x| in same Z band
                zband = [p for p in torso_core if abs(p.z - mid.z) < 0.08]
                if zband:
                    max_tx = max(abs(p.x) for p in zband)
                    gaps.append(abs(mid.x) - max_tx)
            if gaps:
                arm_torso_gap = float(min(gaps))

    # Symmetry check: |L-R| shoulder/elbow X
    asymmetry = False
    if l_clav and r_clav and abs(abs(l_clav.x) - abs(r_clav.x)) > 0.01:
        asymmetry = True
    if l_elbow and r_elbow and abs(abs(l_elbow.x) - abs(r_elbow.x)) > 0.015:
        asymmetry = True

    mesh = obj.data
    sk = len(mesh.shape_keys.key_blocks) if mesh.shape_keys else 0

    unreliable = []
    if shoulder_width == "No fiable":
        unreliable.append("shoulderWidth (insufficient band verts or joint-only fallback)")
    if upper_arm_th == "No fiable":
        unreliable.append("upperArmThickness")
    if forearm_th == "No fiable":
        unreliable.append("forearmThickness")
    if arm_torso_gap == "No fiable":
        unreliable.append("minimumArmTorsoGap")

    return {
        "dimensions": {"x": float(dims.x), "y": float(dims.y), "z": float(dims.z)},
        "shoulderWidth": shoulder_width,
        "upperTorsoWidthApprox": float(dims.x),  # full bbox — not shoulder-specific
        "upperArmLengthApprox": upper_arm_len,
        "forearmLengthApprox": forearm_len,
        "upperArmThickness": upper_arm_th,
        "forearmThickness": forearm_th,
        "minimumArmTorsoGap": arm_torso_gap,
        "asymmetryDetected": asymmetry,
        "unreliable": unreliable,
        "vertexCount": len(mesh.vertices),
        "faceCount": len(mesh.polygons),
        "triangleCount": estimate_triangles(mesh),
        "shapeKeyCount": sk,
    }


def pct_change(new, base):
    if not isinstance(new, (int, float)) or not isinstance(base, (int, float)) or base == 0:
        return "No fiable"
    return float((new - base) / abs(base) * 100.0)


# ---------------------------------------------------------------------------
# Rendering
# ---------------------------------------------------------------------------

def clear_diag() -> None:
    for name in list(bpy.data.objects.keys()):
        if name.startswith(("NeutroDiag", "NeutroKey", "NeutroFill", "NeutroRim")):
            bpy.data.objects.remove(bpy.data.objects[name], do_unlink=True)
    for block in (bpy.data.lights, bpy.data.cameras, bpy.data.worlds):
        for item in list(block):
            if item.name.startswith(("NeutroDiag", "NeutroKey", "NeutroFill", "NeutroRim")):
                block.remove(item)


def setup_studio(lens: float = 50.0) -> bpy.types.Object:
    scene = bpy.context.scene
    try:
        scene.render.engine = "BLENDER_EEVEE_NEXT"
    except TypeError:
        scene.render.engine = "CYCLES"
        scene.cycles.samples = 28
    scene.render.resolution_x = 1024
    scene.render.resolution_y = 1024
    scene.render.image_settings.file_format = "PNG"
    scene.render.film_transparent = False

    world = bpy.data.worlds.new("NeutroDiagWorld")
    scene.world = world
    world.use_nodes = True
    nodes = world.node_tree.nodes
    links = world.node_tree.links
    nodes.clear()
    bg = nodes.new("ShaderNodeBackground")
    bg.inputs[0].default_value = (0.035, 0.036, 0.038, 1.0)
    out = nodes.new("ShaderNodeOutputWorld")
    links.new(bg.outputs[0], out.inputs[0])

    def add_light(name, energy, loc, size):
        d = bpy.data.lights.new(name, type="AREA")
        d.energy = energy
        d.size = size
        o = bpy.data.objects.new(name, d)
        bpy.context.collection.objects.link(o)
        o.location = loc

    add_light("NeutroKey", 250.0, (2.2, -2.5, 2.4), 2.5)
    add_light("NeutroFill", 90.0, (-2.5, -1.5, 1.8), 3.0)
    add_light("NeutroRim", 120.0, (0.0, 3.0, 2.2), 2.0)

    cam_d = bpy.data.cameras.new("NeutroDiagCamera")
    cam_d.lens = lens
    cam = bpy.data.objects.new("NeutroDiagCamera", cam_d)
    bpy.context.collection.objects.link(cam)
    scene.camera = cam
    return cam


def apply_clay(obj: bpy.types.Object) -> list:
    originals = [s.material for s in obj.material_slots]
    clay = bpy.data.materials.get("NeutroDiagClay")
    if clay is None:
        clay = bpy.data.materials.new("NeutroDiagClay")
        clay.use_nodes = True
        nodes = clay.node_tree.nodes
        links = clay.node_tree.links
        nodes.clear()
        bsdf = nodes.new("ShaderNodeBsdfPrincipled")
        bsdf.inputs["Base Color"].default_value = (0.72, 0.62, 0.52, 1.0)
        bsdf.inputs["Roughness"].default_value = 0.55
        out = nodes.new("ShaderNodeOutputMaterial")
        links.new(bsdf.outputs[0], out.inputs[0])
    if not obj.material_slots:
        obj.data.materials.append(clay)
    else:
        for i in range(len(obj.material_slots)):
            obj.material_slots[i].material = clay
    return originals


def restore_mats(obj: bpy.types.Object, originals: list) -> None:
    while len(obj.material_slots) < len(originals):
        obj.data.materials.append(None)
    for i, m in enumerate(originals):
        obj.material_slots[i].material = m


def place_camera(cam, view: str, center: Vector, radius: float) -> None:
    if view == "three-quarter":
        # ~35° from front, slightly elevated
        a = math.radians(35)
        elev = radius * 0.12
        cam.location = (
            center.x + radius * math.sin(a),
            center.y - radius * math.cos(a),
            center.z + elev,
        )
    else:
        angles = {"front": 0.0, "back": math.pi, "left": math.pi / 2, "right": -math.pi / 2}
        a = angles[view]
        cam.location = (
            center.x + radius * math.sin(a),
            center.y - radius * math.cos(a),
            center.z,
        )
    direction = center - cam.location
    cam.rotation_euler = direction.to_track_quat("-Z", "Y").to_euler()


def render_views(prefix: str, human: bpy.types.Object, cam_cfg: dict) -> dict:
    ARTIFACT_DIR.mkdir(parents=True, exist_ok=True)
    clear_diag()
    cam = setup_studio(50.0)
    originals = apply_clay(human)
    # Fixed framing from source camera config (same for all candidates)
    center = Vector(cam_cfg["center"])
    radius = cam_cfg["radius"]
    paths = {}
    try:
        for view in ("front", "back", "left", "right", "three-quarter"):
            place_camera(cam, view, center, radius)
            out = ARTIFACT_DIR / f"{prefix}-{view}.png"
            bpy.context.scene.render.filepath = str(out)
            bpy.context.scene.render.resolution_x = 1024
            bpy.context.scene.render.resolution_y = 1024
            log(f"Render {out.name}")
            bpy.ops.render.render(write_still=True)
            if not out.exists():
                fail(f"Missing {out}")
            paths[view] = str(out.as_posix())
    finally:
        restore_mats(human, originals)
        clear_diag()
    return paths


def append_human(blend: Path, name: str) -> bpy.types.Object:
    with bpy.data.libraries.load(str(blend), link=False) as (df, dt):
        dt.objects = [n for n in df.objects if n == "Human"][:1] or list(df.objects)[:1]
    obj = dt.objects[0]
    bpy.context.collection.objects.link(obj)
    obj.name = name
    return obj


def render_comparison(blend_paths: list[tuple[str, Path]], out_name: str, view: str, cam_cfg: dict) -> str:
    open_blend(SOURCE_PATH)
    for o in list(bpy.data.objects):
        bpy.data.objects.remove(o, do_unlink=True)

    humans = []
    for label, path in blend_paths:
        h = append_human(path, f"NeutroCmp_{label}")
        apply_clay(h)
        humans.append(h)

    spacing = 1.25
    for i, h in enumerate(humans):
        bpy.context.view_layer.update()
        mn, mx = world_bbox(h)
        h.location.z += -mn.z
        bpy.context.view_layer.update()
        mn, mx = world_bbox(h)
        cx = (i - 1.5) * spacing
        cur = (mn.x + mx.x) * 0.5
        h.location.x += cx - cur
        bpy.context.view_layer.update()

    all_min = Vector((1e9, 1e9, 1e9))
    all_max = Vector((-1e9, -1e9, -1e9))
    for h in humans:
        mn, mx = world_bbox(h)
        all_min = Vector((min(all_min.x, mn.x), min(all_min.y, mn.y), min(all_min.z, mn.z)))
        all_max = Vector((max(all_max.x, mx.x), max(all_max.y, mx.y), max(all_max.z, mx.z)))
    center = (all_min + all_max) * 0.5
    span_x = float(all_max.x - all_min.x)
    span_z = float(all_max.z - all_min.z)
    radius = max(span_x * 1.15, span_z * 1.55, 4.5)

    clear_diag()
    cam = setup_studio(35.0)
    place_camera(cam, view, center, radius)
    sc = bpy.context.scene
    sc.render.resolution_x = 2048
    sc.render.resolution_y = 1024
    out = ARTIFACT_DIR / out_name
    sc.render.filepath = str(out)
    log(f"Comparison {out.name} view={view}")
    bpy.ops.render.render(write_still=True)
    if not out.exists():
        fail(f"Missing comparison {out}")
    return str(out.as_posix())


def save_copy(path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    if path.resolve() == SOURCE_PATH.resolve():
        fail("Refusing to overwrite proportions source")
    bpy.ops.wm.save_as_mainfile(filepath=str(path), copy=True)
    log(f"Saved {path.name}")


def main() -> None:
    log(f"Blender {bpy.app.version_string}")
    ensure_mpfb()

    sha0 = sha256_file(SOURCE_PATH)
    log(f"Source SHA-256: {sha0}")

    open_blend(SOURCE_PATH)
    human = find_human()
    assert_locked_macros(human)

    mn, mx = world_bbox(human)
    center = (mn + mx) * 0.5
    dims = mx - mn
    cam_cfg = {
        "center": [float(center.x), float(center.y), float(center.z)],
        "radius": float(max(dims.z, max(dims.x, dims.y)) * 1.35),
        "lens": 50.0,
    }

    inventory = {
        "shoulders": [
            {
                "target": "measure-shoulder-dist-decr-incr",
                "files": ["torso/measure-shoulder-dist-decr.target.gz", "torso/measure-shoulder-dist-incr.target.gz"],
                "range": list(OPPOSED_RANGE),
                "neutral": NEUTRAL,
                "side": "bilateral/unsided",
                "effect": "Shoulder distance (width). Negative=narrower, positive=wider.",
                "kind": "anchura de hombros",
                "selectedForU2": True,
            },
            {
                "target": "torso-vshape-decr-incr",
                "range": list(OPPOSED_RANGE),
                "neutral": NEUTRAL,
                "side": "unsided",
                "effect": "V-shape torso (shoulders vs hips). Rejected: affects hips/torso globally.",
                "kind": "anchura/proporción torso",
                "selectedForU2": False,
            },
            {
                "target": "torso-scale-horiz-decr-incr",
                "range": list(OPPOSED_RANGE),
                "neutral": NEUTRAL,
                "side": "unsided",
                "effect": "Horizontal torso scale. Rejected: affects chest/waist.",
                "kind": "anchura torso",
                "selectedForU2": False,
            },
            {
                "target": "upperarm-shoulder-muscle-decr-incr",
                "range": list(OPPOSED_RANGE),
                "neutral": NEUTRAL,
                "side": "left/right",
                "effect": "Deltoid muscle. Rejected: fitness look.",
                "kind": "volumen muscular hombro",
                "selectedForU2": False,
            },
        ],
        "arms": [
            {
                "target": "upperarm-fat-decr-incr",
                "range": list(OPPOSED_RANGE),
                "neutral": NEUTRAL,
                "side": "left/right",
                "effect": "Soft upper-arm volume (fat). Selected for U3.",
                "kind": "volumen/grosor",
                "selectedForU3": True,
            },
            {
                "target": "lowerarm-fat-decr-incr",
                "range": list(OPPOSED_RANGE),
                "neutral": NEUTRAL,
                "side": "left/right",
                "effect": "Soft forearm volume (fat). Selected for U3.",
                "kind": "volumen/grosor",
                "selectedForU3": True,
            },
            {
                "target": "upperarm-muscle-decr-incr / lowerarm-muscle-decr-incr",
                "range": list(OPPOSED_RANGE),
                "neutral": NEUTRAL,
                "side": "left/right",
                "effect": "Local muscle. Rejected: fitness definition.",
                "kind": "volumen muscular",
                "selectedForU3": False,
            },
            {
                "target": "upperarm-scale-horiz/depth/vert + lowerarm-scale-*",
                "range": list(OPPOSED_RANGE),
                "neutral": NEUTRAL,
                "side": "left/right",
                "effect": "Geometric scale axes. Not used this step (fat preferred for soft Natural Soft).",
                "kind": "volumen/escala",
                "selectedForU3": False,
            },
            {
                "target": "measure-upperarm-length / measure-lowerarm-length / measure-upperarm-circ",
                "range": list(OPPOSED_RANGE),
                "neutral": NEUTRAL,
                "side": "unsided",
                "effect": "Length/circumference measures. Not used (no length change requested).",
                "kind": "longitud / circunferencia",
                "selectedForU3": False,
            },
        ],
    }

    profiles = [
        {
            "id": "U1",
            "key": "candidateU1",
            "name": "neutro_body_v1_u1_current",
            "label": "Current",
            "prefix": "u1-current",
            "blend": OUT_BLEND_DIR / "neutro_body_v1_u1_current.blend",
            "shoulders": False,
            "arms": False,
        },
        {
            "id": "U2",
            "key": "candidateU2",
            "name": "neutro_body_v1_u2_narrow_shoulders",
            "label": "Slightly Narrower Shoulders",
            "prefix": "u2-narrow-shoulders",
            "blend": OUT_BLEND_DIR / "neutro_body_v1_u2_narrow_shoulders.blend",
            "shoulders": True,
            "arms": False,
        },
        {
            "id": "U3",
            "key": "candidateU3",
            "name": "neutro_body_v1_u3_natural_arms",
            "label": "Natural Arms",
            "prefix": "u3-natural-arms",
            "blend": OUT_BLEND_DIR / "neutro_body_v1_u3_natural_arms.blend",
            "shoulders": False,
            "arms": True,
        },
        {
            "id": "U4",
            "key": "candidateU4",
            "name": "neutro_body_v1_u4_narrow_shoulders_natural_arms",
            "label": "Narrow Shoulders + Natural Arms",
            "prefix": "u4-narrow-shoulders-natural-arms",
            "blend": OUT_BLEND_DIR / "neutro_body_v1_u4_narrow_shoulders_natural_arms.blend",
            "shoulders": True,
            "arms": True,
        },
    ]

    comparison = {
        "source": str(SOURCE_PATH.as_posix()),
        "sourceSha256": sha0,
        "lockedMacros": LOCKED,
        "opposedRange": list(OPPOSED_RANGE),
        "derivedValues": {
            "shoulderValue": SHOULDER_VALUE,
            "armFatValue": ARM_FAT_VALUE,
            "formulas": {
                "shoulder": "0 + (-1-0)*0.10 = -0.10",
                "armFat": "0 + (1-0)*0.10 = +0.10",
            },
        },
        "targetInventory": inventory,
        "camera": cam_cfg,
    }

    expected_v = expected_f = expected_t = None
    u1_meas = None
    blend_list = []

    for profile in profiles:
        log(f"=== {profile['id']} — {profile['label']} ===")
        open_blend(SOURCE_PATH)
        human = find_human()
        assert_locked_macros(human)

        applied = {"shoulders": None, "arms": []}
        if profile["shoulders"]:
            applied["shoulders"] = apply_narrow_shoulders(human)
        if profile["arms"]:
            applied["arms"] = apply_natural_arms(human)

        assert_locked_macros(human)
        meas = measure_upper(human)

        if expected_v is None:
            expected_v, expected_f, expected_t = meas["vertexCount"], meas["faceCount"], meas["triangleCount"]
            u1_meas = meas
        else:
            if (
                meas["vertexCount"] != expected_v
                or meas["faceCount"] != expected_f
                or meas["triangleCount"] != expected_t
            ):
                fail(f"Topology changed on {profile['id']}")

        deltas = {}
        if u1_meas:
            for key in ("shoulderWidth", "upperArmThickness", "forearmThickness", "minimumArmTorsoGap"):
                deltas[key + "PctVsU1"] = pct_change(meas[key], u1_meas[key])

        save_copy(profile["blend"])
        human = find_human()
        renders = render_views(profile["prefix"], human, cam_cfg)
        blend_list.append((profile["id"], profile["blend"]))

        comparison[profile["key"]] = {
            "name": profile["name"],
            "label": profile["label"],
            "blendPath": str(profile["blend"].as_posix()),
            "macros": {k: read_macro(human, k) for k in LOCKED},
            "targetsApplied": applied,
            "measurements": meas,
            "deltasVsU1": deltas,
            "renders": renders,
        }

    # Side-by-side comparisons
    comparison["comparisons"] = {
        "front": render_comparison(blend_list, "upper-body-front-comparison.png", "front", cam_cfg),
        "back": render_comparison(blend_list, "upper-body-back-comparison.png", "back", cam_cfg),
        "threeQuarter": render_comparison(
            blend_list, "upper-body-three-quarter-comparison.png", "three-quarter", cam_cfg
        ),
    }

    sha1 = sha256_file(SOURCE_PATH)
    comparison["sourceSha256Final"] = sha1
    comparison["sourceUnchanged"] = sha1 == sha0
    if sha1 != sha0:
        fail("Proportions source was modified")

    ARTIFACT_DIR.mkdir(parents=True, exist_ok=True)
    COMPARISON_PATH.write_text(json.dumps(comparison, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    log(f"Wrote {COMPARISON_PATH}")
    log("PASS — upper-body candidates U1–U4 generated")


if __name__ == "__main__":
    try:
        main()
    except SystemExit:
        raise
    except Exception:
        traceback.print_exc()
        fail("Unhandled exception")
