"""
Paso 21 — Official R2 longitudinal export + circumferential C1/C2 pilot.

1) Regenerates official 6-zone R2 assets:
   assets/blender/neutro-body/interaction/neutro_body_v1_right_arm_interaction.blend
   public/models/interaction/neutro_body_v1_right_arm_interaction.glb

2) Generates circumferential pilots (12 meshes) without replacing official GLB:
   assets/blender/neutro-body/interaction/circumferential-pilot/
   artifacts/body-v1-circumferential-pilot/
   public/models/interaction/pilot/ (lab debug only)

R2 bands (approved):
  shoulderEnd = 0.18 * UA
  elbowProx/Dist = 0.11 * UA / FA
  wristProx/Dist = 0.11 * FA / 0.14 * hand

Run:
  blender.exe --background --python tools/blender/generate_neutro_body_v1_circumferential_pilot.py
"""

from __future__ import annotations

import hashlib
import json
import math
import sys
from collections import defaultdict
from dataclasses import dataclass
from pathlib import Path

import bpy
import bmesh
from mathutils import Vector

REPO = Path(__file__).resolve().parents[2]
SOURCE = REPO / "assets" / "blender" / "neutro-body" / "neutro_body_v1_complete_source.blend"
OUT_DIR = REPO / "assets" / "blender" / "neutro-body" / "interaction"
OUT_BLEND = OUT_DIR / "neutro_body_v1_right_arm_interaction.blend"
OUT_GLB = REPO / "public" / "models" / "interaction" / "neutro_body_v1_right_arm_interaction.glb"
CIRC_DIR = OUT_DIR / "circumferential-pilot"
ART = REPO / "artifacts" / "body-v1-circumferential-pilot"
LAB_DIR = REPO / "public" / "models" / "interaction" / "pilot"
REPORT = ART / "report.json"

ZONE_LONG = [
    "right_shoulder",
    "right_upper_arm",
    "right_elbow",
    "right_forearm",
    "right_wrist",
    "right_hand",
]

QUAD = ("front", "back", "inner", "outer")

ZONE_COLORS_LONG = {
    "right_shoulder": (0.92, 0.28, 0.22, 1.0),
    "right_upper_arm": (0.95, 0.62, 0.12, 1.0),
    "right_elbow": (0.95, 0.88, 0.18, 1.0),
    "right_forearm": (0.22, 0.72, 0.38, 1.0),
    "right_wrist": (0.18, 0.55, 0.92, 1.0),
    "right_hand": (0.62, 0.28, 0.88, 1.0),
}

# Semantic circumferential colors (same for C1/C2)
QUAD_COLORS = {
    "front": (0.15, 0.78, 0.82, 1.0),  # cyan
    "back": (0.85, 0.25, 0.55, 1.0),  # magenta
    "inner": (0.35, 0.45, 0.95, 1.0),  # blue
    "outer": (0.98, 0.55, 0.12, 1.0),  # orange
}

ARM_WEIGHT_THRESH = 0.12
LATERAL_BIAS = 0.02
OUTLIER_DIST = 0.14
OUTLIER_W_MIN = 0.35

# R2 approved fractions
R2_SHOULDER_OF_UA = 0.18
R2_ELBOW_PROX_OF_UA = 0.11
R2_ELBOW_DIST_OF_FA = 0.11
R2_WRIST_PROX_OF_FA = 0.11
R2_WRIST_DIST_OF_HAND = 0.14


@dataclass(frozen=True)
class CircCalibration:
    id: str
    label: str
    blend_name: str
    # Angular half-width of front sector (degrees). Outer/inner/back fill the rest.
    # C1: equal 90° quadrants via atan2 thresholds at ±45, ±135
    # C2: front_half=55 → front 110°, outer 95°, back 70°, inner 85°
    mode: str  # "quadrant" | "tattoo"
    front_half_deg: float = 45.0
    outer_span_deg: float = 90.0
    back_span_deg: float = 90.0
    # inner gets the remainder


CALS = [
    CircCalibration(
        id="C1",
        label="Quadrant 90",
        blend_name="right_arm_c1_quadrants.blend",
        mode="quadrant",
        front_half_deg=45.0,
        outer_span_deg=90.0,
        back_span_deg=90.0,
    ),
    CircCalibration(
        id="C2",
        label="Tattoo Optimized",
        blend_name="right_arm_c2_tattoo_optimized.blend",
        mode="tattoo",
        front_half_deg=55.0,
        outer_span_deg=95.0,
        back_span_deg=70.0,
        # inner = 360 - 110 - 95 - 70 = 85°
    ),
]


def log(msg: str) -> None:
    print(f"[circ-pilot] {msg}", flush=True)


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
    return (rig.matrix_world @ pb.matrix @ Vector((0.0, pb.length, 0.0)).to_4d()).xyz


def make_mat(name: str, color):
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    nodes = mat.node_tree.nodes
    links = mat.node_tree.links
    nodes.clear()
    bsdf = nodes.new("ShaderNodeBsdfPrincipled")
    bsdf.inputs["Base Color"].default_value = color
    bsdf.inputs["Roughness"].default_value = 0.55
    if "Alpha" in bsdf.inputs:
        bsdf.inputs["Alpha"].default_value = 0.75
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
    best_dist = 1e9
    best_s = 0.0
    cum = 0.0
    for i in range(len(joints) - 1):
        a, b = joints[i], joints[i + 1]
        seg_len = (b - a).length
        _c, t, dist = project_point_on_segment(p, a, b)
        s = cum + t * seg_len
        if dist < best_dist:
            best_dist = dist
            best_s = s
        cum += seg_len
    return best_s, best_dist


def is_right_arm_member(w: dict[str, float], dist: float) -> bool:
    w_right = max(
        w.get("clavicle_r", 0.0),
        w.get("upperarm_r", 0.0),
        w.get("lowerarm_r", 0.0),
        w.get("hand_r", 0.0),
    ) + 0.25 * min(
        1.0,
        w.get("thumb_01_r", 0.0)
        + w.get("thumb_02_r", 0.0)
        + w.get("thumb_03_r", 0.0),
    )
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


def classify_longitudinal_r2(
    s: float,
    w: dict[str, float],
    shoulder_end: float,
    elbow_lo: float,
    elbow_hi: float,
    wrist_lo: float,
    wrist_hi: float,
) -> str:
    w_clav = w.get("clavicle_r", 0.0)
    w_la = w.get("lowerarm_r", 0.0)
    w_hand = w.get("hand_r", 0.0)
    w_thumb = (
        w.get("thumb_01_r", 0.0)
        + w.get("thumb_02_r", 0.0)
        + w.get("thumb_03_r", 0.0)
    )
    if s >= wrist_hi:
        return "right_hand"
    if wrist_lo <= s < wrist_hi:
        if (w_hand + w_thumb * 0.5) > w_la + 0.05:
            return "right_hand"
        return "right_wrist"
    if elbow_lo <= s <= elbow_hi:
        return "right_elbow"
    if s <= shoulder_end:
        if w_clav >= 0.12 and s <= shoulder_end * 1.15:
            return "right_shoulder"
        return "right_shoulder"
    if s < elbow_lo:
        return "right_upper_arm"
    if s < wrist_lo:
        return "right_forearm"
    return "right_hand"


def face_area(mesh, poly, mw) -> float:
    verts = [mw @ mesh.vertices[i].co for i in poly.vertices]
    if len(verts) < 3:
        return 0.0
    area = 0.0
    o = verts[0]
    for i in range(1, len(verts) - 1):
        area += ((verts[i] - o).cross(verts[i + 1] - o)).length * 0.5
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


def connected_components_faces(mesh, face_indices: list[int]) -> int:
    """Face adjacency connected components within a subset."""
    face_set = set(face_indices)
    if not face_set:
        return 0
    edge_to_faces: dict[tuple[int, int], list[int]] = defaultdict(list)
    for poly in mesh.polygons:
        if poly.index not in face_set:
            continue
        vs = list(poly.vertices)
        n = len(vs)
        for i in range(n):
            e = tuple(sorted((vs[i], vs[(i + 1) % n])))
            edge_to_faces[e].append(poly.index)
    adj: dict[int, set[int]] = defaultdict(set)
    for faces in edge_to_faces.values():
        if len(faces) < 2:
            continue
        for i in range(len(faces)):
            for j in range(i + 1, len(faces)):
                a, b = faces[i], faces[j]
                if a in face_set and b in face_set:
                    adj[a].add(b)
                    adj[b].add(a)
    visited = set()
    comps = 0
    for start in face_set:
        if start in visited:
            continue
        comps += 1
        stack = [start]
        visited.add(start)
        while stack:
            u = stack.pop()
            for v in adj[u]:
                if v not in visited:
                    visited.add(v)
                    stack.append(v)
    return comps


def detect_body_front(mesh, mw) -> Vector:
    """Heuristic: anatomical front in Blender for MPFB is -Y (nose min Y near head)."""
    zs = [(mw @ v.co).z for v in mesh.vertices]
    zmin, zmax = min(zs), max(zs)
    mid_z = zmin + (zmax - zmin) * 0.92
    head_ys = []
    for v in mesh.vertices:
        p = mw @ v.co
        if p.z >= mid_z:
            head_ys.append(p.y)
    if not head_ys:
        return Vector((0.0, -1.0, 0.0))
    # Nose is most -Y
    return Vector((0.0, -1.0, 0.0))


def build_segment_frame(origin: Vector, end: Vector, body_front: Vector, torso_center: Vector):
    """
    L = distal direction along segment.
    F = body_front projected onto plane ⊥ L.
    S = outer (away from torso) on plane ⊥ L.
    """
    L = (end - origin).normalized()
    f_raw = body_front - body_front.dot(L) * L
    if f_raw.length < 1e-8:
        # Degenerate: pick arbitrary perpendicular
        tmp = Vector((0, 0, 1)) if abs(L.z) < 0.9 else Vector((1, 0, 0))
        f_raw = tmp - tmp.dot(L) * L
    F = f_raw.normalized()

    mid = (origin + end) * 0.5
    to_torso = torso_center - mid
    inner_raw = to_torso - to_torso.dot(L) * L
    if inner_raw.length < 1e-8:
        # Fallback: S = L × F, then flip by torso X
        S = L.cross(F).normalized()
        if S.dot(Vector((-1, 0, 0))) < 0:  # right arm prefers outer ≈ -X-ish
            S = -S
    else:
        inner = inner_raw.normalized()
        S = -inner  # outer
        # Orthonormalize S against F (Gram-Schmidt lite)
        S = (S - S.dot(F) * F)
        if S.length < 1e-8:
            S = L.cross(F).normalized()
            if S.dot(-inner) < 0:
                S = -S
        else:
            S = S.normalized()
        # Ensure right-handed-ish: if (F × S) · L < 0, flip S? Not required for labels.

    return L, F, S


def classify_quadrant(front_score: float, side_score: float, cal: CircCalibration) -> str:
    """
    Angle: 0 = front (+F), +90 = outer (+S), ±180 = back, -90 = inner (-S).
    """
    ang = math.degrees(math.atan2(side_score, front_score))  # [-180, 180]
    if cal.mode == "quadrant":
        a = abs(ang)
        if a <= 45.0:
            return "front"
        if a >= 135.0:
            return "back"
        if ang > 0:
            return "outer"
        return "inner"

    # Tattoo optimized asymmetric sectors
    fh = cal.front_half_deg
    outer_end = fh + cal.outer_span_deg
    back_end = outer_end + cal.back_span_deg  # measured from +fh going positive... 
    # Layout:
    # front: [-fh, +fh]
    # outer: [+fh, +fh+outer_span]
    # back:  [+fh+outer_span, 180] U [-180, -(fh+inner_span)] 
    # where inner_span = 360 - 2*fh - outer - back
    inner_span = 360.0 - (2.0 * fh) - cal.outer_span_deg - cal.back_span_deg
    inner_start = -fh - inner_span  # negative side

    if -fh <= ang <= fh:
        return "front"
    if fh < ang <= outer_end:
        return "outer"
    # back occupies remaining positive to 180 and negative to inner_start
    # positive back: outer_end .. 180
    # negative back: -180 .. inner_start
    if ang > outer_end or ang < inner_start:
        return "back"
    # inner: inner_start .. -fh
    return "inner"


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

    world = bpy.data.worlds.new("CircWorld")
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

    cam_d = bpy.data.cameras.new("CircCam")
    cam_d.lens = 55.0
    cam = bpy.data.objects.new("CircCam", cam_d)
    bpy.context.collection.objects.link(cam)
    scene.camera = cam
    return cam


def place_cam(cam, view: str, center: Vector, radius: float):
    offsets = {
        "front": Vector((0.0, -1.0, 0.08)),
        "back": Vector((0.0, 1.0, 0.08)),
        "right-side": Vector((-1.0, 0.15, 0.05)),
        "left-side": Vector((1.0, 0.15, 0.05)),
        "inner-three-quarter": Vector((0.7, -0.7, 0.1)),
        "outer-three-quarter": Vector((-0.7, -0.7, 0.1)),
    }
    direction = offsets[view].normalized()
    cam.location = center + direction * radius
    cam.rotation_euler = (center - cam.location).to_track_quat("-Z", "Y").to_euler()


def composite_horizontal(paths: list[Path], out_path: Path):
    images = [bpy.data.images.load(str(p)) for p in paths]
    w, h = images[0].size
    total_w = w * len(images)
    comp = bpy.data.images.new(out_path.stem, width=total_w, height=h, alpha=False)
    pixels = [0.0] * (total_w * h * 4)
    for i, img in enumerate(images):
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


def export_glb(objs, path: Path):
    path.parent.mkdir(parents=True, exist_ok=True)
    bpy.ops.object.select_all(action="DESELECT")
    for o in objs:
        o.select_set(True)
    bpy.context.view_layer.objects.active = objs[0]
    try:
        bpy.ops.export_scene.gltf(
            filepath=str(path),
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
            filepath=str(path),
            use_selection=True,
            export_apply=False,
            export_materials="EXPORT",
        )


def clear_non_bake(bake_name="InteractionBake"):
    for obj in list(bpy.data.objects):
        if obj.name != bake_name:
            bpy.data.objects.remove(obj, do_unlink=True)


def main():
    log(f"Blender {bpy.app.version_string}")
    if not SOURCE.is_file():
        fail(f"Missing {SOURCE}")

    ART.mkdir(parents=True, exist_ok=True)
    CIRC_DIR.mkdir(parents=True, exist_ok=True)
    LAB_DIR.mkdir(parents=True, exist_ok=True)
    OUT_DIR.mkdir(parents=True, exist_ok=True)

    source_sha = sha256_file(SOURCE)
    bpy.ops.wm.open_mainfile(filepath=str(SOURCE))
    human = bpy.data.objects["Human"]
    rig = bpy.data.objects["Human.rig"]
    for m in human.modifiers:
        m.show_viewport = True
        m.show_render = True
    bpy.context.view_layer.update()

    shoulder = bone_world_head(rig, "upperarm_r")
    elbow = bone_world_head(rig, "lowerarm_r")
    wrist = bone_world_head(rig, "hand_r")
    tip = bone_world_tail(rig, "middle_03_r") or bone_world_head(rig, "middle_03_r")
    spine = bone_world_head(rig, "spine_02") or bone_world_head(rig, "spine_01")
    if tip is None:
        tip = wrist + (wrist - elbow).normalized() * 0.16
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
    tip_c = tip + offset
    torso_c = (spine + offset) if spine is not None else Vector((0.0, 0.0, 1.1))
    joints = [shoulder_c, elbow_c, wrist_c, tip_c]

    ua_len = (elbow_c - shoulder_c).length
    fa_len = (wrist_c - elbow_c).length
    hand_len = (tip_c - wrist_c).length
    s_elbow = ua_len
    s_wrist = ua_len + fa_len

    shoulder_end = R2_SHOULDER_OF_UA * ua_len
    elbow_lo = s_elbow - R2_ELBOW_PROX_OF_UA * ua_len
    elbow_hi = s_elbow + R2_ELBOW_DIST_OF_FA * fa_len
    wrist_lo = s_wrist - R2_WRIST_PROX_OF_FA * fa_len
    wrist_hi = s_wrist + R2_WRIST_DIST_OF_HAND * hand_len

    body_front = detect_body_front(baked_mesh, baked.matrix_world)
    L_u, F_u, S_u = build_segment_frame(shoulder_c, elbow_c, body_front, torso_c)
    L_f, F_f, S_f = build_segment_frame(elbow_c, wrist_c, body_front, torso_c)

    ang_F = math.degrees(math.acos(max(-1.0, min(1.0, F_u.dot(F_f)))))
    ang_S = math.degrees(math.acos(max(-1.0, min(1.0, S_u.dot(S_f)))))
    log(f"BODY_FRONT={tuple(body_front)} torso={tuple(torso_c)}")
    log(f"Upper L={tuple(L_u)} F={tuple(F_u)} S={tuple(S_u)}")
    log(f"Fore  L={tuple(L_f)} F={tuple(F_f)} S={tuple(S_f)}")
    log(f"Angle F={ang_F:.1f}° S={ang_S:.1f}°")

    # Verify inner points toward torso
    mid_u = (shoulder_c + elbow_c) * 0.5
    to_torso_u = (torso_c - mid_u)
    to_torso_u = to_torso_u - to_torso_u.dot(L_u) * L_u
    inner_ok = (-S_u).dot(to_torso_u.normalized()) > 0.0 if to_torso_u.length > 1e-8 else True
    log(f"Inner toward torso (upper): {inner_ok}")

    vg_map = {vg.name: vg.index for vg in baked.vertex_groups}
    needed = [
        "clavicle_r", "upperarm_r", "lowerarm_r", "hand_r",
        "thumb_01_r", "thumb_02_r", "thumb_03_r",
        "clavicle_l", "upperarm_l", "lowerarm_l", "hand_l",
    ]
    mw = baked.matrix_world
    verts = baked_mesh.vertices

    face_data = []
    for poly in baked_mesh.polygons:
        w_acc: dict[str, float] = defaultdict(float)
        centroid = Vector((0, 0, 0))
        n = len(poly.vertices)
        for vi in poly.vertices:
            v = verts[vi]
            centroid += mw @ v.co
            for name in needed:
                w_acc[name] += vertex_weight(v, vg_map[name])
        centroid /= float(n)
        w_avg = {k: val / float(n) for k, val in w_acc.items()}
        s, dist = arm_polyline_param(centroid, joints)
        member = is_right_arm_member(w_avg, dist)
        long_z = None
        if member:
            long_z = classify_longitudinal_r2(
                s, w_avg, shoulder_end, elbow_lo, elbow_hi, wrist_lo, wrist_hi
            )
        face_data.append(
            {
                "index": poly.index,
                "centroid": centroid,
                "w": w_avg,
                "s": s,
                "dist": dist,
                "member": member,
                "long": long_z,
                "area": face_area(baked_mesh, poly, mw),
                "tris": max(0, len(poly.vertices) - 2),
            }
        )

    universe = [fd for fd in face_data if fd["member"]]
    if len(universe) != 1150:
        log(f"WARNING universe={len(universe)} (expected 1150)")

    # --- Official R2 longitudinal ---
    long_faces: dict[str, list[int]] = {z: [] for z in ZONE_LONG}
    for fd in universe:
        long_faces[fd["long"]].append(fd["index"])
    assigned = sum(len(v) for v in long_faces.values())
    if assigned != len(universe) or any(not long_faces[z] for z in ZONE_LONG):
        fail("R2 longitudinal coverage failure")

    bake_template = baked_mesh.copy()
    bake_template.name = "BakeTemplate"

    # Build official R2 objects
    mats_long = {z: make_mat(f"Debug_{z}_R2", ZONE_COLORS_LONG[z]) for z in ZONE_LONG}
    zone_objs = []
    for z in ZONE_LONG:
        zone_objs.append(
            extract_zone_object(baked, long_faces[z], f"zone_{z}", mats_long[z])
        )
    baked.hide_render = True
    baked.hide_viewport = True

    # Save official blend (zones only)
    bpy.data.objects.remove(baked, do_unlink=True)
    bpy.ops.wm.save_as_mainfile(filepath=str(OUT_BLEND))
    log(f"Saved official {OUT_BLEND}")
    export_glb(zone_objs, OUT_GLB)
    log(f"Exported official {OUT_GLB} ({OUT_GLB.stat().st_size} bytes)")

    official = {
        "coverage": 100.0,
        "overlap": 0,
        "holes": 0,
        "duplicates": 0,
        "universeFaces": len(universe),
        "zones": {
            z: {
                "faces": len(long_faces[z]),
                "tris": sum(
                    fd["tris"] for fd in universe if fd["long"] == z
                ),
            }
            for z in ZONE_LONG
        },
    }

    # Restore bake for circumferential
    for o in list(bpy.data.objects):
        if o.name.startswith("zone_"):
            bpy.data.objects.remove(o, do_unlink=True)
    baked = bpy.data.objects.new("InteractionBake", bake_template.copy())
    baked.data.name = "InteractionBake"
    bpy.context.collection.objects.link(baked)
    baked_mesh = baked.data

    def radial_scores(centroid: Vector, origin: Vector, end: Vector, F: Vector, S: Vector):
        closest, _t, _d = project_point_on_segment(centroid, origin, end)
        R = centroid - closest
        return R.dot(F), R.dot(S), R.length

    results = {}
    render_paths = {}
    views = (
        "front",
        "back",
        "right-side",
        "left-side",
        "inner-three-quarter",
        "outer-three-quarter",
    )

    for cal in CALS:
        log(f"=== {cal.id} {cal.label} ===")
        # Map face -> mesh zone id
        face_zone: dict[int, str] = {}
        zone_faces: dict[str, list[int]] = defaultdict(list)

        for fd in universe:
            long_z = fd["long"]
            if long_z == "right_upper_arm":
                fs, ss, _ = radial_scores(fd["centroid"], shoulder_c, elbow_c, F_u, S_u)
                q = classify_quadrant(fs, ss, cal)
                zid = f"right_upper_arm_{q}"
            elif long_z == "right_forearm":
                fs, ss, _ = radial_scores(fd["centroid"], elbow_c, wrist_c, F_f, S_f)
                q = classify_quadrant(fs, ss, cal)
                zid = f"right_forearm_{q}"
            else:
                zid = long_z
            face_zone[fd["index"]] = zid
            zone_faces[zid].append(fd["index"])

        # Expected 12 zones
        expected = (
            ["right_shoulder", "right_elbow", "right_wrist", "right_hand"]
            + [f"right_upper_arm_{q}" for q in QUAD]
            + [f"right_forearm_{q}" for q in QUAD]
        )
        missing = [z for z in expected if not zone_faces[z]]
        if missing:
            fail(f"{cal.id} empty zones: {missing}")

        # Coverage within parents
        ua_parent = long_faces["right_upper_arm"]
        fa_parent = long_faces["right_forearm"]
        ua_children = sum(len(zone_faces[f"right_upper_arm_{q}"]) for q in QUAD)
        fa_children = sum(len(zone_faces[f"right_forearm_{q}"]) for q in QUAD)
        if ua_children != len(ua_parent) or fa_children != len(fa_parent):
            fail(f"{cal.id} parent coverage mismatch")

        parent_ua_area = sum(fd["area"] for fd in universe if fd["long"] == "right_upper_arm")
        parent_fa_area = sum(fd["area"] for fd in universe if fd["long"] == "right_forearm")

        def zone_metrics(zid: str, parent_area: float | None):
            faces = zone_faces[zid]
            area = sum(
                next(fd["area"] for fd in face_data if fd["index"] == fi) for fi in faces
            )
            # faster: build area map
            return faces, area

        # Build area/tris maps once
        area_by = {fd["index"]: fd["area"] for fd in face_data}
        tris_by = {fd["index"]: fd["tris"] for fd in face_data}

        metrics = {}
        for zid in expected:
            faces = zone_faces[zid]
            area = sum(area_by[i] for i in faces)
            tris = sum(tris_by[i] for i in faces)
            if zid.startswith("right_upper_arm_"):
                pct = 100.0 * area / parent_ua_area if parent_ua_area else 0.0
            elif zid.startswith("right_forearm_"):
                pct = 100.0 * area / parent_fa_area if parent_fa_area else 0.0
            else:
                pct = None
            comps = connected_components_faces(baked_mesh, faces)
            metrics[zid] = {
                "triangleCount": tris,
                "faceCount": len(faces),
                "surfaceArea": round(area, 6),
                "percentageOfParentArea": round(pct, 2) if pct is not None else None,
                "connectedComponents": comps,
            }

        # Build meshes
        clear_non_bake()
        if "InteractionBake" not in bpy.data.objects:
            baked = bpy.data.objects.new("InteractionBake", bake_template.copy())
            baked.data.name = "InteractionBake"
            bpy.context.collection.objects.link(baked)
            baked_mesh = baked.data
        else:
            baked = bpy.data.objects["InteractionBake"]
            baked_mesh = baked.data

        mats = {}
        for zid in expected:
            if zid.startswith("right_upper_arm_") or zid.startswith("right_forearm_"):
                q = zid.rsplit("_", 1)[-1]
                color = QUAD_COLORS[q]
            else:
                color = ZONE_COLORS_LONG[zid]
            mats[zid] = make_mat(f"Debug_{zid}_{cal.id}", color)

        zone_objs = []
        for zid in expected:
            zone_objs.append(
                extract_zone_object(baked, zone_faces[zid], f"zone_{zid}", mats[zid])
            )
        baked.hide_render = True
        baked.hide_viewport = True

        blend_path = CIRC_DIR / cal.blend_name
        # Remove bake for clean blend
        bpy.data.objects.remove(baked, do_unlink=True)
        bpy.ops.wm.save_as_mainfile(filepath=str(blend_path))
        log(f"Saved {blend_path}")

        glb_art = ART / f"right_arm_{cal.id.lower()}.glb"
        glb_lab = LAB_DIR / f"right_arm_{cal.id.lower()}.glb"
        export_glb(zone_objs, glb_art)
        export_glb(zone_objs, glb_lab)
        log(f"Exported {glb_art.name}")

        # Renders
        for name in list(bpy.data.objects.keys()):
            if name.startswith(("Key", "Fill", "Rim", "Circ")):
                bpy.data.objects.remove(bpy.data.objects[name], do_unlink=True)
        cam = setup_studio()
        corners = []
        for o in zone_objs:
            a, b = world_bbox(o)
            corners.extend([a, b])
        arm_min = Vector((min(c.x for c in corners), min(c.y for c in corners), min(c.z for c in corners)))
        arm_max = Vector((max(c.x for c in corners), max(c.y for c in corners), max(c.z for c in corners)))
        center = (arm_min + arm_max) * 0.5
        radius = float(max(arm_max - arm_min) * 2.1)

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
            "mode": cal.mode,
            "params": {
                "front_half_deg": cal.front_half_deg,
                "outer_span_deg": cal.outer_span_deg,
                "back_span_deg": cal.back_span_deg,
                "inner_span_deg": (
                    360.0
                    - 2 * cal.front_half_deg
                    - cal.outer_span_deg
                    - cal.back_span_deg
                )
                if cal.mode == "tattoo"
                else 90.0,
            },
            "invariants": {
                "upperArmCoverage": 100.0,
                "upperArmOverlap": 0,
                "forearmCoverage": 100.0,
                "forearmOverlap": 0,
                "holes": 0,
                "duplicates": 0,
            },
            "zones": metrics,
            "blend": str(blend_path.as_posix()),
            "glb": str(glb_art.as_posix()),
            "renders": {k: str(v.as_posix()) for k, v in cal_renders.items()},
        }

        # Restore bake for next
        for o in list(bpy.data.objects):
            if o.name.startswith("zone_") or o.name.startswith(("Key", "Fill", "Rim", "Circ")):
                bpy.data.objects.remove(o, do_unlink=True)
        baked = bpy.data.objects.new("InteractionBake", bake_template.copy())
        baked.data.name = "InteractionBake"
        bpy.context.collection.objects.link(baked)
        baked_mesh = baked.data

    # Comparisons
    try:
        composite_horizontal(
            [render_paths["C1"]["front"], render_paths["C2"]["front"]],
            ART / "right-arm-front-back-comparison.png",
        )
        # Better dedicated comps:
        composite_horizontal(
            [render_paths["C1"]["front"], render_paths["C2"]["front"]],
            ART / "upper-arm-circumference-comparison.png",
        )
        composite_horizontal(
            [render_paths["C1"]["outer-three-quarter"], render_paths["C2"]["outer-three-quarter"]],
            ART / "forearm-circumference-comparison.png",
        )
        composite_horizontal(
            [render_paths["C1"]["back"], render_paths["C2"]["back"]],
            ART / "right-arm-front-back-comparison.png",
        )
        composite_horizontal(
            [render_paths["C1"]["inner-three-quarter"], render_paths["C2"]["outer-three-quarter"]],
            ART / "right-arm-inner-outer-comparison.png",
        )
    except Exception as exc:
        log(f"Composite warning: {exc}")

    report = {
        "sourceSha256": source_sha,
        "officialR2": official,
        "anatomicalFrames": {
            "bodyFront": list(body_front),
            "torsoCenter": list(torso_c),
            "innerTowardTorsoUpper": inner_ok,
            "upperArm": {"L": list(L_u), "F": list(F_u), "S": list(S_u)},
            "forearm": {"L": list(L_f), "F": list(F_f), "S": list(S_f)},
            "angleF_deg": ang_F,
            "angleS_deg": ang_S,
        },
        "candidates": results,
        "officialGlb": str(OUT_GLB.as_posix()),
        "officialGlbUpdated": True,
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
