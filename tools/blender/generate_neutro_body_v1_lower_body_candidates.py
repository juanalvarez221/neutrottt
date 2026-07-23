"""
Generate Neutro Body V1 lower-body candidates L1–L4 (hips / glutes / thighs / knees / calves / ankles / feet).

Source (immutable):
  assets/blender/neutro-body/neutro_body_v1_torso_source.blend
  (= T4 Balanced Tattoo Canvas)

Locked macros:
  muscle=0.40  weight=0.575  height=0.575  proportions=0.50

Already-approved local targets (must remain untouched):
  measure-shoulder-dist-decr = 0.10   (slider -0.10)
  l/r-upperarm-fat-incr      = 0.10
  l/r-lowerarm-fat-incr      = 0.10
  torso-muscle-pectoral-decr = 0.08   (slider -0.08)
  stomach-tone-decr          = 0.08   (slider -0.08)
  stomach-pregnant-incr      = 0.04

Lower-body targets used in this step (range -1..+1, neutral 0):
  legs/upperleg-fat-decr-incr   sided L/R — soft thigh volume (fat, not muscle)
  legs/lowerleg-fat-decr-incr   sided L/R — soft calf volume (fat, not muscle)
  buttocks/buttocks-volume-decr-incr  unsided — glute volume
  hip/hip-scale-depth-decr-incr       unsided — hip front/back depth (subtle organic hips)

Explicitly NOT used:
  upperleg-muscle-* / lowerleg-muscle-* positive  (fitness look)
  hip-scale-horiz-*      (widens hips laterally → curvy/feminized silhouette)
  hip-trans-* / hip-waist-* / leg-valgus-* / foot-trans-*  (position/pose-like)
  measure-*-circ         (broad perimeter scaling; fat preferred)
  torso-vshape-*         (locked shoulder/hip relation)

Candidates:
  L1 Current             : control, no new targets
  L2 Natural Legs        : upperleg-fat +0.10 L/R, lowerleg-fat +0.08 L/R
  L3 Balanced Hips       : buttocks-volume +0.06, hip-scale-depth +0.05
  L4 Balanced Lower Body : exactly L2 + L3

Run:
  blender.exe --background --python tools/blender/generate_neutro_body_v1_lower_body_candidates.py
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
SOURCE_PATH = REPO_ROOT / "assets" / "blender" / "neutro-body" / "neutro_body_v1_torso_source.blend"
OUT_BLEND_DIR = REPO_ROOT / "assets" / "blender" / "neutro-body" / "lower-body-candidates"
ARTIFACT_DIR = REPO_ROOT / "artifacts" / "body-v1-lower-body"
COMPARISON_PATH = ARTIFACT_DIR / "comparison.json"

LOCKED = {
    "muscle": 0.40,
    "weight": 0.575,
    "height": 0.575,
    "proportions": 0.50,
}

FIXED_LOCAL = {
    "measure-shoulder-dist-decr": 0.10,
    "l-upperarm-fat-incr": 0.10,
    "r-upperarm-fat-incr": 0.10,
    "l-lowerarm-fat-incr": 0.10,
    "r-lowerarm-fat-incr": 0.10,
    "torso-muscle-pectoral-decr": 0.08,
    "stomach-tone-decr": 0.08,
    "stomach-pregnant-incr": 0.04,
}

OPPOSED_RANGE = (-1.0, 1.0)
NEUTRAL = 0.0

VIEWS = ("front", "back", "left", "right", "three-quarter-front", "three-quarter-back")


def log(msg: str) -> None:
    print(f"[neutro-lower] {msg}", flush=True)


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


def assert_fixed_local_targets(basemesh: bpy.types.Object) -> None:
    sk = basemesh.data.shape_keys
    if not sk:
        fail("No shape keys on basemesh")
    for name, expected in FIXED_LOCAL.items():
        kb = sk.key_blocks.get(name)
        if kb is None:
            fail(f"Fixed local target missing: {name}")
        if abs(kb.value - expected) > 1e-3:
            fail(f"Fixed local target changed: {name}={kb.value} expected {expected}")


def targets_dir() -> str:
    from bl_ext.blender_org.mpfb.services import LocationService

    return LocationService.get_mpfb_data("targets")


def _apply_opposed(basemesh, section: str, positive: str, negative: str, value: float) -> None:
    from bl_ext.blender_org.mpfb.services import TargetService

    root = targets_dir()
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


def set_opposed_unsided(basemesh, section: str, positive: str, negative: str, value: float) -> None:
    from bl_ext.blender_org.mpfb.services import ObjectService

    ObjectService.activate_blender_object(basemesh)
    value = float(max(OPPOSED_RANGE[0], min(OPPOSED_RANGE[1], value)))
    _apply_opposed(basemesh, section, positive, negative, value)
    log(f"Opposed unsided {section}/{positive}|{negative} = {value:.4f}")


def set_opposed_sided(basemesh, section: str, base: str, value: float) -> None:
    """Apply identical opposed value to l-/r- variants (forced symmetry)."""
    from bl_ext.blender_org.mpfb.services import ObjectService

    ObjectService.activate_blender_object(basemesh)
    value = float(max(OPPOSED_RANGE[0], min(OPPOSED_RANGE[1], value)))
    for side in ("l", "r"):
        _apply_opposed(basemesh, section, f"{side}-{base}-incr", f"{side}-{base}-decr", value)
    log(f"Opposed sided {section}/{base} L/R = {value:.4f}")


LOWER_TARGET_APPLIERS = {
    "upperleg-fat": lambda h, v: set_opposed_sided(h, "legs", "upperleg-fat", v),
    "lowerleg-fat": lambda h, v: set_opposed_sided(h, "legs", "lowerleg-fat", v),
    "buttocks-volume": lambda h, v: set_opposed_unsided(
        h, "buttocks", positive="buttocks-volume-incr", negative="buttocks-volume-decr", value=v
    ),
    "hip-scale-depth": lambda h, v: set_opposed_unsided(
        h, "hip", positive="hip-scale-depth-incr", negative="hip-scale-depth-decr", value=v
    ),
}


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


def band(points: list[Vector], z: float, half: float = 0.02) -> list[Vector]:
    return [p for p in points if abs(p.z - z) <= half]


def split_legs(band_pts: list[Vector]) -> tuple[list[Vector], list[Vector]]:
    """Split a band into left (+x) / right (-x) legs. Empty lists if merged."""
    left = [p for p in band_pts if p.x > 0.005]
    right = [p for p in band_pts if p.x < -0.005]
    return left, right


def extent(pts: list[Vector], axis: str) -> float | str:
    if len(pts) < 8:
        return "No fiable"
    vals = [getattr(p, axis) for p in pts]
    return float(max(vals) - min(vals))


def measure_lower(obj: bpy.types.Object) -> dict:
    mn, mx = world_bbox(obj)
    dims = mx - mn

    l_up = group_centroid(obj, "joint-l-upper-leg")
    r_up = group_centroid(obj, "joint-r-upper-leg")
    l_knee = group_centroid(obj, "joint-l-knee")
    r_knee = group_centroid(obj, "joint-r-knee")
    l_ankle = group_centroid(obj, "joint-l-ankle")
    r_ankle = group_centroid(obj, "joint-r-ankle")
    pelvis = group_centroid(obj, "joint-pelvis")
    l_clav = group_centroid(obj, "joint-l-clavicle")
    r_clav = group_centroid(obj, "joint-r-clavicle")

    if not all((l_up, r_up, l_knee, r_knee, l_ankle, r_ankle, pelvis)):
        fail("Missing leg landmarks")

    up_z = (l_up.z + r_up.z) * 0.5
    knee_z = (l_knee.z + r_knee.z) * 0.5
    ankle_z = (l_ankle.z + r_ankle.z) * 0.5

    body_pts = verts_in_groups(obj, ["body"], 0.15)

    # Hip band: trochanter level (widest hip area, just below pelvis joint)
    hip_band = band(body_pts, up_z, 0.03)
    hip_width = extent(hip_band, "x")
    hip_depth = extent(hip_band, "y")

    # Glute depth proxy: full front-back depth at glute apex band (between pelvis and upper-leg joints)
    glute_z = (pelvis.z + up_z) * 0.5
    glute_band = band(body_pts, glute_z, 0.03)
    glute_depth = extent(glute_band, "y")

    # Thigh band: midway hip->knee, per leg
    thigh_z = (up_z + knee_z) * 0.5
    tl, tr = split_legs(band(body_pts, thigh_z, 0.025))
    l_thigh_w, r_thigh_w = extent(tl, "x"), extent(tr, "x")
    l_thigh_d, r_thigh_d = extent(tl, "y"), extent(tr, "y")

    # Calf band: upper third below knee (calf belly)
    calf_z = knee_z - 0.30 * (knee_z - ankle_z)
    cl, cr = split_legs(band(body_pts, calf_z, 0.02))
    l_calf_w, r_calf_w = extent(cl, "x"), extent(cr, "x")
    l_calf_d, r_calf_d = extent(cl, "y"), extent(cr, "y")

    # Ankle band
    al, ar = split_legs(band(body_pts, ankle_z, 0.015))
    l_ankle_w, r_ankle_w = extent(al, "x"), extent(ar, "x")

    def favg(a, b):
        if isinstance(a, float) and isinstance(b, float):
            return (a + b) * 0.5
        return "No fiable"

    ankle_width = favg(l_ankle_w, r_ankle_w)

    # Minimum inner-thigh gap: just below crotch
    gap_z = up_z - 0.06
    gl, gr = split_legs(band(body_pts, gap_z, 0.02))
    inner_gap = "No fiable"
    if len(gl) >= 8 and len(gr) >= 8:
        inner_gap = float(min(p.x for p in gl) - max(p.x for p in gr))

    # Lengths
    thigh_len = float(((l_knee - l_up).length + (r_knee - r_up).length) * 0.5)
    lower_leg_len = float(((l_ankle - l_knee).length + (r_ankle - r_knee).length) * 0.5)
    leg_len = thigh_len + lower_leg_len

    # Shoulder width for hip/shoulder ratio (same method as upper-body step)
    shoulder_width = "No fiable"
    if l_clav and r_clav:
        sh_z = (l_clav.z + r_clav.z) * 0.5
        sh_band = band(body_pts, sh_z, 0.06)
        if len(sh_band) >= 20:
            shoulder_width = extent(sh_band, "x")

    # Feet: length (Y) and width (X) per foot below ankle
    foot_pts = [p for p in body_pts if p.z < ankle_z - 0.01]
    fl = [p for p in foot_pts if p.x > 0.005]
    fr = [p for p in foot_pts if p.x < -0.005]
    l_foot_len, r_foot_len = extent(fl, "y"), extent(fr, "y")
    l_foot_w, r_foot_w = extent(fl, "x"), extent(fr, "x")

    def ratio(a, b):
        if isinstance(a, (int, float)) and isinstance(b, (int, float)) and b != 0:
            return float(a / b)
        return "No fiable"

    def sym_delta(a, b):
        if isinstance(a, float) and isinstance(b, float) and max(a, b) > 0:
            return float(abs(a - b))
        return "No fiable"

    mesh = obj.data
    sk = len(mesh.shape_keys.key_blocks) if mesh.shape_keys else 0

    return {
        "dimensions": {"x": float(dims.x), "y": float(dims.y), "z": float(dims.z)},
        "bandHeightsZ": {
            "hip": float(up_z),
            "glute": float(glute_z),
            "thigh": float(thigh_z),
            "calf": float(calf_z),
            "ankle": float(ankle_z),
            "innerGap": float(gap_z),
        },
        "hipWidth": hip_width,
        "hipDepth": hip_depth,
        "gluteDepth": glute_depth,
        "leftThighThickness": l_thigh_w,
        "rightThighThickness": r_thigh_w,
        "leftThighDepth": l_thigh_d,
        "rightThighDepth": r_thigh_d,
        "leftCalfThickness": l_calf_w,
        "rightCalfThickness": r_calf_w,
        "leftCalfDepth": l_calf_d,
        "rightCalfDepth": r_calf_d,
        "leftAnkleWidth": l_ankle_w,
        "rightAnkleWidth": r_ankle_w,
        "ankleWidth": ankle_width,
        "minimumInnerThighGap": inner_gap,
        "thighLength": thigh_len,
        "lowerLegLength": lower_leg_len,
        "legLength": leg_len,
        "leftFootLength": l_foot_len,
        "rightFootLength": r_foot_len,
        "leftFootWidth": l_foot_w,
        "rightFootWidth": r_foot_w,
        "shoulderWidth": shoulder_width,
        "thighLegRatio": ratio(thigh_len, leg_len),
        "lowerLegLegRatio": ratio(lower_leg_len, leg_len),
        "hipShoulderWidthRatio": ratio(hip_width, shoulder_width),
        "symmetry": {
            "thighDeltaLR": sym_delta(l_thigh_w, r_thigh_w),
            "calfDeltaLR": sym_delta(l_calf_w, r_calf_w),
            "ankleDeltaLR": sym_delta(l_ankle_w, r_ankle_w),
        },
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
    if view == "three-quarter-front":
        a = math.radians(35)
        elev = radius * 0.12
        cam.location = (
            center.x + radius * math.sin(a),
            center.y - radius * math.cos(a),
            center.z + elev,
        )
    elif view == "three-quarter-back":
        a = math.radians(145)
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
    center = Vector(cam_cfg["center"])
    radius = cam_cfg["radius"]
    paths = {}
    try:
        for view in VIEWS:
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


def render_comparison(
    blend_paths: list[tuple[str, Path]],
    out_name: str,
    view: str,
    z_min: float,
    z_max: float,
) -> str:
    """Side-by-side comparison framed on a z-region (lower body / legs)."""
    open_blend(SOURCE_PATH)
    for o in list(bpy.data.objects):
        bpy.data.objects.remove(o, do_unlink=True)

    humans = []
    for label, path in blend_paths:
        h = append_human(path, f"NeutroCmp_{label}")
        apply_clay(h)
        humans.append(h)

    spacing = 1.05
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

    center = Vector(((all_min.x + all_max.x) * 0.5, (all_min.y + all_max.y) * 0.5, (z_min + z_max) * 0.5))
    span_x = float(all_max.x - all_min.x)
    span_z = z_max - z_min
    radius = max(span_x * 0.62, span_z * 1.25, 2.2)

    clear_diag()
    cam = setup_studio(40.0)
    place_camera(cam, view, center, radius)
    sc = bpy.context.scene
    sc.render.resolution_x = 2048
    sc.render.resolution_y = 1024
    out = ARTIFACT_DIR / out_name
    sc.render.filepath = str(out)
    log(f"Comparison {out.name} view={view} z=[{z_min},{z_max}]")
    bpy.ops.render.render(write_still=True)
    if not out.exists():
        fail(f"Missing comparison {out}")
    return str(out.as_posix())


def save_copy(path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    if path.resolve() == SOURCE_PATH.resolve():
        fail("Refusing to overwrite torso source")
    bpy.ops.wm.save_as_mainfile(filepath=str(path), copy=True)
    log(f"Saved {path.name}")


L2_TARGETS = {"upperleg-fat": +0.10, "lowerleg-fat": +0.08}
L3_TARGETS = {"buttocks-volume": +0.06, "hip-scale-depth": +0.05}

PROFILES = [
    {
        "id": "L1",
        "key": "candidateL1",
        "name": "neutro_body_v1_l1_current",
        "label": "Current",
        "prefix": "l1-current",
        "blend": OUT_BLEND_DIR / "neutro_body_v1_l1_current.blend",
        "targets": {},
    },
    {
        "id": "L2",
        "key": "candidateL2",
        "name": "neutro_body_v1_l2_natural_legs",
        "label": "Natural Legs",
        "prefix": "l2-natural-legs",
        "blend": OUT_BLEND_DIR / "neutro_body_v1_l2_natural_legs.blend",
        "targets": dict(L2_TARGETS),
    },
    {
        "id": "L3",
        "key": "candidateL3",
        "name": "neutro_body_v1_l3_balanced_hips",
        "label": "Balanced Hips",
        "prefix": "l3-balanced-hips",
        "blend": OUT_BLEND_DIR / "neutro_body_v1_l3_balanced_hips.blend",
        "targets": dict(L3_TARGETS),
    },
    {
        "id": "L4",
        "key": "candidateL4",
        "name": "neutro_body_v1_l4_balanced_lower_body",
        "label": "Balanced Lower Body",
        "prefix": "l4-balanced-lower-body",
        "blend": OUT_BLEND_DIR / "neutro_body_v1_l4_balanced_lower_body.blend",
        "targets": {**L2_TARGETS, **L3_TARGETS},
    },
]


def main() -> None:
    log(f"Blender {bpy.app.version_string}")
    ensure_mpfb()

    sha0 = sha256_file(SOURCE_PATH)
    log(f"Source SHA-256: {sha0}")

    open_blend(SOURCE_PATH)
    human = find_human()
    assert_locked_macros(human)
    assert_fixed_local_targets(human)

    mn, mx = world_bbox(human)
    center = (mn + mx) * 0.5
    dims = mx - mn
    cam_cfg = {
        "center": [float(center.x), float(center.y), float(center.z)],
        "radius": float(max(dims.z, max(dims.x, dims.y)) * 1.35),
        "lens": 50.0,
    }

    comparison = {
        "source": str(SOURCE_PATH.as_posix()),
        "sourceSha256": sha0,
        "lockedMacros": LOCKED,
        "fixedLocalTargets": FIXED_LOCAL,
        "opposedRange": list(OPPOSED_RANGE),
        "camera": cam_cfg,
        "lowerTargetsUsed": {
            "upperleg-fat-decr-incr": "sided L/R — soft thigh volume (fat), symmetric",
            "lowerleg-fat-decr-incr": "sided L/R — soft calf volume (fat), symmetric",
            "buttocks-volume-decr-incr": "unsided — glute volume, subtle",
            "hip-scale-depth-decr-incr": "unsided — hip front/back depth, subtle organic hips",
        },
        "lowerTargetsRejected": {
            "upperleg-muscle / lowerleg-muscle (positive)": "fitness look",
            "hip-scale-horiz": "widens hips laterally → curvy/feminized silhouette",
            "hip-trans-*, hip-waist-*, leg-valgus-*, foot-trans-*": "position/pose-like changes",
            "measure-thigh/calf/knee/ankle-circ": "broad perimeter scale; fat preferred",
            "upperlegs-height / lowerlegs-height / measure-*-height": "length changes locked with proportions",
            "foot-scale-*": "feet proportion already correct vs leg (verified in L1)",
        },
    }

    expected_v = expected_f = expected_t = None
    l1_meas = None
    blend_list = []

    for profile in PROFILES:
        log(f"=== {profile['id']} — {profile['label']} ===")
        open_blend(SOURCE_PATH)
        human = find_human()
        assert_locked_macros(human)
        assert_fixed_local_targets(human)

        applied = {}
        for tname, tvalue in profile["targets"].items():
            LOWER_TARGET_APPLIERS[tname](human, tvalue)
            applied[tname] = tvalue

        assert_locked_macros(human)
        assert_fixed_local_targets(human)
        meas = measure_lower(human)

        if expected_v is None:
            expected_v, expected_f, expected_t = meas["vertexCount"], meas["faceCount"], meas["triangleCount"]
            l1_meas = meas
        else:
            if (
                meas["vertexCount"] != expected_v
                or meas["faceCount"] != expected_f
                or meas["triangleCount"] != expected_t
            ):
                fail(f"Topology changed on {profile['id']}")

        deltas = {}
        if l1_meas:
            for key in (
                "hipWidth",
                "hipDepth",
                "gluteDepth",
                "leftThighThickness",
                "rightThighThickness",
                "leftCalfThickness",
                "rightCalfThickness",
                "ankleWidth",
                "minimumInnerThighGap",
                "shoulderWidth",
            ):
                deltas[key + "PctVsL1"] = pct_change(meas[key], l1_meas[key])

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
            "deltasVsL1": deltas,
            "renders": renders,
        }

    # Comparison crops: lower body (hips to feet) and legs only
    comparison["comparisons"] = {
        "lowerBodyFront": render_comparison(blend_list, "lower-body-front-comparison.png", "front", 0.0, 1.15),
        "lowerBodyBack": render_comparison(blend_list, "lower-body-back-comparison.png", "back", 0.0, 1.15),
        "lowerBodySide": render_comparison(blend_list, "lower-body-side-comparison.png", "left", 0.0, 1.15),
        "legsFront": render_comparison(blend_list, "legs-front-comparison.png", "front", 0.0, 0.95),
        "legsBack": render_comparison(blend_list, "legs-back-comparison.png", "back", 0.0, 0.95),
    }

    sha1 = sha256_file(SOURCE_PATH)
    comparison["sourceSha256Final"] = sha1
    comparison["sourceUnchanged"] = sha1 == sha0
    if sha1 != sha0:
        fail("Torso source was modified")

    ARTIFACT_DIR.mkdir(parents=True, exist_ok=True)
    COMPARISON_PATH.write_text(json.dumps(comparison, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    log(f"Wrote {COMPARISON_PATH}")
    log("PASS — lower-body candidates L1–L4 generated")


if __name__ == "__main__":
    try:
        main()
    except SystemExit:
        raise
    except Exception:
        traceback.print_exc()
        fail("Unhandled exception")
