"""
Generate Neutro Body V1 pose candidates Q1–Q4 (selector pose).

Source (immutable):
  assets/blender/neutro-body/neutro_body_v1_pose_working_source.blend
  (= anatomy_source L4 + MPFB standard 'game_engine' rig, rest A-pose)

Rig: MPFB standard "game_engine" (53 bones, XYZ rotation mode, weights imported).
Bones posed here:
  upperarm_l/r  — shoulder abduction (frontal plane, armature Y axis)
  lowerarm_l/r  — slight elbow flexion (toward front)
  finger/thumb segments — slight relaxed curl (+X local)
  thigh_l/r     — slight hip abduction (frontal plane)
  foot_l/r      — sole leveling (counter-rotation) + subtle symmetric toe-out
NOT touched: spine_01..03, neck_01, head, clavicles, pelvis, Root rotations.

Pose values are computed against the measured rest direction of each bone chain
(not blind local-angle rotations). Applied via pose_bone.matrix so parenting and
bone-roll are respected. Armature modifier is NOT applied; mesh topology intact.

Candidates (target arm angle from vertical torso axis / hip opening delta):
  Q1 Current A-Pose      : control, no changes (~42° arms)
  Q2 Relaxed Selector    : arms ≈ 22°, elbows +8°, fingers 12°, legs +3°, toe-out 4°
  Q3 Open Selector       : arms ≈ 30°, elbows +8°, fingers 12°, legs +5°, toe-out 4°
  Q4 Minimal Selector    : arms ≈ 15°, elbows +6°, fingers 12°, legs +1.8°, toe-out 3°

Run:
  blender.exe --background --python tools/blender/generate_neutro_body_v1_pose_candidates.py
"""

from __future__ import annotations

import hashlib
import json
import math
import sys
import traceback
from pathlib import Path

import bpy
from mathutils import Matrix, Vector

SCRIPT_PATH = Path(__file__).resolve()
REPO_ROOT = SCRIPT_PATH.parents[2]
SOURCE_PATH = REPO_ROOT / "assets" / "blender" / "neutro-body" / "neutro_body_v1_pose_working_source.blend"
OUT_BLEND_DIR = REPO_ROOT / "assets" / "blender" / "neutro-body" / "pose-candidates"
ARTIFACT_DIR = REPO_ROOT / "artifacts" / "body-v1-pose"
COMPARISON_PATH = ARTIFACT_DIR / "comparison.json"

EXPECTED_TOPO = (19158, 18486, 36972)

FINGER_BASES = ("index", "middle", "ring", "pinky")


def log(msg: str) -> None:
    print(f"[neutro-pose] {msg}", flush=True)


def fail(msg: str, code: int = 1) -> None:
    log(f"FAIL: {msg}")
    sys.exit(code)


def sha256_file(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as f:
        for chunk in iter(lambda: f.read(1024 * 1024), b""):
            h.update(chunk)
    return h.hexdigest().upper()


def open_blend(path: Path) -> None:
    if not path.is_file():
        fail(f"Missing: {path}")
    bpy.ops.wm.open_mainfile(filepath=str(path))
    log(f"Opened {path.name}")


def get_rig_and_human() -> tuple[bpy.types.Object, bpy.types.Object]:
    rig = bpy.data.objects.get("Human.rig")
    human = bpy.data.objects.get("Human")
    if rig is None or human is None:
        fail("Missing Human.rig or Human")
    return rig, human


# ---------------------------------------------------------------------------
# Bone posing helpers
# ---------------------------------------------------------------------------

def bone_head(rig, name: str) -> Vector:
    pb = rig.pose.bones[name]
    return (rig.matrix_world @ pb.matrix).translation.copy()


def bone_dir(rig, name: str) -> Vector:
    """World-space direction of the bone (head -> tail)."""
    pb = rig.pose.bones[name]
    m = rig.matrix_world @ pb.matrix
    return (m.to_3x3() @ Vector((0, 1, 0))).normalized()


def rotate_bone_world(rig, name: str, axis: Vector, angle_rad: float) -> None:
    """Rotate a pose bone around a world axis through its own head."""
    pb = rig.pose.bones[name]
    bpy.context.view_layer.update()
    head = pb.matrix.translation.copy()  # armature space == world (rig at origin)
    rot = Matrix.Rotation(angle_rad, 4, axis.normalized())
    pb.matrix = Matrix.Translation(head) @ rot @ Matrix.Translation(-head) @ pb.matrix
    bpy.context.view_layer.update()


def frontal_angle_from_down(direction: Vector) -> float:
    """Angle (deg) of a direction vs straight-down, projected on the XZ plane."""
    return math.degrees(math.atan2(abs(direction.x), -direction.z))


def set_arm_abduction(rig, side: str, target_deg: float) -> dict:
    """Rotate upperarm in the frontal plane so the arm chain points target_deg from vertical."""
    name = f"upperarm_{side}"
    d = bone_dir(rig, name)
    current = frontal_angle_from_down(d)
    delta = current - target_deg  # positive = close toward torso
    sign = 1.0 if side == "l" else -1.0
    rotate_bone_world(rig, name, Vector((0, 1, 0)), sign * math.radians(delta))
    return {"bone": name, "axis": "world Y (frontal plane)", "fromDeg": round(current, 2),
            "toDeg": target_deg, "appliedDeltaDeg": round(sign * delta, 2)}


def flex_elbow(rig, side: str, flex_deg: float) -> dict:
    """Slight elbow flexion tipping the forearm toward the front (-Y)."""
    name = f"lowerarm_{side}"
    arm_dir = bone_dir(rig, f"upperarm_{side}")
    axis = arm_dir.cross(Vector((0, -1, 0)))
    if axis.length < 1e-6:
        axis = Vector((1, 0, 0))
    rotate_bone_world(rig, name, axis, math.radians(flex_deg))
    return {"bone": name, "axis": "perp(arm, front) — flexion toward -Y", "appliedDeg": flex_deg}


def curl_fingers(rig, side: str, curl_deg: float, thumb_deg: float) -> dict:
    for base in FINGER_BASES:
        for seg in ("01", "02", "03"):
            pb = rig.pose.bones.get(f"{base}_{seg}_{side}")
            if pb:
                pb.rotation_mode = "XYZ"
                pb.rotation_euler = (math.radians(curl_deg), 0, 0)
    for seg in ("02", "03"):
        pb = rig.pose.bones.get(f"thumb_{seg}_{side}")
        if pb:
            pb.rotation_mode = "XYZ"
            pb.rotation_euler = (math.radians(thumb_deg), 0, 0)
    bpy.context.view_layer.update()
    return {"fingers": f"{FINGER_BASES} seg01-03 +{curl_deg}° localX", "thumb": f"seg02-03 +{thumb_deg}° localX"}


def open_leg(rig, side: str, delta_deg: float) -> dict:
    """Open the thigh outward in the frontal plane by delta_deg; keep sole level."""
    thigh = f"thigh_{side}"
    d = bone_dir(rig, thigh)
    current = frontal_angle_from_down(d)
    sign = -1.0 if side == "l" else 1.0  # opening = opposite of closing
    rotate_bone_world(rig, thigh, Vector((0, 1, 0)), sign * math.radians(delta_deg))
    # Counter-rotate foot to keep the sole level
    rotate_bone_world(rig, f"foot_{side}", Vector((0, 1, 0)), -sign * math.radians(delta_deg))
    return {"bone": thigh, "axis": "world Y (frontal plane)", "fromDeg": round(current, 2),
            "openedDeltaDeg": delta_deg, "footCounterRotated": True}


def toe_out(rig, side: str, deg: float) -> dict:
    sign = 1.0 if side == "l" else -1.0
    rotate_bone_world(rig, f"foot_{side}", Vector((0, 0, 1)), sign * math.radians(deg))
    return {"bone": f"foot_{side}", "axis": "world Z", "appliedDeg": sign * deg}


def ground_feet(rig, human) -> float:
    """Shift the rig object vertically so the mesh rests exactly on z=0."""
    bpy.context.view_layer.update()
    mn, _ = world_bbox(human)
    shift = -mn.z
    if abs(shift) > 1e-5:
        rig.location.z += shift
        bpy.context.view_layer.update()
    return float(shift)


# ---------------------------------------------------------------------------
# Geometry / measurement
# ---------------------------------------------------------------------------

def depsgraph_eval(obj):
    return obj.evaluated_get(bpy.context.evaluated_depsgraph_get())


def _set_masks(obj, enabled: bool) -> list:
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


def world_bbox(obj) -> tuple[Vector, Vector]:
    ev = depsgraph_eval(obj)
    corners = [ev.matrix_world @ Vector(c) for c in ev.bound_box]
    xs = [c.x for c in corners]
    ys = [c.y for c in corners]
    zs = [c.z for c in corners]
    return Vector((min(xs), min(ys), min(zs))), Vector((max(xs), max(ys), max(zs)))


def posed_group_verts(obj, group_names: list[str], wmin: float = 0.35, step: int = 1) -> list[Vector]:
    """POSED world coordinates of vertices belonging to any of the given groups."""
    names = [n for n in group_names if n in obj.vertex_groups]
    if not names:
        return []
    idxs = {obj.vertex_groups[n].index for n in names}
    prior = _set_masks(obj, False)
    try:
        ev = depsgraph_eval(obj)
        mesh = ev.to_mesh()
        try:
            if len(mesh.vertices) != len(obj.data.vertices):
                return []  # cannot map indices
            matrix = ev.matrix_world
            out = []
            for i, v in enumerate(obj.data.vertices):
                if step > 1 and i % step:
                    continue
                for g in v.groups:
                    if g.group in idxs and g.weight >= wmin:
                        out.append(matrix @ mesh.vertices[i].co)
                        break
            return out
        finally:
            ev.to_mesh_clear()
    finally:
        _restore_masks(prior)


def min_gap(pts_a: list[Vector], pts_b: list[Vector]) -> float | str:
    if len(pts_a) < 5 or len(pts_b) < 5:
        return "No fiable"
    best = 1e9
    for a in pts_a:
        for b in pts_b:
            d = (a - b).length
            if d < best:
                best = d
    return float(best)


def measure_pose(rig, human) -> dict:
    bpy.context.view_layer.update()
    mn, mx = world_bbox(human)

    # Arm angle: upperarm bone direction vs vertical (frontal plane), avg L/R
    ang_l = frontal_angle_from_down(bone_dir(rig, "upperarm_l"))
    ang_r = frontal_angle_from_down(bone_dir(rig, "upperarm_r"))

    # Point sets (posed, decimated for speed)
    arm_l = posed_group_verts(human, ["upperarm_l", "lowerarm_l"], 0.5, step=2)
    arm_r = posed_group_verts(human, ["upperarm_r", "lowerarm_r"], 0.5, step=2)
    torso = posed_group_verts(human, ["spine_01", "spine_02", "spine_03"], 0.5, step=2)
    hand_l = posed_group_verts(human, ["hand_l"], 0.5)
    hand_r = posed_group_verts(human, ["hand_r"], 0.5)
    thigh_l = posed_group_verts(human, ["thigh_l"], 0.5, step=2)
    thigh_r = posed_group_verts(human, ["thigh_r"], 0.5, step=2)

    gap_arm_l = min_gap(arm_l, torso)
    gap_arm_r = min_gap(arm_r, torso)
    gap_hand_l = min_gap(hand_l, thigh_l)
    gap_hand_r = min_gap(hand_r, thigh_r)
    gap_thighs = min_gap(thigh_l, thigh_r)

    def favg(a, b):
        if isinstance(a, float) and isinstance(b, float):
            return (a + b) * 0.5
        return "No fiable"

    hands_dist = "No fiable"
    if hand_l and hand_r:
        cl = sum(hand_l, Vector()) / len(hand_l)
        cr = sum(hand_r, Vector()) / len(hand_r)
        hands_dist = float((cl - cr).length)

    foot_l = bone_head(rig, "foot_l")
    foot_r = bone_head(rig, "foot_r")
    foot_dist = float(abs(foot_l.x - foot_r.x))

    mesh = human.data
    return {
        "armTorsoAngleApproxDeg": {"left": round(ang_l, 2), "right": round(ang_r, 2)},
        "minimumArmTorsoGap": {"left": gap_arm_l, "right": gap_arm_r, "avg": favg(gap_arm_l, gap_arm_r)},
        "handToThighMinimumGap": {"left": gap_hand_l, "right": gap_hand_r, "avg": favg(gap_hand_l, gap_hand_r)},
        "innerThighMinimumGap": gap_thighs,
        "handCenterDistance": hands_dist,
        "footCenterDistance": foot_dist,
        "totalPoseWidth": float(mx.x - mn.x),
        "totalPoseDepth": float(mx.y - mn.y),
        "totalHeight": float(mx.z - mn.z),
        "poseWidthOverHeight": float((mx.x - mn.x) / (mx.z - mn.z)),
        "groundMinZ": float(mn.z),
        "vertexCount": len(mesh.vertices),
        "faceCount": len(mesh.polygons),
        "triangleCount": sum(max(0, len(p.vertices) - 2) for p in mesh.polygons),
    }


# ---------------------------------------------------------------------------
# Rendering (same studio as previous steps)
# ---------------------------------------------------------------------------

VIEWS = ("front", "back", "left", "right", "three-quarter-front", "three-quarter-back")


def clear_diag() -> None:
    for name in list(bpy.data.objects.keys()):
        if name.startswith(("NeutroDiag", "NeutroKey", "NeutroFill", "NeutroRim")):
            bpy.data.objects.remove(bpy.data.objects[name], do_unlink=True)
    for block in (bpy.data.lights, bpy.data.cameras, bpy.data.worlds):
        for item in list(block):
            if item.name.startswith(("NeutroDiag", "NeutroKey", "NeutroFill", "NeutroRim")):
                block.remove(item)


def setup_studio(lens: float = 50.0):
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


def apply_clay(obj) -> list:
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


def restore_mats(obj, originals: list) -> None:
    while len(obj.material_slots) < len(originals):
        obj.data.materials.append(None)
    for i, m in enumerate(originals):
        obj.material_slots[i].material = m


def place_camera(cam, view: str, center: Vector, radius: float) -> None:
    if view == "three-quarter-front":
        a = math.radians(35)
        elev = radius * 0.12
        cam.location = (center.x + radius * math.sin(a), center.y - radius * math.cos(a), center.z + elev)
    elif view == "three-quarter-back":
        a = math.radians(145)
        elev = radius * 0.12
        cam.location = (center.x + radius * math.sin(a), center.y - radius * math.cos(a), center.z + elev)
    else:
        angles = {"front": 0.0, "back": math.pi, "left": math.pi / 2, "right": -math.pi / 2}
        a = angles[view]
        cam.location = (center.x + radius * math.sin(a), center.y - radius * math.cos(a), center.z)
    direction = center - cam.location
    cam.rotation_euler = direction.to_track_quat("-Z", "Y").to_euler()


def render_views(prefix: str, human, cam_cfg: dict) -> dict:
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


def append_posed_human(blend: Path, label: str):
    """Append the Human mesh and its rig from a candidate blend."""
    with bpy.data.libraries.load(str(blend), link=False) as (df, dt):
        dt.objects = [n for n in df.objects if n in ("Human", "Human.rig")]
    human = rig = None
    for obj in dt.objects:
        bpy.context.collection.objects.link(obj)
        if obj.type == "MESH":
            human = obj
        elif obj.type == "ARMATURE":
            rig = obj
    if human is None or rig is None:
        fail(f"Could not append Human+rig from {blend.name}")
    rig.name = f"NeutroCmpRig_{label}"
    human.name = f"NeutroCmp_{label}"
    return human, rig


def render_comparison(blend_paths, out_name: str, view: str, z_min: float, z_max: float) -> str:
    open_blend(SOURCE_PATH)
    for o in list(bpy.data.objects):
        bpy.data.objects.remove(o, do_unlink=True)

    pairs = []
    for label, path in blend_paths:
        human, rig = append_posed_human(path, label)
        apply_clay(human)
        pairs.append((human, rig))

    spacing = 1.25
    for i, (human, rig) in enumerate(pairs):
        bpy.context.view_layer.update()
        mn, mx = world_bbox(human)
        rig.location.z += -mn.z
        bpy.context.view_layer.update()
        mn, mx = world_bbox(human)
        cx = (i - 1.5) * spacing
        cur = (mn.x + mx.x) * 0.5
        rig.location.x += cx - cur
        bpy.context.view_layer.update()

    all_min = Vector((1e9, 1e9, 1e9))
    all_max = Vector((-1e9, -1e9, -1e9))
    for human, _ in pairs:
        mn, mx = world_bbox(human)
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
        fail("Refusing to overwrite pose working source")
    bpy.ops.wm.save_as_mainfile(filepath=str(path), copy=True)
    log(f"Saved {path.name}")


PROFILES = [
    {
        "id": "Q1",
        "key": "candidateQ1",
        "name": "neutro_body_v1_q1_current_a_pose",
        "label": "Current A-Pose",
        "prefix": "q1-current-a-pose",
        "blend": OUT_BLEND_DIR / "neutro_body_v1_q1_current_a_pose.blend",
        "pose": None,
    },
    {
        "id": "Q2",
        "key": "candidateQ2",
        "name": "neutro_body_v1_q2_relaxed_selector",
        "label": "Relaxed Selector",
        "prefix": "q2-relaxed-selector",
        "blend": OUT_BLEND_DIR / "neutro_body_v1_q2_relaxed_selector.blend",
        "pose": {"armDeg": 22.0, "elbowDeg": 8.0, "fingerDeg": 12.0, "thumbDeg": 8.0,
                 "legOpenDeg": 3.0, "toeOutDeg": 4.0},
    },
    {
        "id": "Q3",
        "key": "candidateQ3",
        "name": "neutro_body_v1_q3_open_selector",
        "label": "Open Selector",
        "prefix": "q3-open-selector",
        "blend": OUT_BLEND_DIR / "neutro_body_v1_q3_open_selector.blend",
        "pose": {"armDeg": 30.0, "elbowDeg": 8.0, "fingerDeg": 12.0, "thumbDeg": 8.0,
                 "legOpenDeg": 5.0, "toeOutDeg": 4.0},
    },
    {
        "id": "Q4",
        "key": "candidateQ4",
        "name": "neutro_body_v1_q4_minimal_selector",
        "label": "Minimal Selector",
        "prefix": "q4-minimal-selector",
        "blend": OUT_BLEND_DIR / "neutro_body_v1_q4_minimal_selector.blend",
        "pose": {"armDeg": 15.0, "elbowDeg": 6.0, "fingerDeg": 12.0, "thumbDeg": 8.0,
                 "legOpenDeg": 1.8, "toeOutDeg": 3.0},
    },
]


def apply_pose(rig, human, cfg: dict) -> dict:
    applied = {"arms": [], "elbows": [], "hands": [], "legs": [], "feet": [], "groundShift": 0.0}
    for side in ("l", "r"):
        applied["arms"].append(set_arm_abduction(rig, side, cfg["armDeg"]))
    for side in ("l", "r"):
        applied["elbows"].append(flex_elbow(rig, side, cfg["elbowDeg"]))
    for side in ("l", "r"):
        applied["hands"].append(curl_fingers(rig, side, cfg["fingerDeg"], cfg["thumbDeg"]))
    for side in ("l", "r"):
        applied["legs"].append(open_leg(rig, side, cfg["legOpenDeg"]))
    for side in ("l", "r"):
        applied["feet"].append(toe_out(rig, side, cfg["toeOutDeg"]))
    applied["groundShift"] = round(ground_feet(rig, human), 5)
    return applied


def main() -> None:
    log(f"Blender {bpy.app.version_string}")

    sha0 = sha256_file(SOURCE_PATH)
    log(f"Source SHA-256: {sha0}")

    open_blend(SOURCE_PATH)
    rig, human = get_rig_and_human()

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
        "rig": "MPFB standard game_engine (53 bones)",
        "camera": cam_cfg,
        "bonesUsed": {
            "arms": ["upperarm_l/r", "lowerarm_l/r"],
            "hands": ["index/middle/ring/pinky_01-03_l/r", "thumb_02-03_l/r"],
            "legs": ["thigh_l/r", "foot_l/r"],
            "spineHeadUntouched": ["pelvis", "spine_01..03", "neck_01", "head", "clavicle_l/r", "Root(rot)"],
        },
    }

    expected = None
    blend_list = []

    for profile in PROFILES:
        log(f"=== {profile['id']} — {profile['label']} ===")
        open_blend(SOURCE_PATH)
        rig, human = get_rig_and_human()

        applied = None
        if profile["pose"]:
            applied = apply_pose(rig, human, profile["pose"])

        meas = measure_pose(rig, human)

        topo = (meas["vertexCount"], meas["faceCount"], meas["triangleCount"])
        if topo != EXPECTED_TOPO:
            fail(f"Topology changed on {profile['id']}: {topo}")
        if expected is None:
            expected = topo

        save_copy(profile["blend"])
        renders = render_views(profile["prefix"], human, cam_cfg)
        blend_list.append((profile["id"], profile["blend"]))

        comparison[profile["key"]] = {
            "name": profile["name"],
            "label": profile["label"],
            "blendPath": str(profile["blend"].as_posix()),
            "poseConfig": profile["pose"],
            "rotationsApplied": applied,
            "measurements": meas,
            "renders": renders,
        }

    comparison["comparisons"] = {
        "front": render_comparison(blend_list, "pose-front-comparison.png", "front", 0.0, 1.80),
        "back": render_comparison(blend_list, "pose-back-comparison.png", "back", 0.0, 1.80),
        "threeQuarter": render_comparison(blend_list, "pose-three-quarter-comparison.png", "three-quarter-front", 0.0, 1.80),
        "armClearance": render_comparison(blend_list, "pose-arm-clearance-comparison.png", "front", 0.85, 1.55),
        "legClearance": render_comparison(blend_list, "pose-leg-clearance-comparison.png", "front", 0.0, 1.10),
    }

    sha1 = sha256_file(SOURCE_PATH)
    comparison["sourceSha256Final"] = sha1
    comparison["sourceUnchanged"] = sha1 == sha0
    if sha1 != sha0:
        fail("Pose working source was modified")

    ARTIFACT_DIR.mkdir(parents=True, exist_ok=True)
    COMPARISON_PATH.write_text(json.dumps(comparison, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    log(f"Wrote {COMPARISON_PATH}")
    log("PASS — pose candidates Q1–Q4 generated")


if __name__ == "__main__":
    try:
        main()
    except SystemExit:
        raise
    except Exception:
        traceback.print_exc()
        fail("Unhandled exception")
