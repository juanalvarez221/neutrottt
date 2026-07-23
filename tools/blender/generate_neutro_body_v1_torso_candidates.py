"""
Generate Neutro Body V1 torso candidates T1–T4 (chest / ribcage / abdomen / waist / flanks / back).

Source (immutable):
  assets/blender/neutro-body/neutro_body_v1_upper_body_source.blend
  (= U4 Narrow Shoulders + Natural Arms)

Locked macros:
  muscle=0.40  weight=0.575  height=0.575  proportions=0.50

Already-fixed local targets (must remain untouched):
  measure-shoulder-dist-decr = 0.10   (slider -0.10)
  l/r-upperarm-fat-incr      = 0.10
  l/r-lowerarm-fat-incr      = 0.10

Torso targets used in this step (all unsided, range -1..+1, neutral 0):
  torso/torso-muscle-pectoral-decr-incr   muscle target used ONLY negatively
                                          (reduces pectoral definition/rigidity)
  stomach/stomach-tone-decr-incr          negative = softer, less "mannequin" abdomen
  stomach/stomach-pregnant-decr-incr      soft lower-belly volume (subtle values only)

Explicitly NOT used:
  torso-vshape-*      (alters shoulder/hip relation already locked)
  torso-scale-*       (broad geometric scale, fat/soft preferred)
  torso-muscle-dorsi-incr, stomach-tone-incr, torso-muscle-pectoral-incr
                      (positive muscle = fitness look, banned)

Candidates:
  T1 Current                : control, no new targets
  T2 Softer Torso           : pectoral -0.08, stomach-tone -0.10, stomach-pregnant +0.08
  T3 Slightly Cleaner Torso : stomach-pregnant -0.05 (very slight flatter lower abdomen)
  T4 Balanced Tattoo Canvas : pectoral -0.08, stomach-tone -0.08, stomach-pregnant +0.04

Run:
  blender.exe --background --python tools/blender/generate_neutro_body_v1_torso_candidates.py
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
SOURCE_PATH = REPO_ROOT / "assets" / "blender" / "neutro-body" / "neutro_body_v1_upper_body_source.blend"
OUT_BLEND_DIR = REPO_ROOT / "assets" / "blender" / "neutro-body" / "torso-candidates"
ARTIFACT_DIR = REPO_ROOT / "artifacts" / "body-v1-torso"
COMPARISON_PATH = ARTIFACT_DIR / "comparison.json"

LOCKED = {
    "muscle": 0.40,
    "weight": 0.575,
    "height": 0.575,
    "proportions": 0.50,
}

# Local targets fixed in previous steps — shape key name -> expected value
FIXED_LOCAL = {
    "measure-shoulder-dist-decr": 0.10,
    "l-upperarm-fat-incr": 0.10,
    "r-upperarm-fat-incr": 0.10,
    "l-lowerarm-fat-incr": 0.10,
    "r-lowerarm-fat-incr": 0.10,
}

OPPOSED_RANGE = (-1.0, 1.0)
NEUTRAL = 0.0

VIEWS = ("front", "back", "left", "right", "three-quarter-front", "three-quarter-back")


def log(msg: str) -> None:
    print(f"[neutro-torso] {msg}", flush=True)


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


def set_opposed_unsided(basemesh: bpy.types.Object, section: str, positive: str, negative: str, value: float) -> None:
    """Mirror MPFB Model panel _set_opposed_modifier_value for unsided targets."""
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


TORSO_TARGET_APPLIERS = {
    "torso-muscle-pectoral": lambda h, v: set_opposed_unsided(
        h, "torso", positive="torso-muscle-pectoral-incr", negative="torso-muscle-pectoral-decr", value=v
    ),
    "stomach-tone": lambda h, v: set_opposed_unsided(
        h, "stomach", positive="stomach-tone-incr", negative="stomach-tone-decr", value=v
    ),
    "stomach-pregnant": lambda h, v: set_opposed_unsided(
        h, "stomach", positive="stomach-pregnant-incr", negative="stomach-pregnant-decr", value=v
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


def _torso_component_x(band_pts: list[Vector]) -> list[Vector]:
    """Keep only the connected x-component containing x=0 (drops arm slabs left/right).

    A gap > 2.5 cm in sorted x separates torso from arms in the A-pose bands."""
    if not band_pts:
        return []
    pts = sorted(band_pts, key=lambda p: p.x)
    xs = [p.x for p in pts]
    # split indices where gap opens
    segments = []
    start = 0
    for i in range(1, len(xs)):
        if xs[i] - xs[i - 1] > 0.025:
            segments.append((start, i))
            start = i
    segments.append((start, len(xs)))
    for s, e in segments:
        if xs[s] <= 0.0 <= xs[e - 1]:
            return pts[s:e]
    # fallback: segment closest to x=0
    best = min(segments, key=lambda se: min(abs(xs[se[0]]), abs(xs[se[1] - 1])))
    return pts[best[0]:best[1]]


def band_measure(body_pts: list[Vector], z: float, half: float = 0.02) -> dict:
    """Torso width/depth in a horizontal band, excluding arm geometry."""
    band = [p for p in body_pts if abs(p.z - z) <= half]
    if len(band) < 20:
        return {"width": "No fiable", "depth": "No fiable", "n": len(band)}
    torso = _torso_component_x(band)
    if len(torso) < 20:
        return {"width": "No fiable", "depth": "No fiable", "n": len(torso)}
    xs = [p.x for p in torso]
    ys = [p.y for p in torso]
    return {
        "width": float(max(xs) - min(xs)),
        "depth": float(max(ys) - min(ys)),
        "n": len(torso),
    }


def back_width(body_pts: list[Vector], z: float, half: float = 0.02) -> float | str:
    """Lateral width of the back half (y > band median y) at a given height."""
    band = [p for p in body_pts if abs(p.z - z) <= half]
    if len(band) < 20:
        return "No fiable"
    torso = _torso_component_x(band)
    if len(torso) < 20:
        return "No fiable"
    ys = sorted(p.y for p in torso)
    y_mid = ys[len(ys) // 2]
    backs = [p for p in torso if p.y >= y_mid]
    if len(backs) < 10:
        return "No fiable"
    xs = [p.x for p in backs]
    return float(max(xs) - min(xs))


def measure_torso(obj: bpy.types.Object) -> dict:
    mn, mx = world_bbox(obj)
    dims = mx - mn

    l_clav = group_centroid(obj, "joint-l-clavicle")
    r_clav = group_centroid(obj, "joint-r-clavicle")
    l_scap = group_centroid(obj, "joint-l-scapula")
    r_scap = group_centroid(obj, "joint-r-scapula")
    pelvis = group_centroid(obj, "joint-pelvis")
    spine1 = group_centroid(obj, "joint-spine-1")
    spine2 = group_centroid(obj, "joint-spine-2")
    spine3 = group_centroid(obj, "joint-spine-3")

    if not (l_clav and r_clav and pelvis):
        fail("Missing clavicle/pelvis landmarks for torso bands")

    clav_z = (l_clav.z + r_clav.z) * 0.5
    pelvis_z = pelvis.z
    span = clav_z - pelvis_z

    # Anatomical band heights (fractions of pelvis→clavicle span, fixed for all candidates)
    z_chest = pelvis_z + span * 0.72      # bust/pectoral level
    z_ribcage = pelvis_z + span * 0.58    # underbust / ribcage
    z_waist = pelvis_z + span * 0.36      # natural waist (above navel)
    z_upper_back = (l_scap.z + r_scap.z) * 0.5 if (l_scap and r_scap) else pelvis_z + span * 0.85
    z_lower_back = pelvis_z + span * 0.18

    body_pts = verts_in_groups(obj, ["body"], 0.15)

    chest = band_measure(body_pts, z_chest)
    ribcage = band_measure(body_pts, z_ribcage)
    waist = band_measure(body_pts, z_waist)
    ub_width = back_width(body_pts, z_upper_back)
    lb_width = back_width(body_pts, z_lower_back)

    def ratio(a, b):
        if isinstance(a, (int, float)) and isinstance(b, (int, float)) and b != 0:
            return float(a / b)
        return "No fiable"

    mesh = obj.data
    sk = len(mesh.shape_keys.key_blocks) if mesh.shape_keys else 0

    return {
        "dimensions": {"x": float(dims.x), "y": float(dims.y), "z": float(dims.z)},
        "bandHeightsZ": {
            "chest": float(z_chest),
            "ribcage": float(z_ribcage),
            "waist": float(z_waist),
            "upperBack": float(z_upper_back),
            "lowerBack": float(z_lower_back),
        },
        "landmarks": {
            "clavicleZ": float(clav_z),
            "pelvisZ": float(pelvis_z),
            "spine1Z": float(spine1.z) if spine1 else None,
            "spine2Z": float(spine2.z) if spine2 else None,
            "spine3Z": float(spine3.z) if spine3 else None,
        },
        "chestWidth": chest["width"],
        "chestDepth": chest["depth"],
        "ribcageWidth": ribcage["width"],
        "ribcageDepth": ribcage["depth"],
        "waistWidth": waist["width"],
        "waistDepth": waist["depth"],
        "upperBackWidth": ub_width,
        "lowerBackWidth": lb_width,
        "waistChestWidthRatio": ratio(waist["width"], chest["width"]),
        "chestDepthWidthRatio": ratio(chest["depth"], chest["width"]),
        "waistDepthWidthRatio": ratio(waist["depth"], waist["width"]),
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


def render_comparison(blend_paths: list[tuple[str, Path]], out_name: str, view: str) -> str:
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
        fail("Refusing to overwrite upper-body source")
    bpy.ops.wm.save_as_mainfile(filepath=str(path), copy=True)
    log(f"Saved {path.name}")


PROFILES = [
    {
        "id": "T1",
        "key": "candidateT1",
        "name": "neutro_body_v1_t1_current",
        "label": "Current",
        "prefix": "t1-current",
        "blend": OUT_BLEND_DIR / "neutro_body_v1_t1_current.blend",
        "targets": {},
    },
    {
        "id": "T2",
        "key": "candidateT2",
        "name": "neutro_body_v1_t2_softer_torso",
        "label": "Softer Torso",
        "prefix": "t2-softer-torso",
        "blend": OUT_BLEND_DIR / "neutro_body_v1_t2_softer_torso.blend",
        "targets": {
            "torso-muscle-pectoral": -0.08,
            "stomach-tone": -0.10,
            "stomach-pregnant": +0.08,
        },
    },
    {
        "id": "T3",
        "key": "candidateT3",
        "name": "neutro_body_v1_t3_cleaner_torso",
        "label": "Slightly Cleaner Torso",
        "prefix": "t3-cleaner-torso",
        "blend": OUT_BLEND_DIR / "neutro_body_v1_t3_cleaner_torso.blend",
        "targets": {
            "stomach-pregnant": -0.05,
        },
    },
    {
        "id": "T4",
        "key": "candidateT4",
        "name": "neutro_body_v1_t4_balanced_tattoo_canvas",
        "label": "Balanced Tattoo Canvas",
        "prefix": "t4-balanced-tattoo-canvas",
        "blend": OUT_BLEND_DIR / "neutro_body_v1_t4_balanced_tattoo_canvas.blend",
        "targets": {
            "torso-muscle-pectoral": -0.08,
            "stomach-tone": -0.08,
            "stomach-pregnant": +0.04,
        },
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
        "torsoTargetsUsed": {
            "torso-muscle-pectoral-decr-incr": "muscle — used ONLY negative to soften pectoral definition",
            "stomach-tone-decr-incr": "soft volume/form — negative = softer, less mannequin abdomen",
            "stomach-pregnant-decr-incr": "soft volume — subtle lower-belly roundness or flattening",
        },
        "torsoTargetsRejected": {
            "torso-vshape-decr-incr": "alters locked shoulder/hip relation",
            "torso-scale-horiz/depth/vert": "broad geometric scale; fat/soft targets preferred",
            "torso-muscle-dorsi-incr": "positive back muscle = fitness look",
            "stomach-tone-incr": "positive abdominal tone = six-pack direction",
            "measure-*-circ": "circumference measures reserved; no global girth change requested",
        },
    }

    expected_v = expected_f = expected_t = None
    t1_meas = None
    blend_list = []

    for profile in PROFILES:
        log(f"=== {profile['id']} — {profile['label']} ===")
        open_blend(SOURCE_PATH)
        human = find_human()
        assert_locked_macros(human)
        assert_fixed_local_targets(human)

        applied = {}
        for tname, tvalue in profile["targets"].items():
            TORSO_TARGET_APPLIERS[tname](human, tvalue)
            applied[tname] = tvalue

        assert_locked_macros(human)
        assert_fixed_local_targets(human)
        meas = measure_torso(human)

        if expected_v is None:
            expected_v, expected_f, expected_t = meas["vertexCount"], meas["faceCount"], meas["triangleCount"]
            t1_meas = meas
        else:
            if (
                meas["vertexCount"] != expected_v
                or meas["faceCount"] != expected_f
                or meas["triangleCount"] != expected_t
            ):
                fail(f"Topology changed on {profile['id']}")

        deltas = {}
        if t1_meas:
            for key in (
                "chestWidth",
                "chestDepth",
                "ribcageWidth",
                "waistWidth",
                "waistDepth",
                "upperBackWidth",
                "lowerBackWidth",
            ):
                deltas[key + "PctVsT1"] = pct_change(meas[key], t1_meas[key])

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
            "deltasVsT1": deltas,
            "renders": renders,
        }

    comparison["comparisons"] = {
        "front": render_comparison(blend_list, "torso-front-comparison.png", "front"),
        "back": render_comparison(blend_list, "torso-back-comparison.png", "back"),
        "side": render_comparison(blend_list, "torso-side-comparison.png", "left"),
        "threeQuarterFront": render_comparison(
            blend_list, "torso-three-quarter-front-comparison.png", "three-quarter-front"
        ),
        "threeQuarterBack": render_comparison(
            blend_list, "torso-three-quarter-back-comparison.png", "three-quarter-back"
        ),
    }

    sha1 = sha256_file(SOURCE_PATH)
    comparison["sourceSha256Final"] = sha1
    comparison["sourceUnchanged"] = sha1 == sha0
    if sha1 != sha0:
        fail("Upper-body source was modified")

    ARTIFACT_DIR.mkdir(parents=True, exist_ok=True)
    COMPARISON_PATH.write_text(json.dumps(comparison, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    log(f"Wrote {COMPARISON_PATH}")
    log("PASS — torso candidates T1–T4 generated")


if __name__ == "__main__":
    try:
        main()
    except SystemExit:
        raise
    except Exception:
        traceback.print_exc()
        fail("Unhandled exception")
