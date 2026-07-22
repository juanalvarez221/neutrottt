"""
Paso 20 — Refine right-arm interaction zone boundaries (R1 / R2 / R3).

Does NOT overwrite:
  public/models/interaction/neutro_body_v1_right_arm_interaction.glb

Outputs:
  assets/blender/neutro-body/interaction/refinement/
    right_arm_r1_current.blend
    right_arm_r2_anatomical_balanced.blend
    right_arm_r3_compact_joints.blend
  artifacts/body-v1-interaction-refinement/
    *.glb (diagnostic)
    *.png (views + comparisons)
    report.json

Universe membership is identical to Paso 19 (ARM_WEIGHT_THRESH / lateral bias).
Only longitudinal zone assignment changes between calibrations.

Run:
  blender.exe --background --python tools/blender/refine_neutro_body_v1_right_arm_boundaries.py
"""

from __future__ import annotations

import hashlib
import json
import math
import sys
from collections import defaultdict
from dataclasses import asdict, dataclass
from pathlib import Path

import bpy
import bmesh
from mathutils import Vector

REPO = Path(__file__).resolve().parents[2]
SOURCE = REPO / "assets" / "blender" / "neutro-body" / "neutro_body_v1_complete_source.blend"
REFINE_DIR = REPO / "assets" / "blender" / "neutro-body" / "interaction" / "refinement"
ART = REPO / "artifacts" / "body-v1-interaction-refinement"
REPORT = ART / "report.json"

ZONE_ORDER = [
    "right_shoulder",
    "right_upper_arm",
    "right_elbow",
    "right_forearm",
    "right_wrist",
    "right_hand",
]
ZONE_MESH_NAMES = {z: f"zone_{z}" for z in ZONE_ORDER}

ZONE_COLORS = {
    "right_shoulder": (0.92, 0.28, 0.22, 1.0),
    "right_upper_arm": (0.95, 0.62, 0.12, 1.0),
    "right_elbow": (0.95, 0.88, 0.18, 1.0),
    "right_forearm": (0.22, 0.72, 0.38, 1.0),
    "right_wrist": (0.18, 0.55, 0.92, 1.0),
    "right_hand": (0.62, 0.28, 0.88, 1.0),
}

BOUNDARY_PAIRS = [
    ("right_shoulder", "right_upper_arm"),
    ("right_upper_arm", "right_elbow"),
    ("right_elbow", "right_forearm"),
    ("right_forearm", "right_wrist"),
    ("right_wrist", "right_hand"),
]

# Same membership as Paso 19 — DO NOT change without stopping.
ARM_WEIGHT_THRESH = 0.12
LATERAL_BIAS = 0.02
OUTLIER_DIST = 0.14
OUTLIER_W_MIN = 0.35

# R1 absolute meters (Paso 19 control)
R1_SHOULDER_EXTENT_M = 0.085
R1_ELBOW_HALF_M = 0.048
R1_WRIST_HALF_M = 0.038


@dataclass(frozen=True)
class Calibration:
    id: str
    label: str
    blend_name: str
    # Fractions of upperArmLength / forearmLength / handLength
    shoulder_of_ua: float  # shoulderEnd = shoulder_of_ua * upperArmLength
    elbow_prox_of_ua: float  # elbow starts this far before ELBOW along UA
    elbow_dist_of_fa: float  # elbow ends this far after ELBOW along FA
    wrist_prox_of_fa: float
    wrist_dist_of_hand: float
    # R1 uses absolute meters when use_absolute=True
    use_absolute: bool = False
    shoulder_m: float = 0.0
    elbow_half_m: float = 0.0
    wrist_half_m: float = 0.0


CALIBRATIONS = [
    Calibration(
        id="R1",
        label="Current Pilot",
        blend_name="right_arm_r1_current.blend",
        shoulder_of_ua=0.0,
        elbow_prox_of_ua=0.0,
        elbow_dist_of_fa=0.0,
        wrist_prox_of_fa=0.0,
        wrist_dist_of_hand=0.0,
        use_absolute=True,
        shoulder_m=R1_SHOULDER_EXTENT_M,
        elbow_half_m=R1_ELBOW_HALF_M,
        wrist_half_m=R1_WRIST_HALF_M,
    ),
    # R2 — Anatomical Balanced
    # Shoulder ≈ proximal 18% of UA (glenohumeral + proximal deltoid)
    # Elbow band ≈ 11% UA proximal + 11% FA distal
    # Wrist band ≈ 11% FA proximal + 14% hand distal
    Calibration(
        id="R2",
        label="Anatomical Balanced",
        blend_name="right_arm_r2_anatomical_balanced.blend",
        shoulder_of_ua=0.18,
        elbow_prox_of_ua=0.11,
        elbow_dist_of_fa=0.11,
        wrist_prox_of_fa=0.11,
        wrist_dist_of_hand=0.14,
    ),
    # R3 — Compact Joints (slightly tighter joints → more shaft surface)
    Calibration(
        id="R3",
        label="Compact Joints",
        blend_name="right_arm_r3_compact_joints.blend",
        shoulder_of_ua=0.14,
        elbow_prox_of_ua=0.085,
        elbow_dist_of_fa=0.085,
        wrist_prox_of_fa=0.085,
        wrist_dist_of_hand=0.11,
    ),
]


def log(msg: str) -> None:
    print(f"[arm-refine] {msg}", flush=True)


def fail(msg: str) -> None:
    log(f"FAIL: {msg}")
    sys.exit(1)


def sha256_file(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as f:
        for chunk in iter(lambda: f.read(1024 * 1024), b""):
            h.update(chunk)
    return h.hexdigest().upper()


def world_bbox(obj):
    corners = [obj.matrix_world @ Vector(c) for c in obj.bound_box]
    xs = [c.x for c in corners]
    ys = [c.y for c in corners]
    zs = [c.z for c in corners]
    return Vector((min(xs), min(ys), min(zs))), Vector((max(xs), max(ys), max(zs)))


def estimate_tris(mesh) -> int:
    return sum(max(0, len(p.vertices) - 2) for p in mesh.polygons)


def bone_world_head(rig, name: str) -> Vector | None:
    pb = rig.pose.bones.get(name)
    if pb is None:
        return None
    return (rig.matrix_world @ pb.matrix).translation.copy()


def bone_world_tail(rig, name: str) -> Vector | None:
    pb = rig.pose.bones.get(name)
    if pb is None:
        return None
    tail_local = Vector((0.0, pb.length, 0.0))
    return (rig.matrix_world @ pb.matrix @ tail_local.to_4d()).xyz


def make_debug_material(zone_id: str, suffix: str):
    name = f"Debug_{zone_id}_{suffix}"
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    nodes = mat.node_tree.nodes
    links = mat.node_tree.links
    nodes.clear()
    bsdf = nodes.new("ShaderNodeBsdfPrincipled")
    bsdf.inputs["Base Color"].default_value = ZONE_COLORS[zone_id]
    bsdf.inputs["Roughness"].default_value = 0.55
    bsdf.inputs["Metallic"].default_value = 0.0
    if "Alpha" in bsdf.inputs:
        bsdf.inputs["Alpha"].default_value = 0.72
    mat.blend_method = "BLEND"
    try:
        mat.surface_render_method = "BLENDED"
    except Exception:
        pass
    out = nodes.new("ShaderNodeOutputMaterial")
    links.new(bsdf.outputs[0], out.inputs[0])
    return mat


def vertex_weight(v, gidx: int) -> float:
    for g in v.groups:
        if g.group == gidx:
            return float(g.weight)
    return 0.0


def project_point_on_segment(p: Vector, a: Vector, b: Vector):
    ab = b - a
    denom = ab.length_squared
    if denom < 1e-12:
        return a.copy(), 0.0, (p - a).length
    t = max(0.0, min(1.0, (p - a).dot(ab) / denom))
    closest = a + ab * t
    return closest, t, (p - closest).length


def arm_polyline_param(p: Vector, joints: list[Vector]):
    """
    Project point onto the arm polyline (piecewise linear).
    Uses nearest segment by Euclidean distance to the segment
    (handles the elbow/wrist kink without jumping across curves).
    Returns (s_arc_length, dist_to_polyline, segment_index).
    """
    best_dist = 1e9
    best_s = 0.0
    best_seg = 0
    cum = 0.0
    for i in range(len(joints) - 1):
        a, b = joints[i], joints[i + 1]
        seg_len = (b - a).length
        _closest, t, dist = project_point_on_segment(p, a, b)
        s = cum + t * seg_len
        if dist < best_dist:
            best_dist = dist
            best_s = s
            best_seg = i
        cum += seg_len
    return best_s, best_dist, best_seg


def is_right_arm_member(w: dict[str, float], dist: float) -> bool:
    """Identical universe gate as Paso 19."""
    w_clav = w.get("clavicle_r", 0.0)
    w_ua = w.get("upperarm_r", 0.0)
    w_la = w.get("lowerarm_r", 0.0)
    w_hand = w.get("hand_r", 0.0)
    w_thumb = (
        w.get("thumb_01_r", 0.0)
        + w.get("thumb_02_r", 0.0)
        + w.get("thumb_03_r", 0.0)
    )
    w_right = max(w_clav, w_ua, w_la, w_hand) + 0.25 * min(1.0, w_thumb)
    w_left = max(
        w.get("clavicle_l", 0.0),
        w.get("upperarm_l", 0.0),
        w.get("lowerarm_l", 0.0),
        w.get("hand_l", 0.0),
    )
    if w_right < ARM_WEIGHT_THRESH:
        return False
    if w_left > w_right + LATERAL_BIAS:
        return False
    if dist > OUTLIER_DIST and w_right < OUTLIER_W_MIN:
        return False
    return True


def resolve_bands(cal: Calibration, ua_len: float, fa_len: float, hand_len: float, s_elbow: float, s_wrist: float):
    if cal.use_absolute:
        shoulder_end = cal.shoulder_m
        elbow_lo = s_elbow - cal.elbow_half_m
        elbow_hi = s_elbow + cal.elbow_half_m
        wrist_lo = s_wrist - cal.wrist_half_m
        wrist_hi = s_wrist + cal.wrist_half_m
    else:
        shoulder_end = cal.shoulder_of_ua * ua_len
        elbow_lo = s_elbow - cal.elbow_prox_of_ua * ua_len
        elbow_hi = s_elbow + cal.elbow_dist_of_fa * fa_len
        wrist_lo = s_wrist - cal.wrist_prox_of_fa * fa_len
        wrist_hi = s_wrist + cal.wrist_dist_of_hand * hand_len
    return shoulder_end, elbow_lo, elbow_hi, wrist_lo, wrist_hi


def classify_zone(
    s: float,
    w: dict[str, float],
    shoulder_end: float,
    elbow_lo: float,
    elbow_hi: float,
    wrist_lo: float,
    wrist_hi: float,
) -> str:
    """Exclusive deterministic assignment for a universe member face."""
    w_clav = w.get("clavicle_r", 0.0)
    w_ua = w.get("upperarm_r", 0.0)
    w_la = w.get("lowerarm_r", 0.0)
    w_hand = w.get("hand_r", 0.0)
    w_thumb = (
        w.get("thumb_01_r", 0.0)
        + w.get("thumb_02_r", 0.0)
        + w.get("thumb_03_r", 0.0)
    )

    # Distal priority: hand / wrist
    if s >= wrist_hi:
        return "right_hand"
    if wrist_lo <= s < wrist_hi:
        if (w_hand + w_thumb * 0.5) > w_la + 0.05:
            return "right_hand"
        return "right_wrist"

    if elbow_lo <= s <= elbow_hi:
        return "right_elbow"

    if s <= shoulder_end:
        # R1 kept a weight escape hatch; keep for R1 parity only via absolute bands.
        # For anatomical cals, trust s primarily; light clavicle nudge near boundary.
        if w_clav >= 0.12 and s <= shoulder_end * 1.15:
            return "right_shoulder"
        return "right_shoulder"

    if s < elbow_lo:
        return "right_upper_arm"

    if s < wrist_lo:
        return "right_forearm"

    return "right_hand"


def classify_zone_r1(
    s: float,
    w: dict[str, float],
    shoulder_end: float,
    elbow_lo: float,
    elbow_hi: float,
    wrist_lo: float,
    wrist_hi: float,
) -> str:
    """Exact Paso 19 classification for control parity."""
    w_clav = w.get("clavicle_r", 0.0)
    w_ua = w.get("upperarm_r", 0.0)
    w_la = w.get("lowerarm_r", 0.0)
    w_hand = w.get("hand_r", 0.0)
    w_thumb = (
        w.get("thumb_01_r", 0.0)
        + w.get("thumb_02_r", 0.0)
        + w.get("thumb_03_r", 0.0)
    )

    if s >= wrist_hi or (s >= wrist_lo and (w_hand + w_thumb * 0.5) >= w_la):
        if s >= wrist_hi:
            return "right_hand"
        if (w_hand + w_thumb * 0.5) > w_la + 0.05:
            return "right_hand"
        return "right_wrist"

    if wrist_lo <= s < wrist_hi:
        return "right_wrist"

    if elbow_lo <= s <= elbow_hi:
        return "right_elbow"

    if s <= shoulder_end:
        if w_clav >= 0.08 or w_ua >= 0.2 or s <= shoulder_end * 0.85:
            return "right_shoulder"
        return "right_upper_arm"

    if s < elbow_lo:
        return "right_upper_arm"

    if s < wrist_lo:
        return "right_forearm"

    return "right_hand"


def face_area(mesh, poly, mw) -> float:
    # Triangulate polygon area in world space
    verts = [mw @ mesh.vertices[i].co for i in poly.vertices]
    if len(verts) < 3:
        return 0.0
    area = 0.0
    origin = verts[0]
    for i in range(1, len(verts) - 1):
        area += ((verts[i] - origin).cross(verts[i + 1] - origin)).length * 0.5
    return area


def extract_zone_object(src_obj, face_indices: list[int], name: str, mat):
    bpy.ops.object.select_all(action="DESELECT")
    src_obj.select_set(True)
    bpy.context.view_layer.objects.active = src_obj
    bpy.ops.object.duplicate()
    zone = bpy.context.active_object
    zone.name = name
    zone.data = zone.data.copy()
    zone.data.name = name

    bm = bmesh.new()
    bm.from_mesh(zone.data)
    bm.faces.ensure_lookup_table()
    keep = set(face_indices)
    to_del = [f for f in bm.faces if f.index not in keep]
    bmesh.ops.delete(bm, geom=to_del, context="FACES")
    loose = [v for v in bm.verts if not v.link_faces]
    if loose:
        bmesh.ops.delete(bm, geom=loose, context="VERTS")
    bm.to_mesh(zone.data)
    bm.free()
    zone.data.update()
    zone.data.materials.clear()
    zone.data.materials.append(mat)
    return zone


def clear_except(keep_names: set[str]):
    for obj in list(bpy.data.objects):
        if obj.name not in keep_names:
            bpy.data.objects.remove(obj, do_unlink=True)
    for block in (
        bpy.data.meshes,
        bpy.data.armatures,
        bpy.data.materials,
        bpy.data.cameras,
        bpy.data.lights,
        bpy.data.worlds,
    ):
        for item in list(block):
            if item.users == 0:
                block.remove(item)


def boundary_stats(mesh, face_zone: dict[int, str], a: str, b: str):
    """
    Boundary edges = mesh edges whose two adjacent faces belong to zones a and b.
    Connected components over those undirected edges (vertex adjacency).
    """
    edge_keys = []
    vert_adj: dict[int, set[int]] = defaultdict(set)

    # Build face adjacency via loops
    # polygons share edges by sorted vertex pair
    edge_to_faces: dict[tuple[int, int], list[int]] = defaultdict(list)
    for poly in mesh.polygons:
        vs = list(poly.vertices)
        n = len(vs)
        for i in range(n):
            e = tuple(sorted((vs[i], vs[(i + 1) % n])))
            edge_to_faces[e].append(poly.index)

    for e, faces in edge_to_faces.items():
        if len(faces) != 2:
            continue
        z0 = face_zone.get(faces[0])
        z1 = face_zone.get(faces[1])
        if {z0, z1} == {a, b}:
            edge_keys.append(e)
            u, v = e
            vert_adj[u].add(v)
            vert_adj[v].add(u)

    # Connected components on boundary vertices
    visited = set()
    components = 0
    for start in list(vert_adj.keys()):
        if start in visited:
            continue
        components += 1
        stack = [start]
        visited.add(start)
        while stack:
            u = stack.pop()
            for v in vert_adj[u]:
                if v not in visited:
                    visited.add(v)
                    stack.append(v)

    return {
        "boundary": f"{a}|{b}",
        "edgeCount": len(edge_keys),
        "connectedComponents": components,
        "boundaryVertices": len(vert_adj),
    }


def setup_studio():
    scene = bpy.context.scene
    try:
        scene.render.engine = "BLENDER_EEVEE_NEXT"
    except TypeError:
        try:
            scene.render.engine = "BLENDER_EEVEE"
        except TypeError:
            scene.render.engine = "CYCLES"
            scene.cycles.samples = 24
    scene.render.resolution_x = 900
    scene.render.resolution_y = 1100
    scene.render.image_settings.file_format = "PNG"
    scene.render.film_transparent = False

    world = bpy.data.worlds.new("RefineWorld")
    scene.world = world
    world.use_nodes = True
    nt = world.node_tree
    nt.nodes.clear()
    bg = nt.nodes.new("ShaderNodeBackground")
    bg.inputs[0].default_value = (0.04, 0.041, 0.043, 1.0)
    out = nt.nodes.new("ShaderNodeOutputWorld")
    nt.links.new(bg.outputs[0], out.inputs[0])

    def add_light(name, energy, loc, size):
        d = bpy.data.lights.new(name, type="AREA")
        d.energy = energy
        d.size = size
        o = bpy.data.objects.new(name, d)
        bpy.context.collection.objects.link(o)
        o.location = loc

    add_light("Key", 280.0, (2.0, -2.4, 2.2), 2.2)
    add_light("Fill", 100.0, (-2.4, -1.4, 1.6), 2.8)
    add_light("Rim", 130.0, (0.2, 3.0, 2.0), 2.0)

    cam_d = bpy.data.cameras.new("RefineCam")
    cam_d.lens = 55.0
    cam = bpy.data.objects.new("RefineCam", cam_d)
    bpy.context.collection.objects.link(cam)
    scene.camera = cam
    return cam


def place_cam(cam, view: str, center: Vector, radius: float):
    # Blender: front = -Y, back = +Y, outer (right arm) ≈ -X, inner ≈ +X
    # three-quarter ≈ between front and outer
    offsets = {
        "front": Vector((0.0, -1.0, 0.08)),
        "back": Vector((0.0, 1.0, 0.08)),
        "outer-side": Vector((-1.0, 0.15, 0.05)),
        "inner-side": Vector((1.0, 0.15, 0.05)),
        "three-quarter": Vector((-0.65, -0.75, 0.1)),
    }
    direction = offsets[view].normalized()
    cam.location = center + direction * radius
    cam.rotation_euler = (center - cam.location).to_track_quat("-Z", "Y").to_euler()


def composite_horizontal(paths: list[Path], out_path: Path, labels: list[str]):
    """Simple side-by-side PNG composite via Blender images."""
    images = [bpy.data.images.load(str(p)) for p in paths]
    w = images[0].size[0]
    h = images[0].size[1]
    total_w = w * len(images)
    # Create new image
    comp = bpy.data.images.new(out_path.stem, width=total_w, height=h, alpha=False)
    pixels = [0.0] * (total_w * h * 4)
    for i, img in enumerate(images):
        img.pixels  # force load
        src = list(img.pixels)
        for y in range(h):
            for x in range(w):
                si = (y * w + x) * 4
                di = (y * total_w + i * w + x) * 4
                pixels[di : di + 4] = src[si : si + 4]
    comp.pixels = pixels
    comp.filepath_raw = str(out_path)
    comp.file_format = "PNG"
    comp.save()
    for img in images:
        bpy.data.images.remove(img)
    bpy.data.images.remove(comp)
    log(f"Comparison {out_path.name} ({labels})")


def main():
    log(f"Blender {bpy.app.version_string}")
    if not SOURCE.is_file():
        fail(f"Missing source: {SOURCE}")

    ART.mkdir(parents=True, exist_ok=True)
    REFINE_DIR.mkdir(parents=True, exist_ok=True)

    source_sha = sha256_file(SOURCE)
    bpy.ops.wm.open_mainfile(filepath=str(SOURCE))
    human = bpy.data.objects.get("Human")
    rig = bpy.data.objects.get("Human.rig")
    if human is None or rig is None:
        fail("Missing Human or Human.rig")

    for m in human.modifiers:
        m.show_viewport = True
        m.show_render = True
    bpy.context.view_layer.update()

    shoulder = bone_world_head(rig, "upperarm_r")
    elbow = bone_world_head(rig, "lowerarm_r")
    wrist = bone_world_head(rig, "hand_r")
    tip = bone_world_tail(rig, "middle_03_r") or bone_world_head(rig, "middle_03_r")
    if tip is None:
        tip = bone_world_tail(rig, "hand_r") or (wrist + (wrist - elbow).normalized() * 0.16)
    if not all(v is not None for v in (shoulder, elbow, wrist)):
        fail("Missing arm bones")

    depsgraph = bpy.context.evaluated_depsgraph_get()
    evaluated = human.evaluated_get(depsgraph)
    try:
        baked_mesh = bpy.data.meshes.new_from_object(
            evaluated, preserve_all_data_layers=True, depsgraph=depsgraph
        )
    except TypeError:
        baked_mesh = bpy.data.meshes.new_from_object(evaluated)

    baked_mesh.name = "InteractionBake"
    baked = bpy.data.objects.new("InteractionBake", baked_mesh)
    bpy.context.collection.objects.link(baked)
    baked.matrix_world = evaluated.matrix_world.copy()
    bpy.context.view_layer.update()

    mn, mx = world_bbox(baked)
    offset = Vector((-(mn.x + mx.x) * 0.5, -(mn.y + mx.y) * 0.5, -mn.z))
    baked.location += offset
    bpy.context.view_layer.update()
    bpy.ops.object.select_all(action="DESELECT")
    baked.select_set(True)
    bpy.context.view_layer.objects.active = baked
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    bpy.context.view_layer.update()

    shoulder_c = shoulder + offset
    elbow_c = elbow + offset
    wrist_c = wrist + offset
    hand_end = tip + offset
    joints = [shoulder_c, elbow_c, wrist_c, hand_end]

    ua_len = (elbow_c - shoulder_c).length
    fa_len = (wrist_c - elbow_c).length
    hand_len = (hand_end - wrist_c).length
    s_elbow = ua_len
    s_wrist = ua_len + fa_len
    total_len = s_wrist + hand_len

    log(
        f"Lengths UA={ua_len:.4f} FA={fa_len:.4f} Hand={hand_len:.4f} total={total_len:.4f}"
    )

    vg_map = {vg.name: vg.index for vg in baked.vertex_groups}
    needed = [
        "clavicle_r",
        "upperarm_r",
        "lowerarm_r",
        "hand_r",
        "thumb_01_r",
        "thumb_02_r",
        "thumb_03_r",
        "clavicle_l",
        "upperarm_l",
        "lowerarm_l",
        "hand_l",
    ]
    missing = [n for n in needed if n not in vg_map]
    if missing:
        fail(f"Missing VGs: {missing}")

    # Optional torso bleed diagnostics on shoulder candidates
    torso_groups = [n for n in ("spine", "spine_01", "spine_02", "spine_03", "chest", "neck", "breast_r", "pectoral_r") if n in vg_map]

    verts = baked_mesh.vertices
    mw = baked.matrix_world

    # Precompute face samples once
    face_data = []  # dicts
    for poly in baked_mesh.polygons:
        w_acc: dict[str, float] = defaultdict(float)
        centroid = Vector((0, 0, 0))
        nverts = len(poly.vertices)
        for vi in poly.vertices:
            v = verts[vi]
            centroid += mw @ v.co
            for name in needed:
                w_acc[name] += vertex_weight(v, vg_map[name])
            for name in torso_groups:
                w_acc[name] += vertex_weight(v, vg_map[name])
        centroid /= float(nverts)
        w_avg = {k: val / float(nverts) for k, val in w_acc.items()}
        s, dist, seg = arm_polyline_param(centroid, joints)
        member = is_right_arm_member(w_avg, dist)
        area = face_area(baked_mesh, poly, mw)
        face_data.append(
            {
                "index": poly.index,
                "centroid": centroid,
                "w": w_avg,
                "s": s,
                "dist": dist,
                "seg": seg,
                "member": member,
                "area": area,
                "tris": max(0, len(poly.vertices) - 2),
            }
        )

    universe = [fd for fd in face_data if fd["member"]]
    universe_faces = len(universe)
    universe_tris = sum(fd["tris"] for fd in universe)
    universe_area = sum(fd["area"] for fd in universe)
    log(f"Universe: {universe_faces} faces, {universe_tris} tris, area={universe_area:.6f}")

    if universe_faces != 1150:
        log(
            f"WARNING: universe faces={universe_faces} (Paso 19 was 1150). "
            "Same gate — investigating differences only; not expanding."
        )

    # Shoulder↔torso bleed: among shoulder-eligible (proximal) faces, torso weight
    proximal = [fd for fd in universe if fd["s"] <= 0.12]
    torso_bleed = 0
    for fd in proximal:
        tw = max((fd["w"].get(n, 0.0) for n in torso_groups), default=0.0)
        if tw >= 0.15 and fd["w"].get("clavicle_r", 0) < 0.25:
            torso_bleed += 1

    torso_eval = {
        "proximalFacesSampled": len(proximal),
        "possibleTorsoBleedFaces": torso_bleed,
        "note": (
            "Small clavicle/chest blend expected near axilla; universe gate unchanged. "
            f"torso_groups_present={torso_groups}"
        ),
    }

    # Keep bake mesh in a temporary blend by saving copies per calibration
    # Strategy: for each cal, assign zones, build objects from a duplicated bake,
    # save blend, export diagnostic glb, render, then restore by reloading... 
    # Faster: keep face assignments, rebuild from same baked object repeatedly.

    # Duplicate bake once as template mesh datablock we re-instance
    bake_mesh_copy = baked_mesh.copy()
    bake_mesh_copy.name = "BakeTemplate"

    results = {}
    render_paths: dict[str, dict[str, Path]] = {}
    views = ("front", "back", "outer-side", "inner-side", "three-quarter")

    for cal in CALIBRATIONS:
        log(f"=== {cal.id} {cal.label} ===")
        shoulder_end, elbow_lo, elbow_hi, wrist_lo, wrist_hi = resolve_bands(
            cal, ua_len, fa_len, hand_len, s_elbow, s_wrist
        )
        params = {
            "shoulder_end_m": shoulder_end,
            "elbow_lo_m": elbow_lo,
            "elbow_hi_m": elbow_hi,
            "wrist_lo_m": wrist_lo,
            "wrist_hi_m": wrist_hi,
            "shoulder_of_ua": shoulder_end / ua_len if ua_len else None,
            "elbow_prox_of_ua": (s_elbow - elbow_lo) / ua_len if ua_len else None,
            "elbow_dist_of_fa": (elbow_hi - s_elbow) / fa_len if fa_len else None,
            "wrist_prox_of_fa": (s_wrist - wrist_lo) / fa_len if fa_len else None,
            "wrist_dist_of_hand": (wrist_hi - s_wrist) / hand_len if hand_len else None,
            "use_absolute": cal.use_absolute,
        }
        log(f"Bands: {params}")

        zone_faces: dict[str, list[int]] = {z: [] for z in ZONE_ORDER}
        face_zone: dict[int, str] = {}
        zone_s: dict[str, list[float]] = {z: [] for z in ZONE_ORDER}
        zone_area: dict[str, float] = {z: 0.0 for z in ZONE_ORDER}
        zone_tris: dict[str, int] = {z: 0 for z in ZONE_ORDER}

        clf = classify_zone_r1 if cal.id == "R1" else classify_zone
        for fd in universe:
            z = clf(
                fd["s"],
                fd["w"],
                shoulder_end,
                elbow_lo,
                elbow_hi,
                wrist_lo,
                wrist_hi,
            )
            zone_faces[z].append(fd["index"])
            face_zone[fd["index"]] = z
            zone_s[z].append(fd["s"])
            zone_area[z] += fd["area"]
            zone_tris[z] += fd["tris"]

        assigned = sum(len(v) for v in zone_faces.values())
        empty = [z for z, fs in zone_faces.items() if not fs]
        if empty:
            fail(f"{cal.id} empty zones: {empty}")
        if assigned != universe_faces:
            fail(f"{cal.id} coverage mismatch {assigned} vs {universe_faces}")

        # Boundaries
        boundaries = [
            boundary_stats(baked_mesh, face_zone, a, b) for a, b in BOUNDARY_PAIRS
        ]

        zone_metrics = {}
        for z in ZONE_ORDER:
            ss = zone_s[z]
            axial = (max(ss) - min(ss)) if ss else 0.0
            # Percentage vs segment lengths where relevant
            pct_ua = 100.0 * axial / ua_len if z in (
                "right_shoulder",
                "right_upper_arm",
                "right_elbow",
            ) else None
            pct_fa = 100.0 * axial / fa_len if z in (
                "right_elbow",
                "right_forearm",
                "right_wrist",
            ) else None
            pct_hand = 100.0 * axial / hand_len if z in ("right_wrist", "right_hand") else None
            zone_metrics[z] = {
                "triangleCount": zone_tris[z],
                "faceCount": len(zone_faces[z]),
                "surfaceArea": round(zone_area[z], 6),
                "percentageOfPilotSurface": round(
                    100.0 * zone_area[z] / universe_area if universe_area else 0.0, 2
                ),
                "axialLength": round(axial, 4),
                "axialPctOfUpperArm": round(pct_ua, 2) if pct_ua is not None else None,
                "axialPctOfForearm": round(pct_fa, 2) if pct_fa is not None else None,
                "axialPctOfHand": round(pct_hand, 2) if pct_hand is not None else None,
                "sMin": round(min(ss), 4) if ss else None,
                "sMax": round(max(ss), 4) if ss else None,
            }

        # Rebuild scene with only zone objects for this calibration
        # Start from current scene: remove all but baked, then extract zones
        for obj in list(bpy.data.objects):
            if obj.name != "InteractionBake":
                bpy.data.objects.remove(obj, do_unlink=True)

        # Ensure baked linked
        if baked.name not in bpy.context.collection.objects:
            bpy.context.collection.objects.link(baked)

        mats = {z: make_debug_material(z, cal.id) for z in ZONE_ORDER}
        zone_objs = []
        for z in ZONE_ORDER:
            obj = extract_zone_object(
                baked, zone_faces[z], ZONE_MESH_NAMES[z], mats[z]
            )
            zone_objs.append(obj)

        # Hide bake for renders/export
        baked.hide_render = True
        baked.hide_viewport = True

        keep = {o.name for o in zone_objs} | {"InteractionBake"}
        # Don't clear bake yet — need it for next cal; save blend with zones only copy

        # Save refinement blend: duplicate scene state without bake
        blend_path = REFINE_DIR / cal.blend_name
        # Temporarily unlink bake
        bake_was = baked
        bpy.context.collection.objects.unlink(baked) if baked.name in bpy.context.collection.objects else None
        for o in list(bpy.data.objects):
            if o.name == "InteractionBake":
                continue
        # Remove bake from file for clean blend
        bake_name = baked.name
        bake_data = baked.data
        bpy.data.objects.remove(baked, do_unlink=True)

        bpy.ops.wm.save_as_mainfile(filepath=str(blend_path))
        log(f"Saved {blend_path}")

        # Export diagnostic GLB
        glb_path = ART / f"right_arm_{cal.id.lower()}_{cal.id and cal.label.lower().replace(' ', '_')}.glb"
        # simpler names:
        glb_path = ART / f"right_arm_{cal.id.lower()}.glb"
        bpy.ops.object.select_all(action="DESELECT")
        for o in zone_objs:
            if o.name in bpy.data.objects:
                o.select_set(True)
        bpy.context.view_layer.objects.active = zone_objs[0]
        try:
            bpy.ops.export_scene.gltf(
                filepath=str(glb_path),
                use_selection=True,
                export_animations=False,
                export_skins=False,
                export_morph=False,
                export_apply=False,
                export_texcoords=True,
                export_normals=True,
                export_materials="EXPORT",
            )
        except TypeError:
            bpy.ops.export_scene.gltf(
                filepath=str(glb_path),
                use_selection=True,
                export_apply=False,
                export_materials="EXPORT",
            )
        log(f"Exported {glb_path}")

        # Renders
        # Re-setup lights/cam each time
        for name in list(bpy.data.objects.keys()):
            if name.startswith(("Key", "Fill", "Rim", "Refine")):
                bpy.data.objects.remove(bpy.data.objects[name], do_unlink=True)

        cam = setup_studio()
        # Focus on arm bbox
        all_corners = []
        for o in zone_objs:
            if o.name not in bpy.data.objects:
                continue
            mn2, mx2 = world_bbox(o)
            all_corners.extend([mn2, mx2])
        arm_min = Vector(
            (
                min(c.x for c in all_corners),
                min(c.y for c in all_corners),
                min(c.z for c in all_corners),
            )
        )
        arm_max = Vector(
            (
                max(c.x for c in all_corners),
                max(c.y for c in all_corners),
                max(c.z for c in all_corners),
            )
        )
        center = (arm_min + arm_max) * 0.5
        dims = arm_max - arm_min
        radius = float(max(dims) * 2.1)

        cal_renders = {}
        for view in views:
            place_cam(cam, view, center, radius)
            out = ART / f"{cal.id.lower()}-{view}.png"
            bpy.context.scene.render.filepath = str(out)
            bpy.ops.render.render(write_still=True)
            cal_renders[view] = out
            log(f"Render {out.name}")
        render_paths[cal.id] = cal_renders

        results[cal.id] = {
            "label": cal.label,
            "params": params,
            "calibration": asdict(cal),
            "invariants": {
                "coverage": 100.0,
                "overlap": 0,
                "holes": 0,
                "duplicates": 0,
                "universeFaces": universe_faces,
                "assignedFaces": assigned,
            },
            "zones": zone_metrics,
            "boundaries": boundaries,
            "blend": str(blend_path.as_posix()),
            "glb": str(glb_path.as_posix()),
            "renders": {k: str(v.as_posix()) for k, v in cal_renders.items()},
        }

        # Restore bake for next calibration: reopen source is expensive.
        # Instead reload bake from template mesh.
        baked = bpy.data.objects.new("InteractionBake", bake_mesh_copy.copy())
        baked.data.name = "InteractionBake"
        bpy.context.collection.objects.link(baked)
        baked_mesh = baked.data
        # Clear zone objects
        for o in list(bpy.data.objects):
            if o.name.startswith("zone_"):
                bpy.data.objects.remove(o, do_unlink=True)
        for name in list(bpy.data.objects.keys()):
            if name.startswith(("Key", "Fill", "Rim", "Refine")):
                bpy.data.objects.remove(bpy.data.objects[name], do_unlink=True)

    # Comparison strips
    for view, suffix in (
        ("front", "front"),
        ("back", "back"),
        ("inner-side", "inner"),
        ("outer-side", "outer"),
    ):
        paths = [render_paths[c.id][view] for c in CALIBRATIONS]
        labels = [c.id for c in CALIBRATIONS]
        out = ART / f"right-arm-boundaries-{suffix}-comparison.png"
        try:
            composite_horizontal(paths, out, labels)
        except Exception as exc:
            log(f"Composite failed for {view}: {exc}")

    report = {
        "source": str(SOURCE.as_posix()),
        "sourceSha256": source_sha,
        "anatomicalModel": {
            "shoulderCenter": list(shoulder_c),
            "elbowCenter": list(elbow_c),
            "wristCenter": list(wrist_c),
            "handEnd": list(hand_end),
            "upperArmLength": ua_len,
            "forearmLength": fa_len,
            "handLength": hand_len,
            "projection": (
                "Each face uses its world-space centroid. Parameter s is the arc-length "
                "along the piecewise-linear polyline SHOULDER→ELBOW→WRIST→HAND_END. "
                "The nearest segment (by Euclidean distance to the segment) wins, so "
                "faces near a kink classify to the closest limb segment rather than "
                "an absolute Y-threshold. Outliers far from the polyline with weak "
                "arm weights are excluded by the universe gate."
            ),
        },
        "universe": {
            "faces": universe_faces,
            "triangles": universe_tris,
            "surfaceArea": round(universe_area, 6),
            "sameAsPaso19": universe_faces == 1150,
            "torsoShoulderEvaluation": torso_eval,
            "membership": {
                "armWeightThresh": ARM_WEIGHT_THRESH,
                "lateralBias": LATERAL_BIAS,
                "outlierDist": OUTLIER_DIST,
            },
        },
        "candidates": results,
        "productionGlbUntouched": True,
        "productionGlb": "public/models/interaction/neutro_body_v1_right_arm_interaction.glb",
    }
    REPORT.write_text(json.dumps(report, indent=2), encoding="utf-8")
    log(f"Report {REPORT}")
    log("DONE")


if __name__ == "__main__":
    try:
        main()
    except SystemExit:
        raise
    except Exception:
        import traceback

        traceback.print_exc()
        sys.exit(1)
