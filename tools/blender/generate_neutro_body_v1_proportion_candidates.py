"""
Generate Neutro Body V1 height/proportions candidates P1–P4.

Source (immutable during this step):
  assets/blender/neutro-body/neutro_body_v1_silhouette_source.blend
  (= Candidate C Natural Soft: muscle=0.40, weight=0.575)

Each candidate is produced independently:
  Silhouette → P1 / P2 / P3 / P4
Never accumulate edits across candidates.
Never overwrite baseline or silhouette source.

MPFB macros used (from phenotype panel / HumanObjectProperties):
  height       range 0..1  — MakeHuman minheight↔maxheight
  proportions  range 0..1  — uncommonproportions (wide hips/narrow shoulders)
                             ↔ idealproportions (wide shoulders/narrow hips)
                             NOT leg-length. Confirmed via proportions.json + macro.json.

Also runs a temporary proportions probe at 0.40 / 0.50 / 0.60 (not saved as finals).

Run:
  blender.exe --background --python tools/blender/generate_neutro_body_v1_proportion_candidates.py
"""

from __future__ import annotations

import hashlib
import json
import math
import sys
import traceback
from pathlib import Path

import bpy
from mathutils import Vector

SCRIPT_PATH = Path(__file__).resolve()
REPO_ROOT = SCRIPT_PATH.parents[2]
SILHOUETTE_PATH = REPO_ROOT / "assets" / "blender" / "neutro-body" / "neutro_body_v1_silhouette_source.blend"
BASELINE_PATH = REPO_ROOT / "assets" / "blender" / "neutro-body" / "neutro_body_v1_source.blend"
OUT_BLEND_DIR = REPO_ROOT / "assets" / "blender" / "neutro-body" / "proportion-candidates"
ARTIFACT_DIR = REPO_ROOT / "artifacts" / "body-v1-proportions"
COMPARISON_PATH = ARTIFACT_DIR / "comparison.json"

HEIGHT_RANGE = (0.0, 1.0)
PROP_RANGE = (0.0, 1.0)
LOCKED_MUSCLE = 0.40
LOCKED_WEIGHT = 0.575


def log(msg: str) -> None:
    print(f"[neutro-proportions] {msg}", flush=True)


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
        fail(f"Missing blend: {path}")
    bpy.ops.wm.open_mainfile(filepath=str(path))
    log(f"Opened: {path.name}")


def find_human() -> bpy.types.Object:
    obj = bpy.data.objects.get("Human")
    if obj is None:
        meshes = [o for o in bpy.data.objects if o.type == "MESH"]
        if len(meshes) != 1:
            fail(f"Expected Human mesh, found {[o.name for o in meshes]}")
        obj = meshes[0]
    bpy.ops.object.select_all(action="DESELECT")
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj
    return obj


def read_macro(basemesh: bpy.types.Object, name: str) -> float:
    from bl_ext.blender_org.mpfb.entities.objectproperties import HumanObjectProperties

    value = HumanObjectProperties.get_value(name, entity_reference=basemesh)
    if value is None:
        fail(f"Macro '{name}' is None")
    return float(value)


def set_macro(basemesh: bpy.types.Object, name: str, value: float) -> None:
    from bl_ext.blender_org.mpfb.entities.objectproperties import HumanObjectProperties
    from bl_ext.blender_org.mpfb.services import ObjectService, TargetService

    clamped = max(0.0, min(1.0, float(value)))
    HumanObjectProperties.set_value(name, clamped, entity_reference=basemesh)
    ObjectService.activate_blender_object(basemesh)
    TargetService.reapply_macro_details(basemesh, remove_zero_weight_targets=True)
    log(f"Set {name}={clamped:.6f}")


def lerp_toward(neutral: float, extreme: float, pct: float) -> float:
    return neutral + (extreme - neutral) * pct


def depsgraph_evaluated(obj: bpy.types.Object) -> bpy.types.Object:
    depsgraph = bpy.context.evaluated_depsgraph_get()
    return obj.evaluated_get(depsgraph)


def world_bbox(obj: bpy.types.Object) -> tuple[Vector, Vector]:
    ev = depsgraph_evaluated(obj)
    corners = [ev.matrix_world @ Vector(c) for c in ev.bound_box]
    xs = [c.x for c in corners]
    ys = [c.y for c in corners]
    zs = [c.z for c in corners]
    return Vector((min(xs), min(ys), min(zs))), Vector((max(xs), max(ys), max(zs)))


def estimate_triangles(mesh: bpy.types.Mesh) -> int:
    return sum(max(0, len(p.vertices) - 2) for p in mesh.polygons)


def _set_mask_modifiers(obj: bpy.types.Object, enabled: bool) -> list[tuple]:
    """Toggle MASK modifiers (Hide helpers). Returns prior (mod, viewport, render) states."""
    prior: list[tuple] = []
    for m in obj.modifiers:
        if m.type == "MASK":
            prior.append((m, m.show_viewport, m.show_render))
            m.show_viewport = enabled
            m.show_render = enabled
    if prior:
        bpy.context.view_layer.update()
    return prior


def _restore_mask_modifiers(prior: list[tuple]) -> None:
    for m, vp, rr in prior:
        m.show_viewport = vp
        m.show_render = rr
    if prior:
        bpy.context.view_layer.update()


def group_centroid(obj: bpy.types.Object, group_name: str, weight_min: float = 0.3) -> Vector | None:
    """World-space average of vertices in a vertex group (shape keys on, masks off)."""
    if group_name not in obj.vertex_groups:
        return None
    # MASK "Hide helpers" removes vertices from the evaluated mesh and breaks index mapping.
    prior = _set_mask_modifiers(obj, enabled=False)
    try:
        ev = depsgraph_evaluated(obj)
        mesh = ev.to_mesh()
        try:
            if len(mesh.vertices) != len(obj.data.vertices):
                # Fallback: use original coordinates (may miss some shapekey nuance)
                mesh_verts = obj.data.vertices
                matrix = obj.matrix_world
            else:
                mesh_verts = mesh.vertices
                matrix = ev.matrix_world
            gidx = obj.vertex_groups[group_name].index
            pts: list[Vector] = []
            for i, v in enumerate(obj.data.vertices):
                w = 0.0
                for g in v.groups:
                    if g.group == gidx:
                        w = g.weight
                        break
                if w >= weight_min:
                    pts.append(matrix @ mesh_verts[i].co)
            if not pts:
                return None
            acc = Vector((0.0, 0.0, 0.0))
            for p in pts:
                acc += p
            return acc / len(pts)
        finally:
            ev.to_mesh_clear()
    finally:
        _restore_mask_modifiers(prior)


def measure_human(obj: bpy.types.Object) -> dict:
    # BBox with helpers masked (visual body). Landmarks temporarily unmask inside group_centroid.
    mn, mx = world_bbox(obj)
    dims = mx - mn
    total_height = float(dims.z)
    max_width = float(dims.x)
    max_depth = float(dims.y)

    head = group_centroid(obj, "joint-head")
    ground = group_centroid(obj, "joint-ground")
    pelvis = group_centroid(obj, "joint-spine-2") or group_centroid(obj, "joint-pelvis")
    # Fallbacks for MH joint naming
    if pelvis is None:
        for name in obj.vertex_groups.keys():
            if "pelvis" in name.lower() or name.lower() in {"joint-spine", "joint-root"}:
                pelvis = group_centroid(obj, name)
                if pelvis:
                    break
    l_clav = group_centroid(obj, "joint-l-clavicle")
    r_clav = group_centroid(obj, "joint-r-clavicle")
    l_hand = group_centroid(obj, "joint-l-hand")
    r_hand = group_centroid(obj, "joint-r-hand")
    l_ankle = group_centroid(obj, "joint-l-ankle")
    r_ankle = group_centroid(obj, "joint-r-ankle")

    shoulder_height = None
    if l_clav and r_clav:
        shoulder_height = float((l_clav.z + r_clav.z) * 0.5)
    elif l_clav:
        shoulder_height = float(l_clav.z)

    hip_height = float(pelvis.z) if pelvis else None

    wingspan = None
    if l_hand and r_hand:
        wingspan = float(abs(r_hand.x - l_hand.x))

    leg_length = None
    if hip_height is not None:
        ankle_z = None
        if l_ankle and r_ankle:
            ankle_z = (l_ankle.z + r_ankle.z) * 0.5
        elif ground:
            ankle_z = ground.z
        if ankle_z is not None:
            leg_length = float(hip_height - ankle_z)

    torso_length = None
    if shoulder_height is not None and hip_height is not None:
        torso_length = float(shoulder_height - hip_height)

    # Head size proxy: head joint to top of bbox
    head_size = None
    if head:
        head_size = float(mx.z - head.z)

    # Shoulder width / hip width proxies via clavicles and pelvis-adjacent joints
    shoulder_width = float(abs(r_clav.x - l_clav.x)) if (l_clav and r_clav) else None
    hip_width = None
    l_hip = group_centroid(obj, "joint-l-upper-leg") or group_centroid(obj, "joint-l-hip")
    r_hip = group_centroid(obj, "joint-r-upper-leg") or group_centroid(obj, "joint-r-hip")
    if l_hip and r_hip:
        hip_width = float(abs(r_hip.x - l_hip.x))

    def ratio(num: float | None, den: float | None) -> float | str:
        if num is None or den is None or den == 0:
            return "No fiable"
        return float(num / den)

    mesh = obj.data
    sk = len(mesh.shape_keys.key_blocks) if mesh.shape_keys else 0

    return {
        "dimensions": {"x": float(dims.x), "y": float(dims.y), "z": float(dims.z)},
        "bboxMin": [float(mn.x), float(mn.y), float(mn.z)],
        "bboxMax": [float(mx.x), float(mx.y), float(mx.z)],
        "measurements": {
            "totalHeight": total_height,
            "maxWidth": max_width,
            "maxDepth": max_depth,
            "wingspanApprox": wingspan if wingspan is not None else "No fiable",
            "hipHeight": hip_height if hip_height is not None else "No fiable",
            "shoulderHeight": shoulder_height if shoulder_height is not None else "No fiable",
            "torsoLengthApprox": torso_length if torso_length is not None else "No fiable",
            "legLengthApprox": leg_length if leg_length is not None else "No fiable",
            "shoulderWidthApprox": shoulder_width if shoulder_width is not None else "No fiable",
            "hipWidthApprox": hip_width if hip_width is not None else "No fiable",
            "headSizeProxy": head_size if head_size is not None else "No fiable",
            "notes": (
                "Landmarks from joint-* vertex groups on evaluated mesh. "
                "Hip uses pelvis/spine/upper-leg joints when available."
            ),
        },
        "ratios": {
            "legOverHeight": ratio(leg_length, total_height),
            "torsoOverHeight": ratio(torso_length, total_height),
            "wingspanOverHeight": ratio(wingspan, total_height),
            "shoulderOverHipWidth": ratio(shoulder_width, hip_width),
        },
        "vertexCount": len(mesh.vertices),
        "faceCount": len(mesh.polygons),
        "triangleCount": estimate_triangles(mesh),
        "shapeKeyCount": sk,
    }


def clear_diag() -> None:
    """Remove diagnostic lights/cameras only — never NeutroCmp_* comparison bodies."""
    kill_prefixes = ("NeutroDiag", "NeutroKey", "NeutroFill", "NeutroRim")
    for name in list(bpy.data.objects.keys()):
        if name.startswith(kill_prefixes):
            bpy.data.objects.remove(bpy.data.objects[name], do_unlink=True)
    for block in (bpy.data.lights, bpy.data.cameras, bpy.data.worlds):
        for item in list(block):
            if item.name.startswith(kill_prefixes) or item.name.startswith("NeutroDiag"):
                block.remove(item)


def setup_studio(cam_cfg: dict) -> bpy.types.Object:
    scene = bpy.context.scene
    try:
        scene.render.engine = "BLENDER_EEVEE_NEXT"
    except TypeError:
        scene.render.engine = "CYCLES"
        scene.cycles.samples = 32
    scene.render.resolution_x = 1024
    scene.render.resolution_y = 1024
    scene.render.resolution_percentage = 100
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
    bg.inputs[1].default_value = 1.0
    out = nodes.new("ShaderNodeOutputWorld")
    links.new(bg.outputs[0], out.inputs[0])

    def add_light(name: str, energy: float, loc: tuple[float, float, float], size: float) -> None:
        data = bpy.data.lights.new(name=name, type="AREA")
        data.energy = energy
        data.size = size
        obj = bpy.data.objects.new(name, data)
        bpy.context.collection.objects.link(obj)
        obj.location = loc

    add_light("NeutroKey", 250.0, (2.2, -2.5, 2.4), 2.5)
    add_light("NeutroFill", 90.0, (-2.5, -1.5, 1.8), 3.0)
    add_light("NeutroRim", 120.0, (0.0, 3.0, 2.2), 2.0)

    cam_data = bpy.data.cameras.new("NeutroDiagCamera")
    cam_data.lens = cam_cfg["lens"]
    cam_data.clip_start = 0.05
    cam_data.clip_end = 200.0
    cam = bpy.data.objects.new("NeutroDiagCamera", cam_data)
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
        if "Specular IOR Level" in bsdf.inputs:
            bsdf.inputs["Specular IOR Level"].default_value = 0.35
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
    for i, mat in enumerate(originals):
        obj.material_slots[i].material = mat


def place_orbit_camera(cam: bpy.types.Object, view: str, center: Vector, radius: float) -> None:
    angles = {"front": 0.0, "back": math.pi, "left": math.pi / 2, "right": -math.pi / 2}
    a = angles[view]
    cam.location = (
        center.x + radius * math.sin(a),
        center.y - radius * math.cos(a),
        center.z,
    )
    direction = center - cam.location
    cam.rotation_euler = direction.to_track_quat("-Z", "Y").to_euler()


def render_views(prefix: str, human: bpy.types.Object, cam_cfg: dict) -> dict[str, str]:
    ARTIFACT_DIR.mkdir(parents=True, exist_ok=True)
    clear_diag()
    cam = setup_studio(cam_cfg)
    originals = apply_clay(human)
    # Per-body framing: same relative radius formula as silhouette, but based on THIS body
    # so taller bodies still fit. Absolute comparison uses a separate fixed camera.
    mn, mx = world_bbox(human)
    center = (mn + mx) * 0.5
    dims = mx - mn
    radius = max(float(dims.z), float(max(dims.x, dims.y))) * 1.35
    paths: dict[str, str] = {}
    try:
        for view in ("front", "back", "left", "right"):
            place_orbit_camera(cam, view, center, radius)
            out = ARTIFACT_DIR / f"{prefix}-{view}.png"
            bpy.context.scene.render.filepath = str(out)
            log(f"Render {out.name}")
            bpy.ops.render.render(write_still=True)
            if not out.exists():
                fail(f"Missing render {out}")
            paths[view] = str(out.as_posix())
    finally:
        restore_mats(human, originals)
        clear_diag()
    return paths


def save_copy(path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    if path.resolve() in {SILHOUETTE_PATH.resolve(), BASELINE_PATH.resolve()}:
        fail("Refusing to overwrite protected source")
    bpy.ops.wm.save_as_mainfile(filepath=str(path), copy=True)
    log(f"Saved {path.name}")


def append_human_from_blend(blend: Path, name: str) -> bpy.types.Object:
    """Append Human object from another blend into the current scene."""
    before = set(bpy.data.objects.keys())
    with bpy.data.libraries.load(str(blend), link=False) as (data_from, data_to):
        # Prefer object named Human
        targets = [n for n in data_from.objects if n == "Human"]
        if not targets:
            targets = [n for n in data_from.objects if "Human" in n]
        if not targets:
            fail(f"No Human in {blend}")
        data_to.objects = targets[:1]
    for obj in data_to.objects:
        if obj is not None:
            bpy.context.collection.objects.link(obj)
            obj.name = name
    after = [n for n in bpy.data.objects.keys() if n not in before]
    obj = bpy.data.objects.get(name) or bpy.data.objects[after[0]]
    return obj


def render_side_by_side(
    blend_paths: list[tuple[str, Path]],
    out_path: Path,
    *,
    normalize_height: bool,
    cam_cfg_base: dict,
) -> None:
    """Compose four bodies in one scene for absolute or height-normalized front comparison."""
    # Start from empty-ish scene by opening silhouette then deleting human
    open_blend(SILHOUETTE_PATH)
    for obj in list(bpy.data.objects):
        bpy.data.objects.remove(obj, do_unlink=True)

    humans: list[bpy.types.Object] = []
    heights: list[float] = []
    for label, path in blend_paths:
        h = append_human_from_blend(path, f"NeutroCmp_{label}")
        apply_clay(h)
        # Hide helpers mask still present; OK
        mn, mx = world_bbox(h)
        heights.append(float(mx.z - mn.z))
        humans.append(h)

    ref_height = heights[0] if heights else 1.0
    spacing = 1.35 if not normalize_height else 1.15

    for i, (h, ht) in enumerate(zip(humans, heights)):
        scale = (ref_height / ht) if (normalize_height and ht > 0) else 1.0
        h.scale = (scale, scale, scale)
        bpy.context.view_layer.update()
        mn, mx = world_bbox(h)
        h.location.z += -mn.z
        bpy.context.view_layer.update()
        mn, mx = world_bbox(h)
        cx = (i - 1.5) * spacing
        cur_cx = (mn.x + mx.x) * 0.5
        h.location.x += cx - cur_cx
        bpy.context.view_layer.update()

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
    # Wide framing so all four full-height bodies remain visible
    radius = max(span_x * 1.15, span_z * 1.55, 4.5)

    clear_diag()
    cam = setup_studio({"lens": 35.0})
    place_orbit_camera(cam, "front", center, radius)
    scene = bpy.context.scene
    scene.render.resolution_x = 2048
    scene.render.resolution_y = 1024

    out_path.parent.mkdir(parents=True, exist_ok=True)
    scene.render.filepath = str(out_path)
    log(f"Render comparison → {out_path.name} (normalize={normalize_height})")
    bpy.ops.render.render(write_still=True)
    if not out_path.exists():
        fail(f"Missing comparison {out_path}")


def run_proportions_probe(initial_height: float, initial_prop: float) -> list[dict]:
    """Temporary geometric probe for proportions 0.40 / 0.50 / 0.60 — not saved as finals."""
    results = []
    for prop_val in (0.40, 0.50, 0.60):
        open_blend(SILHOUETTE_PATH)
        human = find_human()
        # Lock muscle/weight; keep height at silhouette value
        set_macro(human, "muscle", LOCKED_MUSCLE)
        set_macro(human, "weight", LOCKED_WEIGHT)
        set_macro(human, "height", initial_height)
        set_macro(human, "proportions", prop_val)
        stats = measure_human(human)
        results.append(
            {
                "proportions": prop_val,
                "height": read_macro(human, "height"),
                "muscle": read_macro(human, "muscle"),
                "weight": read_macro(human, "weight"),
                "dimensions": stats["dimensions"],
                "measurements": stats["measurements"],
                "ratios": stats["ratios"],
            }
        )
        log(
            f"Probe prop={prop_val}: heightZ={stats['dimensions']['z']:.4f} "
            f"shoulderW={stats['measurements']['shoulderWidthApprox']} "
            f"hipW={stats['measurements']['hipWidthApprox']} "
            f"ratio={stats['ratios']['shoulderOverHipWidth']}"
        )
    return results


def main() -> None:
    log(f"Blender {bpy.app.version_string}")
    ensure_mpfb()

    if not SILHOUETTE_PATH.is_file():
        fail(f"Missing silhouette source: {SILHOUETTE_PATH}")

    sha_sil = sha256_file(SILHOUETTE_PATH)
    log(f"Silhouette SHA-256: {sha_sil}")

    open_blend(SILHOUETTE_PATH)
    human = find_human()
    muscle0 = read_macro(human, "muscle")
    weight0 = read_macro(human, "weight")
    height0 = read_macro(human, "height")
    prop0 = read_macro(human, "proportions")
    log(f"Silhouette macros: muscle={muscle0} weight={weight0} height={height0} proportions={prop0}")

    if abs(muscle0 - LOCKED_MUSCLE) > 1e-3 or abs(weight0 - LOCKED_WEIGHT) > 1e-3:
        fail(f"Unexpected silhouette muscle/weight: {muscle0}/{weight0}")

    # Camera base from silhouette
    mn, mx = world_bbox(human)
    center = (mn + mx) * 0.5
    dims = mx - mn
    cam_cfg = {
        "center": [float(center.x), float(center.y), float(center.z)],
        "radius": float(max(dims.z, max(dims.x, dims.y)) * 1.35),
        "lens": 50.0,
    }

    # Interpretations from MPFB source
    proportions_interpretation = {
        "uiDescription": (
            "The proportions of the character, where 0.0 is wide hips + narrow shoulders "
            "and 1.0 is wide shoulders + narrow hips"
        ),
        "sourceFile": "entities/objectproperties/humanproperties/proportions.json",
        "macroTargets": {
            "low": "uncommonproportions",
            "high": "idealproportions",
        },
        "macroJson": "data/targets/macrodetails/macro.json",
        "meaning": (
            "Shoulder/hip width bias (inverted-V ↔ V-shape). "
            "NOT primary control of leg length or torso length."
        ),
        "uiSceneProperty": "mpfb_macropanel_proportions",
        "objectProperty": "MPFB_HUM_proportions",
        "apply": "HumanObjectProperties.set_value + TargetService.reapply_macro_details",
    }
    height_interpretation = {
        "uiDescription": "The height of the character",
        "sourceFile": "entities/objectproperties/humanproperties/height.json",
        "macroTargets": {"low": "minheight", "high": "maxheight"},
        "uiSceneProperty": "mpfb_macropanel_height",
        "objectProperty": "MPFB_HUM_height",
        "range": list(HEIGHT_RANGE),
        "apply": "HumanObjectProperties.set_value + TargetService.reapply_macro_details",
    }

    log("=== Proportions geometric probe (temporary) ===")
    probe = run_proportions_probe(height0, prop0)

    # Compute P values from real ranges
    height_p2 = lerp_toward(height0, HEIGHT_RANGE[1], 0.15)
    prop_p3 = lerp_toward(prop0, PROP_RANGE[0], 0.10)
    prop_p4 = lerp_toward(prop0, PROP_RANGE[1], 0.10)

    profiles = [
        {
            "id": "P1",
            "key": "candidateP1",
            "name": "neutro_body_v1_p1_current",
            "label": "Current",
            "prefix": "p1-current",
            "blend": OUT_BLEND_DIR / "neutro_body_v1_p1_current.blend",
            "height": height0,
            "proportions": prop0,
        },
        {
            "id": "P2",
            "key": "candidateP2",
            "name": "neutro_body_v1_p2_taller",
            "label": "Slightly Taller",
            "prefix": "p2-taller",
            "blend": OUT_BLEND_DIR / "neutro_body_v1_p2_taller.blend",
            "height": height_p2,
            "proportions": prop0,
        },
        {
            "id": "P3",
            "key": "candidateP3",
            "name": "neutro_body_v1_p3_proportions_low",
            "label": "Taller + Proportions Low",
            "prefix": "p3-proportions-low",
            "blend": OUT_BLEND_DIR / "neutro_body_v1_p3_proportions_low.blend",
            "height": height_p2,
            "proportions": prop_p3,
        },
        {
            "id": "P4",
            "key": "candidateP4",
            "name": "neutro_body_v1_p4_proportions_high",
            "label": "Taller + Proportions High",
            "prefix": "p4-proportions-high",
            "blend": OUT_BLEND_DIR / "neutro_body_v1_p4_proportions_high.blend",
            "height": height_p2,
            "proportions": prop_p4,
        },
    ]

    comparison: dict = {
        "silhouetteSource": str(SILHOUETTE_PATH.as_posix()),
        "silhouetteSha256": sha_sil,
        "lockedMacros": {"muscle": LOCKED_MUSCLE, "weight": LOCKED_WEIGHT},
        "initialHeight": height0,
        "initialProportions": prop0,
        "heightInterpretation": height_interpretation,
        "proportionsInterpretation": proportions_interpretation,
        "proportionsProbe": probe,
        "derivedValues": {
            "heightP2P3P4": height_p2,
            "proportionsP3": prop_p3,
            "proportionsP4": prop_p4,
            "formulas": {
                "heightP2": "N + (MAX-N)*0.15",
                "proportionsP3": "N + (MIN-N)*0.10",
                "proportionsP4": "N + (MAX-N)*0.10",
            },
        },
        "cameraIndividual": cam_cfg,
    }

    expected_verts = expected_faces = expected_tris = None
    blend_list: list[tuple[str, Path]] = []

    for profile in profiles:
        log(f"=== {profile['id']} — {profile['label']} ===")
        open_blend(SILHOUETTE_PATH)
        human = find_human()

        # Always reset locked macros explicitly
        set_macro(human, "muscle", LOCKED_MUSCLE)
        set_macro(human, "weight", LOCKED_WEIGHT)
        set_macro(human, "height", profile["height"])
        set_macro(human, "proportions", profile["proportions"])

        # Verify locks
        if abs(read_macro(human, "muscle") - LOCKED_MUSCLE) > 1e-3:
            fail("muscle drifted")
        if abs(read_macro(human, "weight") - LOCKED_WEIGHT) > 1e-3:
            fail("weight drifted")

        stats = measure_human(human)
        if expected_verts is None:
            expected_verts = stats["vertexCount"]
            expected_faces = stats["faceCount"]
            expected_tris = stats["triangleCount"]
        else:
            if (
                stats["vertexCount"] != expected_verts
                or stats["faceCount"] != expected_faces
                or stats["triangleCount"] != expected_tris
            ):
                fail(
                    f"Topology changed on {profile['id']}: "
                    f"{stats['vertexCount']}/{stats['faceCount']}/{stats['triangleCount']}"
                )

        save_copy(profile["blend"])
        human = find_human()
        renders = render_views(profile["prefix"], human, cam_cfg)
        blend_list.append((profile["id"], profile["blend"]))

        comparison[profile["key"]] = {
            "name": profile["name"],
            "label": profile["label"],
            "blendPath": str(profile["blend"].as_posix()),
            "muscle": read_macro(human, "muscle"),
            "weight": read_macro(human, "weight"),
            "height": read_macro(human, "height"),
            "proportions": read_macro(human, "proportions"),
            "dimensions": stats["dimensions"],
            "measurements": stats["measurements"],
            "ratios": stats["ratios"],
            "vertexCount": stats["vertexCount"],
            "faceCount": stats["faceCount"],
            "triangleCount": stats["triangleCount"],
            "shapeKeyCount": stats["shapeKeyCount"],
            "renders": renders,
        }

    # Side-by-side comparisons
    abs_path = ARTIFACT_DIR / "absolute-scale-front-comparison.png"
    norm_path = ARTIFACT_DIR / "normalized-height-front-comparison.png"
    render_side_by_side(blend_list, abs_path, normalize_height=False, cam_cfg_base=cam_cfg)
    render_side_by_side(blend_list, norm_path, normalize_height=True, cam_cfg_base=cam_cfg)

    comparison["comparisons"] = {
        "absoluteScaleFront": str(abs_path.as_posix()),
        "normalizedHeightFront": str(norm_path.as_posix()),
    }

    # Verify protected files unchanged
    if SILHOUETTE_PATH.is_file():
        sha_after = sha256_file(SILHOUETTE_PATH)
        comparison["silhouetteSha256Final"] = sha_after
        comparison["silhouetteUnchanged"] = sha_after == sha_sil
        if sha_after != sha_sil:
            fail("Silhouette source was modified")

    ARTIFACT_DIR.mkdir(parents=True, exist_ok=True)
    COMPARISON_PATH.write_text(json.dumps(comparison, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    log(f"Wrote {COMPARISON_PATH}")
    log("PASS — proportion candidates P1–P4 generated")


if __name__ == "__main__":
    try:
        main()
    except SystemExit:
        raise
    except Exception:
        traceback.print_exc()
        fail("Unhandled exception")
