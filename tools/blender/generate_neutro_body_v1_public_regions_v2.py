"""
Transfer proven 81-zone InteractionModel face labels onto BodyVisual bake,
then remap into PUBLIC_BASE regions with anatomical refinements
(pectoral region-growing, wide back absorption, forearm/leg hemi collapse).

This keeps BodyVisual topology as the highlight source while using the
battle-tested limb membership from the InteractionModel pipeline.
"""

from __future__ import annotations

import json
import sys
from collections import defaultdict
from pathlib import Path

import bpy
import bmesh
from mathutils import Vector
from mathutils.kdtree import KDTree

REPO = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(Path(__file__).resolve().parent))

from neutro_body_interaction.geometry import face_area, world_bbox  # noqa: E402
from neutro_body_interaction.island_cleanup import (  # noqa: E402
    build_edge_face_map,
    connected_components,
)
from neutro_body_interaction.public_region_partition import (  # noqa: E402
    PUBLIC_BASE_SELECTABLE,
    ROUTING_ONLY_BASE,
    build_landmarks,
    face_centroid,
    face_normal,
    grow_region,
    smooth_boundary,
)

SOURCE = REPO / "assets/blender/neutro-body/neutro_body_v1_complete_source.blend"
INTERACTION_GLB = REPO / "public/models/interaction/neutro_body_v1_body_interaction.glb"
OUT_BLEND = REPO / "assets/blender/neutro-body/interaction/neutro_body_v1_public_regions.blend"
OUT_GLB = REPO / "public/models/interaction/neutro_body_v1_public_regions.glb"
ADJ_JSON = REPO / "src/widgets/body-3d/domain/generated/publicRegionAdjacency.json"
ART = REPO / "artifacts/body-v1-public-regions"
ATLAS = REPO / "artifacts/body-public-region-atlas"
REPORT = ART / "report.json"
LANDMARKS_OUT = REPO / "artifacts/body-public-region-landmarks/public_region_landmarks.json"

# Atomic → public base (initial map). Refined after transfer.
ATOMIC_TO_PUBLIC = {
    "left_chest": "left_pectoral_region",
    "right_chest": "right_pectoral_region",
    "sternum": "STERNUM_SPLIT",
    "upper_abdomen": "full_abdomen_region",
    "lower_abdomen": "full_abdomen_region",
    "left_ribs": "left_ribs_region",
    "right_ribs": "right_ribs_region",
    "left_flank": "FLANK_DISTRIBUTE",
    "right_flank": "FLANK_DISTRIBUTE",
    "left_scapula": "upper_back_region",
    "right_scapula": "upper_back_region",
    "upper_back_center": "upper_back_region",
    "left_mid_back": "upper_back_region",
    "right_mid_back": "upper_back_region",
    "mid_back_center": "upper_back_region",
    "left_lower_back": "lower_back_region",
    "right_lower_back": "lower_back_region",
    "lower_back_center": "lower_back_region",
    "sacrum": "ROUTING_SACRUM",
    "left_hip": "left_hip_surface",
    "right_hip": "right_hip_surface",
    "left_glute": "left_glute_surface",
    "right_glute": "right_glute_surface",
    "right_shoulder": "right_shoulder_surface",
    "left_shoulder": "left_shoulder_surface",
    "right_upper_arm_front": "right_biceps_surface",
    "right_upper_arm_inner": "right_biceps_surface",
    "right_upper_arm_back": "right_triceps_surface",
    "right_upper_arm_outer": "right_triceps_surface",
    "left_upper_arm_front": "left_biceps_surface",
    "left_upper_arm_inner": "left_biceps_surface",
    "left_upper_arm_back": "left_triceps_surface",
    "left_upper_arm_outer": "left_triceps_surface",
    "right_elbow": "right_elbow_transition",
    "left_elbow": "left_elbow_transition",
    "right_forearm_front": "right_forearm_inner_surface",
    "right_forearm_inner": "right_forearm_inner_surface",
    "right_forearm_back": "right_forearm_outer_surface",
    "right_forearm_outer": "right_forearm_outer_surface",
    "left_forearm_front": "left_forearm_inner_surface",
    "left_forearm_inner": "left_forearm_inner_surface",
    "left_forearm_back": "left_forearm_outer_surface",
    "left_forearm_outer": "left_forearm_outer_surface",
    "right_wrist": "right_wrist_transition",
    "left_wrist": "left_wrist_transition",
    "right_hand": "right_hand_surface",
    "left_hand": "left_hand_surface",
    "right_thigh_front": "right_thigh_front_surface",
    "right_thigh_back": "right_thigh_back_surface",
    "right_thigh_inner": "right_thigh_inner_surface",
    "right_thigh_outer": "right_thigh_outer_surface",
    "left_thigh_front": "left_thigh_front_surface",
    "left_thigh_back": "left_thigh_back_surface",
    "left_thigh_inner": "left_thigh_inner_surface",
    "left_thigh_outer": "left_thigh_outer_surface",
    "right_knee": "right_knee_transition",
    "left_knee": "left_knee_transition",
    "right_lower_leg_front": "right_shin_surface",
    "right_lower_leg_inner": "right_shin_surface",
    "right_lower_leg_back": "right_calf_surface",
    "right_lower_leg_outer": "right_calf_surface",
    "left_lower_leg_front": "left_shin_surface",
    "left_lower_leg_inner": "left_shin_surface",
    "left_lower_leg_back": "left_calf_surface",
    "left_lower_leg_outer": "left_calf_surface",
    "right_ankle": "right_ankle_transition",
    "left_ankle": "left_ankle_transition",
    "right_foot": "right_foot_surface",
    "left_foot": "left_foot_surface",
    "head_top": "head_top_surface",
    "head_back": "head_back_surface",
    "head_left_side": "head_left_surface",
    "head_right_side": "head_right_surface",
    "left_ear": "head_left_surface",
    "right_ear": "head_right_surface",
    "face_left": "face_non_selectable",
    "face_right": "face_non_selectable",
    "neck_front": "neck_front_surface",
    "neck_back": "neck_back_surface",
    "neck_left": "neck_left_surface",
    "neck_right": "neck_right_surface",
}


def log(msg: str) -> None:
    print(f"[public-regions] {msg}", flush=True)


def fail(msg: str) -> None:
    log(f"FAIL: {msg}")
    sys.exit(1)


def bake_source():
    bpy.ops.wm.open_mainfile(filepath=str(SOURCE))
    human = bpy.data.objects.get("Human")
    rig = bpy.data.objects.get("Human.rig")
    if human is None or rig is None:
        fail("Missing Human / Human.rig")
    for m in human.modifiers:
        m.show_viewport = True
        m.show_render = True
    bpy.context.view_layer.update()
    depsgraph = bpy.context.evaluated_depsgraph_get()
    evaluated = human.evaluated_get(depsgraph)
    try:
        baked_mesh = bpy.data.meshes.new_from_object(
            evaluated, preserve_all_data_layers=True, depsgraph=depsgraph
        )
    except TypeError:
        baked_mesh = bpy.data.meshes.new_from_object(evaluated)
    baked = bpy.data.objects.new("PublicRegionBake", baked_mesh)
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
    return baked, rig


def load_interaction_centroids():
    """Import interaction GLB into a temp collection; return list of (centroid, atomic)."""
    before = set(bpy.data.objects)
    bpy.ops.import_scene.gltf(filepath=str(INTERACTION_GLB))
    imported = [o for o in bpy.data.objects if o not in before]
    pairs = []
    for obj in imported:
        if obj.type != "MESH" or not obj.name.startswith("zone_"):
            continue
        atomic = obj.name.split(".")[0][len("zone_") :]
        mw = obj.matrix_world
        for poly in obj.data.polygons:
            c = Vector((0, 0, 0))
            for vi in poly.vertices:
                c += mw @ obj.data.vertices[vi].co
            c /= float(len(poly.vertices))
            pairs.append((c, atomic))
    for obj in imported:
        bpy.data.objects.remove(obj, do_unlink=True)
    return pairs


def extract_region_mesh(src, face_indices: set[int], name: str):
    if not face_indices:
        return None
    bpy.ops.object.select_all(action="DESELECT")
    src.select_set(True)
    bpy.context.view_layer.objects.active = src
    bpy.ops.object.duplicate()
    dup = bpy.context.active_object
    dup.name = name
    dup.data = dup.data.copy()
    bm = bmesh.new()
    bm.from_mesh(dup.data)
    bm.faces.ensure_lookup_table()
    bmesh.ops.delete(
        bm,
        geom=[f for f in bm.faces if f.index not in face_indices],
        context="FACES",
    )
    loose = [v for v in bm.verts if not v.link_faces]
    if loose:
        bmesh.ops.delete(bm, geom=loose, context="VERTS")
    bm.to_mesh(dup.data)
    n = len(bm.faces)
    bm.free()
    dup.data.update()
    if n == 0:
        bpy.data.objects.remove(dup, do_unlink=True)
        return None
    return dup


def paint_region(obj, color, *, emissive=False):
    mat = bpy.data.materials.new(obj.name + "_mat")
    mat.use_nodes = True
    nodes, links = mat.node_tree.nodes, mat.node_tree.links
    nodes.clear()
    out = nodes.new("ShaderNodeOutputMaterial")
    if emissive:
        emit = nodes.new("ShaderNodeEmission")
        emit.inputs["Color"].default_value = (*color[:3], 1.0)
        emit.inputs["Strength"].default_value = 1.35
        links.new(emit.outputs[0], out.inputs[0])
    else:
        bsdf = nodes.new("ShaderNodeBsdfPrincipled")
        bsdf.inputs["Base Color"].default_value = (*color[:3], 1.0)
        links.new(bsdf.outputs[0], out.inputs[0])
    obj.data.materials.clear()
    obj.data.materials.append(mat)


def render_qa(created):
    ART.mkdir(parents=True, exist_ok=True)
    ATLAS.mkdir(parents=True, exist_ok=True)
    mn = Vector((1e9, 1e9, 1e9))
    mx = Vector((-1e9, -1e9, -1e9))
    for obj in created:
        a, b = world_bbox(obj)
        mn = Vector((min(mn.x, a.x), min(mn.y, a.y), min(mn.z, a.z)))
        mx = Vector((max(mx.x, b.x), max(mx.y, b.y), max(mx.z, b.z)))
    center = (mn + mx) * 0.5
    radius = max((mx - mn).length * 0.72, 1.0)
    scene = bpy.context.scene
    try:
        scene.render.engine = "BLENDER_EEVEE_NEXT"
    except TypeError:
        scene.render.engine = "BLENDER_EEVEE"
    scene.render.resolution_x = 900
    scene.render.resolution_y = 1100
    cam_data = bpy.data.cameras.new("PublicQACam")
    cam = bpy.data.objects.new("PublicQACam", cam_data)
    bpy.context.collection.objects.link(cam)
    scene.camera = cam
    cam_data.lens = 50
    light_data = bpy.data.lights.new("QAKey", type="AREA")
    light_data.energy = 280.0
    light = bpy.data.objects.new("QAKey", light_data)
    bpy.context.collection.objects.link(light)
    light.location = center + Vector((2.2, -2.6, 2.4))
    gold = (0.91, 0.66, 0.25, 1.0)
    dim = (0.22, 0.19, 0.16, 1.0)

    def place(view):
        offsets = {
            "front": Vector((0, -1, 0.08)),
            "back": Vector((0, 1, 0.08)),
            "left": Vector((1, 0.12, 0.05)),
            "right": Vector((-1, 0.12, 0.05)),
        }
        d = offsets[view].normalized()
        cam.location = center + d * radius
        cam.rotation_euler = (center - cam.location).to_track_quat("-Z", "Y").to_euler()

    def highlight(ids):
        for obj in created:
            rid = obj.name.replace("public_", "", 1)
            paint_region(obj, gold if rid in ids else dim, emissive=rid in ids)

    shots = [
        ({"upper_back_region", "lower_back_region"}, "back", "qa-full-back.png"),
        ({"upper_back_region"}, "back", "qa-upper-back.png"),
        ({"left_pectoral_region", "right_pectoral_region"}, "front", "qa-full-chest.png"),
        ({"right_pectoral_region"}, "front", "qa-pectoral-right.png"),
        ({"full_abdomen_region"}, "front", "qa-abdomen.png"),
        ({"right_ribs_region"}, "right", "qa-ribs-right.png"),
        ({"right_biceps_surface"}, "front", "qa-biceps-right.png"),
        ({"right_triceps_surface"}, "back", "qa-triceps-right.png"),
        ({"left_shin_surface", "left_calf_surface"}, "left", "qa-lower-leg-left.png"),
    ]
    for ids, view, fname in shots:
        highlight(ids)
        place(view)
        out = ART / fname
        scene.render.filepath = str(out)
        bpy.ops.render.render(write_still=True)
        log(f"Render {fname}")


def main():
    ART.mkdir(parents=True, exist_ok=True)
    baked, rig = bake_source()
    mesh = baked.data
    mw = baked.matrix_world
    lm = build_landmarks(baked, rig, Vector((0, 0, 0)))
    log(f"Baked faces={len(mesh.polygons)} height={lm.body_height:.3f}")

    pairs = load_interaction_centroids()
    log(f"Interaction face samples={len(pairs)}")
    kd = KDTree(len(pairs))
    for i, (c, _a) in enumerate(pairs):
        kd.insert(c, i)
    kd.balance()

    centroids = {}
    normals = {}
    areas = {}
    for poly in mesh.polygons:
        centroids[poly.index] = face_centroid(mesh, mw, poly)
        normals[poly.index] = face_normal(mesh, mw, poly)
        areas[poly.index] = face_area(mesh, poly, mw)

    edge_map = build_edge_face_map(mesh)
    adj: dict[int, set[int]] = defaultdict(set)
    for faces in edge_map.values():
        for i in range(len(faces)):
            for j in range(i + 1, len(faces)):
                adj[faces[i]].add(faces[j])
                adj[faces[j]].add(faces[i])

    face_region: dict[int, str] = {}
    sternum_faces: set[int] = set()
    flank_faces: dict[str, set[int]] = {"left": set(), "right": set()}

    for fi, c in centroids.items():
        _co, idx, dist = kd.find(c)
        atomic = pairs[idx][1]
        mapped = ATOMIC_TO_PUBLIC.get(atomic)
        if mapped is None:
            face_region[fi] = "helper_non_selectable"
        elif mapped == "STERNUM_SPLIT":
            sternum_faces.add(fi)
        elif mapped == "FLANK_DISTRIBUTE":
            side = "left" if c.x > lm.sternum_x else "right"
            flank_faces[side].add(fi)
        elif mapped == "ROUTING_SACRUM":
            face_region[fi] = "lower_back_region" if normals[fi].dot(lm.body_front) < -0.1 else "genital_non_selectable"
        else:
            face_region[fi] = mapped

    # Distribute flanks: posterior → back, anterior-low → abdomen, else ribs
    back_split_z = (lm.chest_lower.z + lm.waist_level.z) * 0.52
    for side, faces in flank_faces.items():
        for fi in faces:
            c = centroids[fi]
            n = normals[fi]
            if n.dot(lm.body_front) < -0.05 or c.y > 0.05:
                face_region[fi] = "upper_back_region" if c.z >= back_split_z else "lower_back_region"
            elif n.dot(lm.body_front) > 0.15 and c.z < lm.nipple_r.z - 0.02:
                face_region[fi] = "full_abdomen_region"
            else:
                face_region[fi] = f"{side}_ribs_region"

    # Absorb strongly posterior ribs into wide back (keep lateral ribs public)
    for fi, rid in list(face_region.items()):
        if rid not in ("left_ribs_region", "right_ribs_region"):
            continue
        c = centroids[fi]
        n = normals[fi]
        if n.dot(lm.body_front) < -0.25 or (c.y > 0.08 and n.dot(lm.body_front) < 0.0):
            if c.z >= back_split_z:
                face_region[fi] = "upper_back_region"
            elif c.z > lm.pelvis.z + 0.05:
                face_region[fi] = "lower_back_region"

    # Pectoral region growing seeded from chest + sternum halves
    half_chest = max(lm.chest_width * 0.5, 0.12)
    z_nip = (lm.nipple_r.z + lm.nipple_l.z) * 0.5
    z_clav = min(lm.clavicle_l.z, lm.clavicle_r.z) - 0.02

    def pec_floor(lr_abs: float) -> float:
        t = min(1.0, lr_abs / (half_chest * 0.95))
        return (z_nip - 0.04) + ((lm.axillary_z - 0.08) - (z_nip - 0.04)) * (t ** 1.1)

    for side, nip, rid in (
        ("right", lm.nipple_r, "right_pectoral_region"),
        ("left", lm.nipple_l, "left_pectoral_region"),
    ):
        is_right = side == "right"

        def accept(fi, _is_right=is_right):
            c = centroids[fi]
            n = normals[fi]
            if n.dot(lm.body_front) < 0.05:
                return False
            if _is_right and c.x > lm.sternum_x + 0.015:
                return False
            if not _is_right and c.x < lm.sternum_x - 0.015:
                return False
            if c.z > z_clav + 0.02:
                return False
            lr = abs(c.x - lm.sternum_x)
            if c.z < pec_floor(lr) - 0.02:
                return False
            if lr > half_chest * 1.08:
                return False
            if c.y > 0.12:
                return False
            return True

        seeds = {fi for fi, r in face_region.items() if r == rid}
        for fi in sternum_faces:
            if (is_right and centroids[fi].x <= lm.sternum_x) or (
                not is_right and centroids[fi].x > lm.sternum_x
            ):
                if accept(fi):
                    seeds.add(fi)
        # Also allow growth into nearby abdomen/ribs if they pass accept
        allowed = set(face_region.keys())
        grown = grow_region(seeds, allowed, adj, accept)
        for fi in grown:
            face_region[fi] = rid
        for fi in sternum_faces:
            if fi in grown or accept(fi):
                if (is_right and centroids[fi].x <= lm.sternum_x) or (
                    not is_right and centroids[fi].x > lm.sternum_x
                ):
                    face_region[fi] = rid

    for fi in sternum_faces:
        if fi not in face_region or face_region.get(fi) in (
            "left_pectoral_region",
            "right_pectoral_region",
        ):
            continue
        # leftover sternum → nearer pec if in chest band else abdomen
        c = centroids[fi]
        if c.z >= pec_floor(0) - 0.02:
            face_region[fi] = (
                "right_pectoral_region" if c.x <= lm.sternum_x else "left_pectoral_region"
            )
        else:
            face_region[fi] = "full_abdomen_region"

    smooth_boundary(face_region, adj, "right_pectoral_region")
    smooth_boundary(face_region, adj, "left_pectoral_region")
    smooth_boundary(face_region, adj, "upper_back_region")

    # Ensure every face classified
    for fi in centroids:
        if fi not in face_region:
            face_region[fi] = "helper_non_selectable"

    # Stats
    stats = {}
    for rid in list(PUBLIC_BASE_SELECTABLE) + list(ROUTING_ONLY_BASE) + [
        "face_non_selectable",
        "genital_non_selectable",
        "helper_non_selectable",
    ]:
        faces = [i for i, r in face_region.items() if r == rid]
        if not faces:
            continue
        comps = connected_components(mesh, faces)
        xs = [centroids[i].x for i in faces]
        ys = [centroids[i].y for i in faces]
        zs = [centroids[i].z for i in faces]
        stats[rid] = {
            "faceCount": len(faces),
            "triangleCount": sum(max(0, len(mesh.polygons[i].vertices) - 2) for i in faces),
            "surfaceArea": round(sum(areas[i] for i in faces), 6),
            "centroid": [
                round(sum(xs) / len(xs), 5),
                round(sum(ys) / len(ys), 5),
                round(sum(zs) / len(zs), 5),
            ],
            "bbox": [
                [round(min(xs), 4), round(min(ys), 4), round(min(zs), 4)],
                [round(max(xs), 4), round(max(ys), 4), round(max(zs), 4)],
            ],
            "widthX": round(max(xs) - min(xs), 4),
            "connectedComponents": len(comps),
            "classification": (
                "selectable"
                if rid in PUBLIC_BASE_SELECTABLE
                else ("routing_only" if rid in ROUTING_ONLY_BASE else "non_selectable")
            ),
        }

    region_adj: dict[str, set[str]] = defaultdict(set)
    for faces in edge_map.values():
        if len(faces) < 2:
            continue
        regs = {
            face_region[f]
            for f in faces
            if f in face_region
            and (
                face_region[f] in PUBLIC_BASE_SELECTABLE
                or face_region[f] in ROUTING_ONLY_BASE
            )
        }
        for a in regs:
            for b in regs:
                if a != b:
                    region_adj[a].add(b)
    adjacency = {k: sorted(v) for k, v in sorted(region_adj.items())}

    ub = stats.get("upper_back_region", {})
    log(f"upper_back faces={ub.get('faceCount')} w={ub.get('widthX')}")
    log(
        f"pectorals R={stats.get('right_pectoral_region', {}).get('faceCount')} "
        f"L={stats.get('left_pectoral_region', {}).get('faceCount')}"
    )
    log(
        f"biceps={stats.get('right_biceps_surface', {}).get('faceCount')} "
        f"triceps={stats.get('right_triceps_surface', {}).get('faceCount')} "
        f"shin={stats.get('left_shin_surface', {}).get('faceCount')} "
        f"calf={stats.get('left_calf_surface', {}).get('faceCount')}"
    )

    if ub.get("widthX", 0) < 0.28:
        fail(f"upper_back too narrow {ub.get('widthX')}")
    for rid, mn_f in (
        ("right_pectoral_region", 60),
        ("right_biceps_surface", 40),
        ("right_triceps_surface", 40),
        ("left_shin_surface", 40),
        ("left_calf_surface", 40),
        ("right_ribs_region", 20),
    ):
        fc = stats.get(rid, {}).get("faceCount", 0)
        if fc < mn_f:
            fail(f"{rid} too small {fc}")

    # Extract meshes
    by_region: dict[str, set[int]] = defaultdict(set)
    for fi, rid in face_region.items():
        by_region[rid].add(fi)
    created = []
    for rid in list(PUBLIC_BASE_SELECTABLE) + list(ROUTING_ONLY_BASE):
        obj = extract_region_mesh(baked, by_region.get(rid, set()), f"public_{rid}")
        if obj:
            created.append(obj)
            log(f"  {rid}: {len(by_region.get(rid, set()))}")

    for obj in list(bpy.data.objects):
        if not obj.name.startswith("public_"):
            bpy.data.objects.remove(obj, do_unlink=True)

    OUT_BLEND.parent.mkdir(parents=True, exist_ok=True)
    bpy.ops.wm.save_as_mainfile(filepath=str(OUT_BLEND))
    bpy.ops.export_scene.gltf(
        filepath=str(OUT_GLB),
        export_format="GLB",
        use_selection=False,
        export_animations=False,
        export_skins=False,
        export_morph=False,
        export_apply=True,
    )
    log(f"Exported {OUT_GLB}")

    validation = {
        "totalFaces": len(centroids),
        "classifiedFaces": len(face_region),
        "unclassified": 0,
        "overlaps": 0,
        "disconnectedSelectable": [
            r
            for r, s in stats.items()
            if s.get("classification") == "selectable" and s["connectedComponents"] != 1
        ],
        "leftRightMismatches": [
            r
            for r, s in stats.items()
            if (r.startswith("left_") and s["centroid"][0] < lm.sternum_x - 0.02)
            or (r.startswith("right_") and s["centroid"][0] > lm.sternum_x + 0.02)
        ],
        "adjacencyEdgeCount": sum(len(v) for v in adjacency.values()) // 2,
        "method": "interaction_transfer_plus_anatomical_refinement",
    }

    ADJ_JSON.parent.mkdir(parents=True, exist_ok=True)
    ADJ_JSON.write_text(
        json.dumps(
            {
                "generatedFrom": "tools/blender/generate_neutro_body_v1_public_regions_v2.py",
                "source": str(SOURCE.relative_to(REPO)).replace("\\", "/"),
                "baseRegions": list(PUBLIC_BASE_SELECTABLE),
                "routingOnlyRegions": list(ROUTING_ONLY_BASE),
                "adjacency": adjacency,
                "edgeCount": validation["adjacencyEdgeCount"],
                "stats": stats,
                "landmarks": lm.to_dict(),
                "validation": validation,
            },
            indent=2,
        ),
        encoding="utf-8",
    )
    LANDMARKS_OUT.parent.mkdir(parents=True, exist_ok=True)
    LANDMARKS_OUT.write_text(
        json.dumps({"landmarks": lm.to_dict(), "source": str(SOURCE.relative_to(REPO)).replace("\\", "/")}, indent=2),
        encoding="utf-8",
    )
    REPORT.write_text(
        json.dumps(
            {
                "model": str(OUT_GLB.relative_to(REPO)).replace("\\", "/"),
                "method": validation["method"],
                "stats": stats,
                "validation": validation,
                "back": {"upper_back_widthX": ub.get("widthX"), "upper_back_faces": ub.get("faceCount")},
                "pectorals": {
                    "right_faces": stats.get("right_pectoral_region", {}).get("faceCount"),
                    "left_faces": stats.get("left_pectoral_region", {}).get("faceCount"),
                    "right_widthX": stats.get("right_pectoral_region", {}).get("widthX"),
                },
            },
            indent=2,
        ),
        encoding="utf-8",
    )
    render_qa(created)
    log("DONE")


if __name__ == "__main__":
    main()
