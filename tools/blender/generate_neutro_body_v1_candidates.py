"""
Generate Neutro Body V1 silhouette candidates A/B/C from the immutable baseline.

Each candidate is produced independently:

  Baseline → A (control, unchanged muscle/weight)
  Baseline → B (lean natural)
  Baseline → C (natural soft)

Never writes to assets/blender/neutro-body/neutro_body_v1_source.blend.

MPFB Model → Phenotype API (inspected from MPFB 2.0.16)
-------------------------------------------------------
Panel:  MPFB_PT_Macro_Sub_Panel  (ui/model/_macrosubpanel.py)
Scene UI props: mpfb_macropanel_muscle / mpfb_macropanel_weight
Storage: HumanObjectProperties ("muscle", "weight") on basemesh
         → object custom props MPFB_HUM_muscle / MPFB_HUM_weight
Range:  FloatProperty min=0.0 max=1.0  (default 0.5)
Apply:  HumanObjectProperties.set_value(...)
        TargetService.reapply_macro_details(basemesh, remove_zero_weight_targets=...)
Setter updates the mesh immediately; no separate operator required
(unless MODEL refit is enabled for clothes — unused here).

Run:
  blender.exe --background --python tools/blender/generate_neutro_body_v1_candidates.py
"""

from __future__ import annotations

import hashlib
import json
import math
import shutil
import sys
import traceback
from pathlib import Path

import bpy
from mathutils import Vector

SCRIPT_PATH = Path(__file__).resolve()
REPO_ROOT = SCRIPT_PATH.parents[2]
BASELINE_PATH = REPO_ROOT / "assets" / "blender" / "neutro-body" / "neutro_body_v1_source.blend"
CANDIDATES_DIR = REPO_ROOT / "assets" / "blender" / "neutro-body" / "candidates"
ARTIFACT_DIR = REPO_ROOT / "artifacts" / "body-v1-candidates"
COMPARISON_PATH = ARTIFACT_DIR / "comparison.json"

# Official MPFB macro ranges (FloatProperty on phenotype panel)
MUSCLE_RANGE = (0.0, 1.0)
WEIGHT_RANGE = (0.0, 1.0)
MUSCLE_PROP = "muscle"
WEIGHT_PROP = "weight"


def log(msg: str) -> None:
    print(f"[neutro-candidates] {msg}", flush=True)


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


def open_baseline() -> None:
    if not BASELINE_PATH.is_file():
        fail(f"Baseline missing: {BASELINE_PATH}")
    bpy.ops.wm.open_mainfile(filepath=str(BASELINE_PATH))
    log(f"Opened baseline: {BASELINE_PATH}")


def find_human() -> bpy.types.Object:
    obj = bpy.data.objects.get("Human")
    if obj is None:
        meshes = [o for o in bpy.data.objects if o.type == "MESH"]
        if len(meshes) != 1:
            fail(f"Expected one Human mesh, found: {[o.name for o in meshes]}")
        obj = meshes[0]
    bpy.ops.object.select_all(action="DESELECT")
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj
    return obj


def read_macro(basemesh: bpy.types.Object, name: str) -> float:
    from bl_ext.blender_org.mpfb.entities.objectproperties import HumanObjectProperties

    value = HumanObjectProperties.get_value(name, entity_reference=basemesh)
    if value is None:
        fail(f"Macro property '{name}' is None on {basemesh.name}")
    return float(value)


def set_macro(basemesh: bpy.types.Object, name: str, value: float) -> None:
    """Same path as phenotype panel setter (_general_set_target_value)."""
    from bl_ext.blender_org.mpfb.entities.objectproperties import HumanObjectProperties
    from bl_ext.blender_org.mpfb.services import ObjectService, TargetService

    clamped = max(0.0, min(1.0, float(value)))
    HumanObjectProperties.set_value(name, clamped, entity_reference=basemesh)
    ObjectService.activate_blender_object(basemesh)
    # Match panel default prune behaviour
    TargetService.reapply_macro_details(basemesh, remove_zero_weight_targets=True)
    log(f"Set {name}={clamped:.6f} via HumanObjectProperties + reapply_macro_details")


def lerp_toward(neutral: float, extreme: float, pct: float) -> float:
    """nuevo = N + (EXTREME - N) * porcentaje"""
    return neutral + (extreme - neutral) * pct


def world_bbox(obj: bpy.types.Object) -> tuple[Vector, Vector]:
    corners = [obj.matrix_world @ Vector(c) for c in obj.bound_box]
    xs = [c.x for c in corners]
    ys = [c.y for c in corners]
    zs = [c.z for c in corners]
    return Vector((min(xs), min(ys), min(zs))), Vector((max(xs), max(ys), max(zs)))


def estimate_triangles(mesh: bpy.types.Mesh) -> int:
    return sum(max(0, len(p.vertices) - 2) for p in mesh.polygons)


def mesh_stats(obj: bpy.types.Object) -> dict:
    mesh = obj.data
    sk = 0
    if mesh.shape_keys:
        sk = len(mesh.shape_keys.key_blocks)
    mn, mx = world_bbox(obj)
    dims = mx - mn
    return {
        "vertexCount": len(mesh.vertices),
        "faceCount": len(mesh.polygons),
        "triangleCount": estimate_triangles(mesh),
        "shapeKeyCount": sk,
        "dimensions": {"x": float(dims.x), "y": float(dims.y), "z": float(dims.z)},
        "bboxMin": [float(mn.x), float(mn.y), float(mn.z)],
        "bboxMax": [float(mx.x), float(mx.y), float(mx.z)],
    }


def compute_fixed_camera(center: Vector, radius: float) -> dict:
    """Camera orbit locked to baseline framing for all candidates."""
    return {
        "center": [float(center.x), float(center.y), float(center.z)],
        "radius": float(radius),
        "lens": 50.0,
    }


def clear_diag_scene_extras() -> None:
    for name in list(bpy.data.objects.keys()):
        if name.startswith("NeutroDiag") or name.startswith("NeutroKey") or name.startswith("NeutroFill") or name.startswith("NeutroRim"):
            bpy.data.objects.remove(bpy.data.objects[name], do_unlink=True)
    for block in (bpy.data.lights, bpy.data.cameras, bpy.data.materials, bpy.data.worlds):
        for item in list(block):
            if item.name.startswith("NeutroDiag") or item.name.startswith("Neutro"):
                block.remove(item)


def setup_render_env(cam_cfg: dict) -> bpy.types.Object:
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
    cam_data.clip_end = 100.0
    cam = bpy.data.objects.new("NeutroDiagCamera", cam_data)
    bpy.context.collection.objects.link(cam)
    scene.camera = cam
    return cam


def apply_temp_clay(obj: bpy.types.Object) -> list:
    originals = [slot.material for slot in obj.material_slots]
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


def restore_materials(obj: bpy.types.Object, originals: list) -> None:
    while len(obj.material_slots) < len(originals):
        obj.data.materials.append(None)
    for i, mat in enumerate(originals):
        obj.material_slots[i].material = mat
    clay = bpy.data.materials.get("NeutroDiagClay")
    if clay:
        bpy.data.materials.remove(clay)


def place_camera(cam: bpy.types.Object, view: str, cam_cfg: dict) -> None:
    center = Vector(cam_cfg["center"])
    radius = cam_cfg["radius"]
    angles = {
        "front": 0.0,
        "back": math.pi,
        "left": math.pi / 2,
        "right": -math.pi / 2,
    }
    a = angles[view]
    x = center.x + radius * math.sin(a)
    y = center.y - radius * math.cos(a)
    z = center.z
    cam.location = (x, y, z)
    direction = center - cam.location
    cam.rotation_euler = direction.to_track_quat("-Z", "Y").to_euler()


def render_candidate(prefix: str, human: bpy.types.Object, cam_cfg: dict) -> dict[str, str]:
    ARTIFACT_DIR.mkdir(parents=True, exist_ok=True)
    clear_diag_scene_extras()
    cam = setup_render_env(cam_cfg)
    originals = apply_temp_clay(human)
    paths: dict[str, str] = {}
    try:
        for view in ("front", "back", "left", "right"):
            place_camera(cam, view, cam_cfg)
            out = ARTIFACT_DIR / f"{prefix}-{view}.png"
            bpy.context.scene.render.filepath = str(out)
            log(f"Render {prefix}/{view} → {out}")
            bpy.ops.render.render(write_still=True)
            if not out.exists():
                fail(f"Missing render: {out}")
            paths[view] = str(out.as_posix())
    finally:
        restore_materials(human, originals)
        clear_diag_scene_extras()
    return paths


def save_candidate_blend(path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    # Safety: never write baseline
    if path.resolve() == BASELINE_PATH.resolve():
        fail("Refusing to overwrite baseline")
    bpy.ops.wm.save_as_mainfile(filepath=str(path), copy=True)
    log(f"Saved candidate blend: {path}")


def build_profiles(baseline_muscle: float, baseline_weight: float) -> list[dict]:
    min_m, max_m = MUSCLE_RANGE
    min_w, max_w = WEIGHT_RANGE
    return [
        {
            "id": "A",
            "key": "candidateA",
            "name": "neutro_body_v1_candidate_a_balanced",
            "label": "Balanced",
            "prefix": "candidate-a",
            "blend": CANDIDATES_DIR / "neutro_body_v1_candidate_a_balanced.blend",
            "muscle": baseline_muscle,  # control — no change
            "weight": baseline_weight,
            "modify": False,
        },
        {
            "id": "B",
            "key": "candidateB",
            "name": "neutro_body_v1_candidate_b_lean",
            "label": "Lean Natural",
            "prefix": "candidate-b",
            "blend": CANDIDATES_DIR / "neutro_body_v1_candidate_b_lean.blend",
            # 20% toward min muscle, 10% toward min weight
            "muscle": lerp_toward(baseline_muscle, min_m, 0.20),
            "weight": lerp_toward(baseline_weight, min_w, 0.10),
            "modify": True,
        },
        {
            "id": "C",
            "key": "candidateC",
            "name": "neutro_body_v1_candidate_c_soft",
            "label": "Natural Soft",
            "prefix": "candidate-c",
            "blend": CANDIDATES_DIR / "neutro_body_v1_candidate_c_soft.blend",
            # 20% toward min muscle, 15% toward max weight
            "muscle": lerp_toward(baseline_muscle, min_m, 0.20),
            "weight": lerp_toward(baseline_weight, max_w, 0.15),
            "modify": True,
        },
    ]


def main() -> None:
    log(f"Blender {bpy.app.version_string}")
    ensure_mpfb()

    if not BASELINE_PATH.is_file():
        fail(f"Baseline not found: {BASELINE_PATH}")

    sha_initial = sha256_file(BASELINE_PATH)
    log(f"Baseline SHA-256: {sha_initial}")
    # Keep a temp copy so we can verify the source file never changes even if Blender touches open buffers
    backup = ARTIFACT_DIR / "_baseline_sha_guard.bin"
    ARTIFACT_DIR.mkdir(parents=True, exist_ok=True)
    shutil.copy2(BASELINE_PATH, backup)

    # --- Load baseline once to read macros + lock camera framing ---
    open_baseline()
    human = find_human()
    baseline_muscle = read_macro(human, MUSCLE_PROP)
    baseline_weight = read_macro(human, WEIGHT_PROP)
    log(f"Baseline macros: muscle={baseline_muscle:.6f} weight={baseline_weight:.6f}")

    stats0 = mesh_stats(human)
    mn = Vector(stats0["bboxMin"])
    mx = Vector(stats0["bboxMax"])
    center = (mn + mx) * 0.5
    dims = mx - mn
    radius = max(float(dims.z), float(max(dims.x, dims.y))) * 1.35
    cam_cfg = compute_fixed_camera(center, radius)
    log(f"Fixed camera center={cam_cfg['center']} radius={cam_cfg['radius']:.4f}")

    expected_verts = stats0["vertexCount"]
    expected_faces = stats0["faceCount"]
    expected_tris = stats0["triangleCount"]

    profiles = build_profiles(baseline_muscle, baseline_weight)
    comparison: dict = {
        "baselineSha256": sha_initial,
        "baselinePath": str(BASELINE_PATH.as_posix()),
        "mpfbVersion": "2.0.16",
        "blenderVersion": bpy.app.version_string,
        "api": {
            "muscleProperty": MUSCLE_PROP,
            "weightProperty": WEIGHT_PROP,
            "objectPropertyPrefix": "MPFB_HUM_",
            "uiSceneProperties": ["mpfb_macropanel_muscle", "mpfb_macropanel_weight"],
            "apply": "HumanObjectProperties.set_value + TargetService.reapply_macro_details",
            "source": "ui/model/_macrosubpanel.py",
            "muscleRange": list(MUSCLE_RANGE),
            "weightRange": list(WEIGHT_RANGE),
        },
        "camera": cam_cfg,
    }

    for profile in profiles:
        log(f"=== Candidate {profile['id']} — {profile['label']} (from baseline) ===")
        # Always reload pristine baseline — no cumulative edits
        open_baseline()
        human = find_human()

        muscle_before = read_macro(human, MUSCLE_PROP)
        weight_before = read_macro(human, WEIGHT_PROP)
        if abs(muscle_before - baseline_muscle) > 1e-6 or abs(weight_before - baseline_weight) > 1e-6:
            fail(
                f"Baseline macros drifted on reload: "
                f"muscle={muscle_before} weight={weight_before}"
            )

        if profile["modify"]:
            set_macro(human, MUSCLE_PROP, profile["muscle"])
            set_macro(human, WEIGHT_PROP, profile["weight"])
        else:
            # Control: leave macros untouched
            profile["muscle"] = muscle_before
            profile["weight"] = weight_before

        muscle_after = read_macro(human, MUSCLE_PROP)
        weight_after = read_macro(human, WEIGHT_PROP)
        stats = mesh_stats(human)

        if stats["vertexCount"] != expected_verts or stats["faceCount"] != expected_faces:
            fail(
                f"Topology changed for candidate {profile['id']}: "
                f"verts {stats['vertexCount']} (expected {expected_verts}), "
                f"faces {stats['faceCount']} (expected {expected_faces})"
            )
        if stats["triangleCount"] != expected_tris:
            fail(
                f"Triangle count changed for candidate {profile['id']}: "
                f"{stats['triangleCount']} (expected {expected_tris})"
            )

        # Save blend BEFORE diagnostic render extras
        save_candidate_blend(profile["blend"])

        # Re-open saved candidate for clean render pass? Not required —
        # render from current scene then discard extras by reloading next iteration.
        # But save_as copy=True may leave us on candidate path; still OK.
        # Re-find human after save
        human = find_human()
        renders = render_candidate(profile["prefix"], human, cam_cfg)

        comparison[profile["key"]] = {
            "name": profile["name"],
            "label": profile["label"],
            "blendPath": str(profile["blend"].as_posix()),
            "muscle": {
                "property": MUSCLE_PROP,
                "value": muscle_after,
                "baseline": baseline_muscle,
                "range": list(MUSCLE_RANGE),
                "deltaFromBaseline": muscle_after - baseline_muscle,
            },
            "weight": {
                "property": WEIGHT_PROP,
                "value": weight_after,
                "baseline": baseline_weight,
                "range": list(WEIGHT_RANGE),
                "deltaFromBaseline": weight_after - baseline_weight,
            },
            "dimensions": stats["dimensions"],
            "vertexCount": stats["vertexCount"],
            "faceCount": stats["faceCount"],
            "triangleCount": stats["triangleCount"],
            "shapeKeyCount": stats["shapeKeyCount"],
            "renders": renders,
        }

    # Verify baseline file integrity
    sha_final = sha256_file(BASELINE_PATH)
    sha_backup = sha256_file(backup)
    comparison["baselineSha256Final"] = sha_final
    comparison["baselineUnchanged"] = sha_final == sha_initial == sha_backup

    if sha_final != sha_initial:
        fail(f"Baseline SHA changed! initial={sha_initial} final={sha_final}")

    backup.unlink(missing_ok=True)
    COMPARISON_PATH.write_text(json.dumps(comparison, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    log(f"Wrote {COMPARISON_PATH}")
    log("PASS — candidates A/B/C generated; baseline intact")


if __name__ == "__main__":
    try:
        main()
    except SystemExit:
        raise
    except Exception:
        traceback.print_exc()
        fail("Unhandled exception")
