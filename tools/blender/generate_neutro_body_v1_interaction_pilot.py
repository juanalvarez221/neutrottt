"""
Generate Neutro Body V1 right-arm interaction pilot (6 zone meshes).

Source (immutable):
  assets/blender/neutro-body/neutro_body_v1_complete_source.blend

Outputs:
  assets/blender/neutro-body/interaction/neutro_body_v1_right_arm_interaction.blend
  public/models/interaction/neutro_body_v1_right_arm_interaction.glb
  artifacts/body-v1-interaction-pilot/report.json

Architecture:
  BodyVisual (NeutroBodyV1) = appearance only
  InteractionModel (zone_*) = raycast geometry only

Segmentation uses:
  - evaluated posed mesh (Armature Q2 + Mask helpers)
  - deformation vertex groups (clavicle_r, upperarm_r, lowerarm_r, hand_r, thumb_*_r)
  - bone landmarks along the right arm chain
  - exclusive triangle assignment (no face duplication)

Transform matches production web export (feet Z=0, center X/Y on FULL body)
so zones align spatially with NeutroBodyV1.glb.

Run:
  blender.exe --background --python tools/blender/generate_neutro_body_v1_interaction_pilot.py
"""

from __future__ import annotations

import hashlib
import json
import sys
from collections import defaultdict
from pathlib import Path

import bpy
import bmesh
from mathutils import Vector

REPO = Path(__file__).resolve().parents[2]
SOURCE = REPO / "assets" / "blender" / "neutro-body" / "neutro_body_v1_complete_source.blend"
OUT_DIR = REPO / "assets" / "blender" / "neutro-body" / "interaction"
OUT_BLEND = OUT_DIR / "neutro_body_v1_right_arm_interaction.blend"
GLB_PATH = REPO / "public" / "models" / "interaction" / "neutro_body_v1_right_arm_interaction.glb"
ART = REPO / "artifacts" / "body-v1-interaction-pilot"
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

# Debug materials (distinct hues, not brand colors)
ZONE_COLORS = {
    "right_shoulder": (0.92, 0.28, 0.22, 1.0),  # red
    "right_upper_arm": (0.95, 0.62, 0.12, 1.0),  # amber
    "right_elbow": (0.95, 0.88, 0.18, 1.0),  # yellow
    "right_forearm": (0.22, 0.72, 0.38, 1.0),  # green
    "right_wrist": (0.18, 0.55, 0.92, 1.0),  # blue
    "right_hand": (0.62, 0.28, 0.88, 1.0),  # violet
}

# Arm membership: face avg of max right-arm deformation weights
ARM_WEIGHT_THRESH = 0.12
# Prefer right over left when both present
LATERAL_BIAS = 0.02

# Joint band half-widths in meters (along arm polyline parameter)
SHOULDER_EXTENT = 0.085
ELBOW_HALF = 0.048
WRIST_HALF = 0.038


def log(msg: str) -> None:
    print(f"[interaction-pilot] {msg}", flush=True)


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
    # Tail in bone local is (0, length, 0) for Blender bones
    tail_local = Vector((0.0, pb.length, 0.0))
    return (rig.matrix_world @ pb.matrix @ tail_local.to_4d()).xyz


def make_debug_material(zone_id: str):
    name = f"Debug_{zone_id}"
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    nodes = mat.node_tree.nodes
    links = mat.node_tree.links
    nodes.clear()
    bsdf = nodes.new("ShaderNodeBsdfPrincipled")
    color = ZONE_COLORS[zone_id]
    bsdf.inputs["Base Color"].default_value = color
    bsdf.inputs["Roughness"].default_value = 0.55
    bsdf.inputs["Metallic"].default_value = 0.0
    # Alpha for lab transparency hint (exported; viewer may override)
    if "Alpha" in bsdf.inputs:
        bsdf.inputs["Alpha"].default_value = 0.55
    mat.blend_method = "BLEND"
    try:
        mat.surface_render_method = "BLENDED"
    except Exception:
        pass
    out = nodes.new("ShaderNodeOutputMaterial")
    links.new(bsdf.outputs[0], out.inputs[0])
    return mat


def build_vg_index_map(obj):
    return {vg.name: vg.index for vg in obj.vertex_groups}


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
    Return cumulative arc-length parameter s along joint polyline,
    and distance to the polyline.
    joints: [shoulder, elbow, wrist, hand_tip]
    """
    best_dist = 1e9
    best_s = 0.0
    cum = 0.0
    for i in range(len(joints) - 1):
        a, b = joints[i], joints[i + 1]
        seg_len = (b - a).length
        closest, t, dist = project_point_on_segment(p, a, b)
        s = cum + t * seg_len
        if dist < best_dist:
            best_dist = dist
            best_s = s
        cum += seg_len
    return best_s, best_dist


def classify_with_joints(
    centroid: Vector,
    w: dict[str, float],
    joints: list[Vector],
    s_elbow: float,
    s_wrist: float,
    total_len: float,
) -> str | None:
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
        return None
    if w_left > w_right + LATERAL_BIAS:
        return None

    s, dist = arm_polyline_param(centroid, joints)

    # Reject outliers far from the arm axis (torso bleed with low lateral clarity)
    if dist > 0.14 and w_right < 0.35:
        return None

    shoulder_end = SHOULDER_EXTENT
    elbow_lo = s_elbow - ELBOW_HALF
    elbow_hi = s_elbow + ELBOW_HALF
    wrist_lo = s_wrist - WRIST_HALF
    wrist_hi = s_wrist + WRIST_HALF

    # Priority bands (exclusive): hand → wrist → elbow → shoulder → shafts
    if s >= wrist_hi or (s >= wrist_lo and (w_hand + w_thumb * 0.5) >= w_la):
        # Distal side of wrist band, or wrist band dominated by hand weights → hand
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
        # Shoulder cup: near glenohumeral + clavicle/upperarm blend
        if w_clav >= 0.08 or w_ua >= 0.2 or s <= shoulder_end * 0.85:
            return "right_shoulder"
        return "right_upper_arm"

    if s < elbow_lo:
        return "right_upper_arm"

    if s < wrist_lo:
        return "right_forearm"

    return "right_hand"


def extract_zone_object(src_obj, face_indices: list[int], name: str, mat):
    """Duplicate selected faces into a new object; remove unused verts."""
    bpy.ops.object.select_all(action="DESELECT")
    src_obj.select_set(True)
    bpy.context.view_layer.objects.active = src_obj

    # Duplicate full object then delete unwanted faces
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
    # Remove loose verts
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


def main():
    log(f"Blender {bpy.app.version_string}")
    if not SOURCE.is_file():
        fail(f"Missing source: {SOURCE}")

    source_sha = sha256_file(SOURCE)
    log(f"Source SHA-256: {source_sha}")

    bpy.ops.wm.open_mainfile(filepath=str(SOURCE))
    human = bpy.data.objects.get("Human")
    rig = bpy.data.objects.get("Human.rig")
    if human is None or rig is None:
        fail("Missing Human or Human.rig")

    for m in human.modifiers:
        m.show_viewport = True
        m.show_render = True
    bpy.context.view_layer.update()

    # Landmarks from posed rig (world space, pre-bake transform)
    shoulder = bone_world_head(rig, "upperarm_r")
    elbow = bone_world_head(rig, "lowerarm_r")
    wrist = bone_world_head(rig, "hand_r")
    # Prefer fingertip; fall back along hand bone
    tip = bone_world_tail(rig, "middle_03_r") or bone_world_head(rig, "middle_03_r")
    if tip is None:
        tip = bone_world_tail(rig, "hand_r") or (wrist + (wrist - elbow).normalized() * 0.16)

    if not all(v is not None for v in (shoulder, elbow, wrist)):
        fail("Missing right-arm bones (upperarm_r / lowerarm_r / hand_r)")

    landmarks_raw = {
        "clavicle_r": list(bone_world_head(rig, "clavicle_r") or Vector()),
        "upperarm_r": list(shoulder),
        "lowerarm_r": list(elbow),
        "hand_r": list(wrist),
        "tip": list(tip),
    }
    log(f"Landmarks: {landmarks_raw}")

    # Bake evaluated mesh (same pipeline as production visual)
    depsgraph = bpy.context.evaluated_depsgraph_get()
    evaluated = human.evaluated_get(depsgraph)
    try:
        baked_mesh = bpy.data.meshes.new_from_object(
            evaluated,
            preserve_all_data_layers=True,
            depsgraph=depsgraph,
        )
    except TypeError:
        baked_mesh = bpy.data.meshes.new_from_object(evaluated)

    baked_mesh.name = "InteractionBake"
    baked = bpy.data.objects.new("InteractionBake", baked_mesh)
    bpy.context.collection.objects.link(baked)
    baked.matrix_world = evaluated.matrix_world.copy()
    bpy.context.view_layer.update()

    vcount = len(baked_mesh.vertices)
    fcount = len(baked_mesh.polygons)
    log(f"Baked: {vcount} verts, {fcount} faces, {estimate_tris(baked_mesh)} tris")
    if vcount >= 19000:
        fail("Bake did not remove helpers")

    # Same transform as NeutroBodyV1 production: feet Z=0, center X/Y on FULL body
    mn, mx = world_bbox(baked)
    cx = (mn.x + mx.x) * 0.5
    cy = (mn.y + mx.y) * 0.5
    offset = Vector((-cx, -cy, -mn.z))
    baked.location += offset
    bpy.context.view_layer.update()
    bpy.ops.object.select_all(action="DESELECT")
    baked.select_set(True)
    bpy.context.view_layer.objects.active = baked
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    bpy.context.view_layer.update()

    # Transform landmarks with the same offset (object was at identity after apply)
    shoulder_t = shoulder + offset
    elbow_t = elbow + offset
    wrist_t = wrist + offset
    tip_t = tip + offset
    joints = [shoulder_t, elbow_t, wrist_t, tip_t]
    s_elbow = (elbow_t - shoulder_t).length
    s_wrist = s_elbow + (wrist_t - elbow_t).length
    total_len = s_wrist + (tip_t - wrist_t).length
    log(
        f"Arm params: s_elbow={s_elbow:.4f} s_wrist={s_wrist:.4f} total={total_len:.4f}"
    )

    vg_map = build_vg_index_map(baked)
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
        fail(f"Missing vertex groups on bake: {missing}")

    verts = baked_mesh.vertices
    mw = baked.matrix_world

    zone_faces: dict[str, list[int]] = {z: [] for z in ZONE_ORDER}
    skipped = 0
    arm_face_count = 0

    for poly in baked_mesh.polygons:
        # Average weights across face vertices
        w_acc: dict[str, float] = defaultdict(float)
        centroid = Vector((0, 0, 0))
        nverts = len(poly.vertices)
        for vi in poly.vertices:
            v = verts[vi]
            centroid += mw @ v.co
            for name in needed:
                w_acc[name] += vertex_weight(v, vg_map[name])
        centroid /= float(nverts)
        w_avg = {k: v / float(nverts) for k, v in w_acc.items()}

        zone = classify_with_joints(
            centroid, w_avg, joints, s_elbow, s_wrist, total_len
        )
        if zone is None:
            skipped += 1
            continue
        arm_face_count += 1
        zone_faces[zone].append(poly.index)

    # Coverage / overlap checks (by construction exclusive)
    assigned = sum(len(v) for v in zone_faces.values())
    overlap = 0  # exclusive assignment → 0
    empty_zones = [z for z, faces in zone_faces.items() if not faces]
    if empty_zones:
        fail(f"Empty zones: {empty_zones}")

    log(f"Arm faces: {arm_face_count}  skipped(body): {skipped}  assigned: {assigned}")

    # Build zone objects
    materials = {z: make_debug_material(z) for z in ZONE_ORDER}
    zone_objects = []
    zone_stats = {}

    for z in ZONE_ORDER:
        faces = zone_faces[z]
        mesh_name = ZONE_MESH_NAMES[z]
        obj = extract_zone_object(baked, faces, mesh_name, materials[z])
        zone_objects.append(obj)
        zone_stats[z] = {
            "mesh": mesh_name,
            "sourceFaces": len(faces),
            "vertices": len(obj.data.vertices),
            "faces": len(obj.data.polygons),
            "triangles": estimate_tris(obj.data),
        }
        log(
            f"  {mesh_name}: {zone_stats[z]['vertices']} verts, "
            f"{zone_stats[z]['triangles']} tris"
        )

    # Remove bake + source; keep only zones
    keep = {o.name for o in zone_objects}
    clear_except(keep)

    remaining = sorted(o.name for o in bpy.data.objects)
    expected = sorted(ZONE_MESH_NAMES[z] for z in ZONE_ORDER)
    if remaining != expected:
        fail(f"Unexpected objects: {remaining} (expected {expected})")

    # Ensure identity transforms (geometry already in production space)
    for obj in zone_objects:
        obj.location = (0, 0, 0)
        obj.rotation_euler = (0, 0, 0)
        obj.scale = (1, 1, 1)

    OUT_DIR.mkdir(parents=True, exist_ok=True)
    bpy.ops.wm.save_as_mainfile(filepath=str(OUT_BLEND))
    log(f"Saved {OUT_BLEND}")

    # Export GLB
    GLB_PATH.parent.mkdir(parents=True, exist_ok=True)
    bpy.ops.object.select_all(action="DESELECT")
    for obj in zone_objects:
        obj.select_set(True)
    bpy.context.view_layer.objects.active = zone_objects[0]

    export_kwargs = dict(
        filepath=str(GLB_PATH),
        use_selection=True,
        export_animations=False,
        export_skins=False,
        export_morph=False,
        export_apply=False,
        export_texcoords=True,
        export_normals=True,
        export_materials="EXPORT",
    )
    try:
        bpy.ops.export_scene.gltf(**export_kwargs)
    except TypeError:
        # Blender version flag differences
        for drop in ("export_morph", "export_skins", "export_animations"):
            export_kwargs.pop(drop, None)
        bpy.ops.export_scene.gltf(**export_kwargs)

    if not GLB_PATH.is_file():
        fail("GLB was not written")

    glb_size = GLB_PATH.stat().st_size
    log(f"Exported {GLB_PATH} ({glb_size} bytes)")

    # Reference universe = all faces that passed right-arm membership
    coverage = 1.0  # every arm face assigned exactly once
    report = {
        "source": str(SOURCE.as_posix()),
        "sourceSha256": source_sha,
        "algorithm": {
            "armWeightThresh": ARM_WEIGHT_THRESH,
            "shoulderExtent": SHOULDER_EXTENT,
            "elbowHalf": ELBOW_HALF,
            "wristHalf": WRIST_HALF,
            "vertexGroups": needed,
            "landmarks": ["upperarm_r", "lowerarm_r", "hand_r", "middle_03_r"],
            "transform": "same as NeutroBodyV1: feet Z=0, center X/Y on full-body bbox",
        },
        "landmarksTransformed": {
            "shoulder": list(shoulder_t),
            "elbow": list(elbow_t),
            "wrist": list(wrist_t),
            "tip": list(tip_t),
            "sElbow": s_elbow,
            "sWrist": s_wrist,
            "totalLen": total_len,
        },
        "coverage": {
            "referenceUniverse": (
                "Faces of the evaluated visible mesh whose average max right-arm "
                "deformation weight >= ARM_WEIGHT_THRESH and exceeds left-arm "
                "counterpart (lateral bias)."
            ),
            "armFaces": arm_face_count,
            "assignedFaces": assigned,
            "coveragePercentage": round(100.0 * coverage, 4),
            "overlaps": overlap,
            "gaps": arm_face_count - assigned,
            "duplicateFaces": 0,
            "bodyFacesSkipped": skipped,
        },
        "zones": zone_stats,
        "outputs": {
            "blend": str(OUT_BLEND.as_posix()),
            "glb": str(GLB_PATH.as_posix()),
            "glbBytes": glb_size,
        },
    }

    ART.mkdir(parents=True, exist_ok=True)
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
