"""
Neutro Body V1 Baseline — reproducible MPFB human creation.

Purpose
-------
Create a generic, still-parametric MakeHuman/MPFB basemesh as the editable
master for Neutro Body V1. This is NOT the final design; it is the starting
point before phenotype / proportion tuning.

Official MPFB path used (inspected from installed extension 2.0.16)
------------------------------------------------------------------
UI:   New human → From scratch → Create human
Op:   bpy.ops.mpfb.create_human
Class: MPFB_OT_CreateHumanOperator
File:  .../ui/new_human/newhuman/operators/createhuman.py

Scene properties (prefix MPFB_ + NH_ from SceneConfigSet):
  MPFB_NH_scale_factor          enum  METER|DECIMETER|CENTIMETER  (METER → scale=0.1)
  MPFB_NH_add_phenotype        bool
  MPFB_NH_phenotype_*          phenotype enums
  MPFB_NH_mask_helpers         bool
  MPFB_NH_detailed_helpers     bool
  MPFB_NH_extra_vertex_groups  bool
  MPFB_NH_preselect_group      string

"From scratch" does NOT add a rig. Rig options exist only on the presets path.

Internal API used only as documented fallback if the public operator's post
EDIT-mode selection fails in background:
  HumanService.create_human(...)  — same call the official operator makes.

Run (from repo root):
  "C:\\Program Files\\Blender Foundation\\Blender 5.1\\blender.exe" ^
    --background --python tools/blender/create_neutro_body_v1_baseline.py
"""

from __future__ import annotations

import json
import math
import sys
import traceback
from pathlib import Path

import bpy
from mathutils import Vector

# ---------------------------------------------------------------------------
# Paths
# ---------------------------------------------------------------------------

SCRIPT_PATH = Path(__file__).resolve()
REPO_ROOT = SCRIPT_PATH.parents[2]
BLEND_PATH = REPO_ROOT / "assets" / "blender" / "neutro-body" / "neutro_body_v1_source.blend"
ARTIFACT_DIR = REPO_ROOT / "artifacts" / "body-v1-baseline"
METADATA_PATH = ARTIFACT_DIR / "metadata.json"

# Scene property names registered by MPFB New Human panel (prefix MPFB_NH_)
PROP = {
    "scale_factor": "MPFB_NH_scale_factor",
    "add_phenotype": "MPFB_NH_add_phenotype",
    "add_breast": "MPFB_NH_add_breast",
    "phenotype_gender": "MPFB_NH_phenotype_gender",
    "phenotype_age": "MPFB_NH_phenotype_age",
    "phenotype_muscle": "MPFB_NH_phenotype_muscle",
    "phenotype_weight": "MPFB_NH_phenotype_weight",
    "phenotype_height": "MPFB_NH_phenotype_height",
    "phenotype_proportions": "MPFB_NH_phenotype_proportions",
    "phenotype_race": "MPFB_NH_phenotype_race",
    "phenotype_influence": "MPFB_NH_phenotype_influence",
    "mask_helpers": "MPFB_NH_mask_helpers",
    "detailed_helpers": "MPFB_NH_detailed_helpers",
    "extra_vertex_groups": "MPFB_NH_extra_vertex_groups",
    "preselect_group": "MPFB_NH_preselect_group",
}


def log(msg: str) -> None:
    print(f"[neutro-baseline] {msg}", flush=True)


def fail(msg: str, code: int = 1) -> None:
    log(f"FAIL: {msg}")
    sys.exit(code)


# ---------------------------------------------------------------------------
# MPFB availability
# ---------------------------------------------------------------------------

def ensure_mpfb() -> None:
    keys = list(bpy.context.preferences.addons.keys())
    if "bl_ext.blender_org.mpfb" not in keys:
        fail(f"MPFB not enabled. Addons present: {keys}")
    try:
        import bl_ext.blender_org.mpfb  # noqa: F401
    except Exception as exc:  # noqa: BLE001
        fail(f"Cannot import bl_ext.blender_org.mpfb: {exc}")
    if not hasattr(bpy.ops.mpfb, "create_human"):
        fail("Operator bpy.ops.mpfb.create_human is not registered")
    log("MPFB available: bl_ext.blender_org.mpfb / ops.mpfb.create_human")


# ---------------------------------------------------------------------------
# Scene setup
# ---------------------------------------------------------------------------

def clear_scene() -> None:
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete(use_global=False)
    for block in (bpy.data.meshes, bpy.data.materials, bpy.data.cameras, bpy.data.lights, bpy.data.armatures):
        for item in list(block):
            block.remove(item)
    log("Scene cleared")


def configure_new_human_scene_props() -> None:
    """Mirror New human → From scratch defaults for a generic/neutral baseline."""
    scene = bpy.context.scene
    # Scale: Meter → HumanService scale=0.1 (see createhuman.py)
    setattr(scene, PROP["scale_factor"], "METER")
    # Keep helpers so parametric modelling remains intact
    setattr(scene, PROP["mask_helpers"], True)
    setattr(scene, PROP["detailed_helpers"], True)
    setattr(scene, PROP["extra_vertex_groups"], True)
    setattr(scene, PROP["preselect_group"], "body")
    # Phenotype: official neutral defaults (no randomization)
    setattr(scene, PROP["add_phenotype"], True)
    setattr(scene, PROP["phenotype_gender"], "neutral")
    setattr(scene, PROP["phenotype_age"], "young")
    setattr(scene, PROP["phenotype_muscle"], "averagemuscle")
    setattr(scene, PROP["phenotype_weight"], "averageweight")
    setattr(scene, PROP["phenotype_height"], "average")
    setattr(scene, PROP["phenotype_proportions"], "average")
    setattr(scene, PROP["phenotype_race"], "universal")
    setattr(scene, PROP["phenotype_influence"], 1.0)
    # Disable breast phenotype enums (official path sets cupsize/firmness=0.5)
    # so the baseline stays gender-neutral without maxcup default influence.
    setattr(scene, PROP["add_breast"], False)
    log("Configured MPFB_NH_* scene properties (Meter, no rig, neutral phenotype)")


def create_human() -> bpy.types.Object:
    """Prefer the public operator; fall back to HumanService if EDIT-mode post-step fails."""
    configure_new_human_scene_props()

    before = set(bpy.data.objects.keys())
    try:
        result = bpy.ops.mpfb.create_human()
        log(f"bpy.ops.mpfb.create_human() → {result}")
        if "FINISHED" not in result:
            raise RuntimeError(f"Operator did not finish: {result}")
    except Exception as op_exc:  # noqa: BLE001
        log(f"Public operator raised: {type(op_exc).__name__}: {op_exc}")
        log("Falling back to HumanService.create_human (same API the operator calls)")
        # Internal API used by MPFB_OT_CreateHumanOperator.hardened_execute
        from bl_ext.blender_org.mpfb.services import HumanService, TargetService

        # Meter → scale 0.1; phenotype path with add_breast=False
        macro = TargetService.get_default_macro_info_dict()
        macro["race"]["african"] = 0.33
        macro["race"]["asian"] = 0.33
        macro["race"]["caucasian"] = 0.33
        # gender/age/muscle/weight/proportions/height already 0.5 defaults
        # (neutral + young + average* with no min/max overrides)
        macro["age"] = 0.5  # young
        macro["cupsize"] = 0.5
        macro["firmness"] = 0.5
        basemesh = HumanService.create_human(
            mask_helpers=True,
            detailed_helpers=True,
            extra_vertex_groups=True,
            feet_on_ground=True,
            scale=0.1,
            macro_detail_dict=macro,
        )
        basemesh.use_shape_key_edit_mode = True
        bpy.ops.object.select_all(action="DESELECT")
        bpy.context.view_layer.objects.active = basemesh
        basemesh.select_set(True)
        log(f"HumanService.create_human produced: {basemesh.name}")
        return basemesh

    after = [name for name in bpy.data.objects.keys() if name not in before]
    active = bpy.context.view_layer.objects.active
    if active is None:
        fail(f"No active object after create_human. New objects: {after}")
    log(f"Created basemesh: {active.name} (new objects: {after})")
    return active


# ---------------------------------------------------------------------------
# Analysis helpers
# ---------------------------------------------------------------------------

def world_bbox(obj: bpy.types.Object) -> tuple[Vector, Vector]:
    corners = [obj.matrix_world @ Vector(c) for c in obj.bound_box]
    xs = [c.x for c in corners]
    ys = [c.y for c in corners]
    zs = [c.z for c in corners]
    return Vector((min(xs), min(ys), min(zs))), Vector((max(xs), max(ys), max(zs)))


def estimate_triangles(mesh: bpy.types.Mesh) -> int:
    tris = 0
    for poly in mesh.polygons:
        n = len(poly.vertices)
        if n >= 3:
            tris += n - 2
    return tris


def shape_key_names(obj: bpy.types.Object) -> list[str]:
    if not obj.data or not obj.data.shape_keys:
        return []
    return [kb.name for kb in obj.data.shape_keys.key_blocks]


def related_objects(basemesh: bpy.types.Object) -> list[dict]:
    related = []
    for obj in bpy.data.objects:
        info = {
            "name": obj.name,
            "type": obj.type,
            "parent": obj.parent.name if obj.parent else None,
            "children": [c.name for c in obj.children],
        }
        related.append(info)
    return related


def estimate_forward_and_up(obj: bpy.types.Object) -> dict:
    """Heuristic orientation from bounding-box extents (MakeHuman usually Y-forward, Z-up)."""
    mn, mx = world_bbox(obj)
    dims = mx - mn
    axes = [("X", dims.x), ("Y", dims.y), ("Z", dims.z)]
    up_axis = max(axes, key=lambda a: a[1])[0]
    remaining = [a for a in axes if a[0] != up_axis]
    # Depth (front/back) is typically the smaller of the remaining two for a standing human
    depth_axis = min(remaining, key=lambda a: a[1])[0]
    width_axis = max(remaining, key=lambda a: a[1])[0]
    # MakeHuman default faces -Y in Blender coordinates
    forward = f"-{depth_axis}" if depth_axis == "Y" else f"-{depth_axis}"
    return {
        "upAxis": up_axis,
        "forwardAxis": forward,
        "widthAxis": width_axis,
        "depthAxis": depth_axis,
        "dimensions": {"x": float(dims.x), "y": float(dims.y), "z": float(dims.z)},
        "bboxMin": [float(mn.x), float(mn.y), float(mn.z)],
        "bboxMax": [float(mx.x), float(mx.y), float(mx.z)],
    }


def estimate_arm_separation(obj: bpy.types.Object) -> str:
    """Approximate wrist/hand lateral distance using vertex groups if present."""
    mesh = obj.data
    group_names = {g.name: g.index for g in obj.vertex_groups}
    candidates_left = [n for n in group_names if n.lower() in {"l-hand", "left-hand", "hand-l", "l_hand"} or "l-hand" in n.lower()]
    candidates_right = [n for n in group_names if n.lower() in {"r-hand", "right-hand", "hand-r", "r_hand"} or "r-hand" in n.lower()]
    # Broader fallback: arms / forearms
    if not candidates_left:
        candidates_left = [n for n in group_names if "l-" in n.lower() and ("arm" in n.lower() or "hand" in n.lower() or "wrist" in n.lower())]
    if not candidates_right:
        candidates_right = [n for n in group_names if "r-" in n.lower() and ("arm" in n.lower() or "hand" in n.lower() or "wrist" in n.lower())]

    def avg_x(group_name: str) -> float | None:
        idx = group_names[group_name]
        xs = []
        for v in mesh.vertices:
            for g in v.groups:
                if g.group == idx and g.weight > 0.3:
                    xs.append((obj.matrix_world @ v.co).x)
                    break
        if not xs:
            return None
        return sum(xs) / len(xs)

    if candidates_left and candidates_right:
        lx = avg_x(candidates_left[0])
        rx = avg_x(candidates_right[0])
        if lx is not None and rx is not None:
            sep = abs(rx - lx)
            return (
                f"approx {sep:.3f} m between groups "
                f"'{candidates_left[0]}' and '{candidates_right[0]}' (world X span)"
            )

    mn, mx = world_bbox(obj)
    return f"vertex-group estimate unavailable; body width X ≈ {mx.x - mn.x:.3f} m"


def analyze_human(basemesh: bpy.types.Object) -> dict:
    mesh = basemesh.data
    orient = estimate_forward_and_up(basemesh)
    sk = shape_key_names(basemesh)
    materials = []
    for slot in basemesh.material_slots:
        materials.append(slot.material.name if slot.material else None)
    modifiers = [{"name": m.name, "type": m.type, "show_viewport": m.show_viewport} for m in basemesh.modifiers]
    vgroups = [g.name for g in basemesh.vertex_groups]
    meta = {
        "name": "Neutro Body V1 Baseline",
        "objectName": basemesh.name,
        "objectType": basemesh.type,
        "generator": "MPFB",
        "mpfbVersion": "2.0.16",
        "blenderVersion": bpy.app.version_string,
        "scaleFactor": "Meter",
        "rig": False,
        "phenotype": {
            "gender": "neutral",
            "age": "young",
            "muscle": "averagemuscle",
            "weight": "averageweight",
            "height": "average",
            "proportions": "average",
            "race": "universal",
            "addPhenotype": True,
            "addBreast": False,
            "randomization": False,
        },
        "vertexCount": len(mesh.vertices),
        "faceCount": len(mesh.polygons),
        "triangleCount": estimate_triangles(mesh),
        "shapeKeyCount": len(sk),
        "shapeKeysFirst20": sk[:20],
        "vertexGroupCount": len(vgroups),
        "vertexGroupsSample": vgroups[:40],
        "modifiers": modifiers,
        "materials": materials,
        "children": [c.name for c in basemesh.children],
        "relatedObjects": related_objects(basemesh),
        "dimensions": orient["dimensions"],
        "bboxMin": orient["bboxMin"],
        "bboxMax": orient["bboxMax"],
        "forwardAxis": orient["forwardAxis"],
        "upAxis": orient["upAxis"],
        "widthAxis": orient["widthAxis"],
        "depthAxis": orient["depthAxis"],
        "armSeparation": estimate_arm_separation(basemesh),
        "posture": "T/A-pose MakeHuman default (feet on ground); pose not modified",
        "blendPath": str(BLEND_PATH.as_posix()),
        "artifacts": {
            "front": "front.png",
            "back": "back.png",
            "left": "left.png",
            "right": "right.png",
        },
    }
    return meta


# ---------------------------------------------------------------------------
# Diagnostic renders (temporary clay — restored after)
# ---------------------------------------------------------------------------

def setup_studio_world() -> None:
    world = bpy.data.worlds.new("NeutroDiagWorld")
    bpy.context.scene.world = world
    world.use_nodes = True
    nodes = world.node_tree.nodes
    links = world.node_tree.links
    nodes.clear()
    bg = nodes.new("ShaderNodeBackground")
    bg.inputs[0].default_value = (0.035, 0.036, 0.038, 1.0)
    bg.inputs[1].default_value = 1.0
    out = nodes.new("ShaderNodeOutputWorld")
    links.new(bg.outputs[0], out.inputs[0])


def ensure_lights() -> None:
    def add_light(name: str, energy: float, loc: tuple[float, float, float], size: float = 2.0):
        light_data = bpy.data.lights.new(name=name, type="AREA")
        light_data.energy = energy
        light_data.size = size
        light_obj = bpy.data.objects.new(name, light_data)
        bpy.context.collection.objects.link(light_obj)
        light_obj.location = loc
        return light_obj

    add_light("NeutroKey", 250.0, (2.2, -2.5, 2.4), 2.5)
    add_light("NeutroFill", 90.0, (-2.5, -1.5, 1.8), 3.0)
    add_light("NeutroRim", 120.0, (0.0, 3.0, 2.2), 2.0)


def apply_temp_clay(obj: bpy.types.Object) -> list[bpy.types.Material | None]:
    originals = [slot.material for slot in obj.material_slots]
    clay = bpy.data.materials.new("NeutroDiagClay")
    clay.use_nodes = True
    nodes = clay.node_tree.nodes
    links = clay.node_tree.links
    nodes.clear()
    bsdf = nodes.new("ShaderNodeBsdfPrincipled")
    # Warm neutral clay
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


def restore_materials(obj: bpy.types.Object, originals: list[bpy.types.Material | None]) -> None:
    # Ensure slot count
    while len(obj.material_slots) < len(originals):
        obj.data.materials.append(None)
    for i, mat in enumerate(originals):
        obj.material_slots[i].material = mat
    clay = bpy.data.materials.get("NeutroDiagClay")
    if clay:
        bpy.data.materials.remove(clay)


def create_camera(distance: float, height: float) -> bpy.types.Object:
    cam_data = bpy.data.cameras.new("NeutroDiagCamera")
    cam_data.lens = 50
    cam_data.clip_start = 0.05
    cam_data.clip_end = 100.0
    cam = bpy.data.objects.new("NeutroDiagCamera", cam_data)
    bpy.context.collection.objects.link(cam)
    bpy.context.scene.camera = cam
    cam.location = (0.0, -distance, height)
    # Aim at origin height
    direction = Vector((0.0, 0.0, height)) - cam.location
    cam.rotation_euler = direction.to_track_quat("-Z", "Y").to_euler()
    return cam


def place_camera_for_view(cam: bpy.types.Object, view: str, center: Vector, radius: float) -> None:
    """Orbit camera around world Z for front/back/left/right relative to -Y forward."""
    # MakeHuman typically faces -Y → front camera on -Y
    angles = {
        "front": 0.0,          # looking from -Y toward +Y
        "back": math.pi,       # from +Y
        "left": math.pi / 2,   # from -X (subject's left when facing -Y)
        "right": -math.pi / 2, # from +X
    }
    a = angles[view]
    # Camera position on circle in XY, height = center.z
    x = center.x + radius * math.sin(a)
    y = center.y - radius * math.cos(a)
    z = center.z
    cam.location = (x, y, z)
    direction = center - cam.location
    cam.rotation_euler = direction.to_track_quat("-Z", "Y").to_euler()


def render_views(basemesh: bpy.types.Object) -> dict[str, str]:
    ARTIFACT_DIR.mkdir(parents=True, exist_ok=True)
    scene = bpy.context.scene
    scene.render.engine = "BLENDER_EEVEE" if "BLENDER_EEVEE" in bpy.types.RenderSettings.bl_rna.properties["engine"].enum_items.keys() else "BLENDER_EEVEE_NEXT"
    # Prefer Eevee Next on Blender 5.x
    if hasattr(scene.render, "engine"):
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

    setup_studio_world()
    ensure_lights()
    originals = apply_temp_clay(basemesh)

    mn, mx = world_bbox(basemesh)
    center = (mn + mx) * 0.5
    dims = mx - mn
    height = float(dims.z)
    width = float(max(dims.x, dims.y))
    radius = max(height, width) * 1.35

    cam = create_camera(distance=radius, height=float(center.z))

    outputs: dict[str, str] = {}
    try:
        for view in ("front", "back", "left", "right"):
            place_camera_for_view(cam, view, center, radius)
            out_path = ARTIFACT_DIR / f"{view}.png"
            scene.render.filepath = str(out_path)
            log(f"Rendering {view} → {out_path}")
            bpy.ops.render.render(write_still=True)
            if not out_path.exists():
                fail(f"Render missing: {out_path}")
            outputs[view] = str(out_path.as_posix())
    finally:
        restore_materials(basemesh, originals)
        log("Restored original materials after diagnostic renders")

    return outputs


# ---------------------------------------------------------------------------
# Persist
# ---------------------------------------------------------------------------

def save_blend() -> None:
    BLEND_PATH.parent.mkdir(parents=True, exist_ok=True)
    # Pack nothing extra; keep parametric masters editable
    bpy.ops.wm.save_as_mainfile(filepath=str(BLEND_PATH))
    log(f"Saved master blend: {BLEND_PATH}")


def write_metadata(meta: dict) -> None:
    ARTIFACT_DIR.mkdir(parents=True, exist_ok=True)
    METADATA_PATH.write_text(json.dumps(meta, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    log(f"Wrote metadata: {METADATA_PATH}")


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main() -> None:
    log(f"Blender {bpy.app.version_string}")
    log(f"Repo root: {REPO_ROOT}")
    ensure_mpfb()
    clear_scene()
    basemesh = create_human()

    # Ensure object mode for analysis/renders
    if bpy.context.object and bpy.context.object.mode != "OBJECT":
        bpy.ops.object.mode_set(mode="OBJECT")

    meta = analyze_human(basemesh)
    log(
        f"Mesh stats: verts={meta['vertexCount']} faces={meta['faceCount']} "
        f"tris≈{meta['triangleCount']} shapekeys={meta['shapeKeyCount']}"
    )

    # Renders first (temp clay), then save blend with original materials restored
    renders = render_views(basemesh)
    meta["renderPaths"] = renders

    # Remove diagnostic lights/camera/world from master file before saving
    for name in ("NeutroDiagCamera", "NeutroKey", "NeutroFill", "NeutroRim"):
        obj = bpy.data.objects.get(name)
        if obj:
            bpy.data.objects.remove(obj, do_unlink=True)
    for light_name in list(bpy.data.lights.keys()):
        if light_name.startswith("Neutro"):
            bpy.data.lights.remove(bpy.data.lights[light_name])
    cam_data = bpy.data.cameras.get("NeutroDiagCamera")
    if cam_data:
        bpy.data.cameras.remove(cam_data)
    world = bpy.data.worlds.get("NeutroDiagWorld")
    if world:
        bpy.data.worlds.remove(world)

    # Re-select only the human for a clean master file
    bpy.ops.object.select_all(action="DESELECT")
    basemesh.select_set(True)
    bpy.context.view_layer.objects.active = basemesh

    save_blend()
    write_metadata(meta)
    log("PASS — Neutro Body V1 Baseline created")


if __name__ == "__main__":
    try:
        main()
    except SystemExit:
        raise
    except Exception:
        traceback.print_exc()
        fail("Unhandled exception during baseline creation")
