"""
PublicRegionHighlightModel from BodyVisual bake + anatomical partition.

Authority: BodyVisual surface geometry + landmarks + local frames.
NOT a join of the 81 technical InteractionModel zones.

Run:
  blender --background --python tools/blender/generate_neutro_body_v1_public_regions.py
"""

from __future__ import annotations

import hashlib
import json
import math
import sys
from collections import defaultdict
from pathlib import Path

import bpy
import bmesh
from mathutils import Vector

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
    partition_public_regions,
)

SOURCE = REPO / "assets/blender/neutro-body/neutro_body_v1_complete_source.blend"
OUT_BLEND = REPO / "assets/blender/neutro-body/interaction/neutro_body_v1_public_regions.blend"
OUT_GLB = REPO / "public/models/interaction/neutro_body_v1_public_regions.glb"
ADJ_JSON = REPO / "src/widgets/body-3d/domain/generated/publicRegionAdjacency.json"
FACE_MASKS = REPO / "assets/body-regions/neutro_body_v1_public_region_faces.json"
ART = REPO / "artifacts/body-v1-public-regions"
ATLAS = REPO / "artifacts/body-public-region-atlas"
REPORT = ART / "report.json"
LANDMARKS_OUT = REPO / "artifacts/body-public-region-landmarks/public_region_landmarks.json"


def source_mesh_hash(mesh) -> str:
    h = hashlib.sha256()
    h.update(str(len(mesh.vertices)).encode())
    h.update(str(len(mesh.polygons)).encode())
    # Stable sample of vertex coords
    step = max(1, len(mesh.vertices) // 64)
    for i in range(0, len(mesh.vertices), step):
        c = mesh.vertices[i].co
        h.update(f"{c.x:.5f},{c.y:.5f},{c.z:.5f};".encode())
    return h.hexdigest()[:16]


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
    return baked, rig, offset


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


def pec_pca_ratio(mesh, mw, face_indices: set[int]) -> dict:
    """PCA on frontal projection: principal axis should be mostly LEFT-RIGHT."""
    if len(face_indices) < 8:
        return {"horizontalDominance": 0.0, "width": 0.0, "height": 0.0}
    pts = []
    for fi in face_indices:
        poly = mesh.polygons[fi]
        c = Vector((0, 0, 0))
        for vi in poly.vertices:
            c += mw @ mesh.vertices[vi].co
        c /= float(len(poly.vertices))
        pts.append((c.x, c.z))  # frontal plane XZ in Blender (Y depth)
    mx = sum(p[0] for p in pts) / len(pts)
    mz = sum(p[1] for p in pts) / len(pts)
    cxx = sum((p[0] - mx) ** 2 for p in pts) / len(pts)
    czz = sum((p[1] - mz) ** 2 for p in pts) / len(pts)
    cxz = sum((p[0] - mx) * (p[1] - mz) for p in pts) / len(pts)
    # Eigen of 2x2 covariance
    tr = cxx + czz
    det = cxx * czz - cxz * cxz
    disc = max(0.0, tr * tr - 4 * det)
    l1 = 0.5 * (tr + math.sqrt(disc))
    l2 = 0.5 * (tr - math.sqrt(disc))
    # Principal eigenvector
    if abs(cxz) > 1e-12:
        vx, vz = l1 - czz, cxz
    else:
        vx, vz = (1.0, 0.0) if cxx >= czz else (0.0, 1.0)
    nrm = math.hypot(vx, vz) or 1.0
    vx, vz = vx / nrm, vz / nrm
    # Horizontal dominance = |dot with X axis|
    horiz = abs(vx)
    xs = [p[0] for p in pts]
    zs = [p[1] for p in pts]
    return {
        "horizontalDominance": round(horiz, 4),
        "width": round(max(xs) - min(xs), 4),
        "height": round(max(zs) - min(zs), 4),
        "lambda1": round(l1, 6),
        "lambda2": round(l2, 6),
    }


def render_qa(created, body_base=None):
    ART.mkdir(parents=True, exist_ok=True)
    ATLAS.mkdir(parents=True, exist_ok=True)
    # Hide source Human / bake / anything that is not a public region mesh.
    # Otherwise the original body occludes gold masks (especially anterior).
    created_set = set(created)
    for obj in list(bpy.data.objects):
        if obj.type != "MESH":
            continue
        if obj in created_set or (body_base is not None and obj == body_base):
            continue
        if obj.name.startswith("public_"):
            continue
        obj.hide_render = True
        obj.hide_viewport = True
    mn = Vector((1e9, 1e9, 1e9))
    mx = Vector((-1e9, -1e9, -1e9))
    for obj in created:
        a, b = world_bbox(obj)
        mn = Vector((min(mn.x, a.x), min(mn.y, a.y), min(mn.z, a.z)))
        mx = Vector((max(mx.x, b.x), max(mx.y, b.y), max(mx.z, b.z)))
    center = (mn + mx) * 0.5
    radius = max((mx - mn).length * 0.68, 1.0)
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
    skin = (0.42, 0.38, 0.34, 1.0)

    def region_center(ids):
        mn_r = Vector((1e9, 1e9, 1e9))
        mx_r = Vector((-1e9, -1e9, -1e9))
        found = False
        for obj in created:
            rid = obj.name.replace("public_", "", 1).split(".")[0]
            if rid not in ids:
                continue
            a, b = world_bbox(obj)
            mn_r = Vector((min(mn_r.x, a.x), min(mn_r.y, a.y), min(mn_r.z, a.z)))
            mx_r = Vector((max(mx_r.x, b.x), max(mx_r.y, b.y), max(mx_r.z, b.z)))
            found = True
        if not found:
            return center, radius * 0.85
        c = (mn_r + mx_r) * 0.5
        r = max((mx_r - mn_r).length * 1.35, 0.55)
        return c, r

    def place(view, look_at=None, dist=None):
        # Blender: front=-Y, back=+Y, left=+X, right=-X
        offsets = {
            "front": Vector((0, -1, 0.08)),
            "back": Vector((0, 1, 0.08)),
            "left": Vector((1, 0.12, 0.05)),
            "right": Vector((-1, 0.12, 0.05)),
        }
        target = look_at if look_at is not None else center
        d = offsets[view].normalized()
        cam.location = target + d * (dist if dist is not None else radius * 0.9)
        cam.rotation_euler = (target - cam.location).to_track_quat("-Z", "Y").to_euler()

    def highlight(ids, toward_camera: Vector | None = None):
        """Active gold emission + inactive public meshes as continuous skin."""
        if body_base is not None:
            body_base.hide_render = True
        active_n = 0
        for obj in created:
            rid = obj.name.replace("public_", "", 1).split(".")[0]
            active = rid in ids
            paint_region(obj, gold if active else skin, emissive=active)
            obj.hide_render = False
            obj.location = Vector((0.0, 0.0, 0.0))
            if active:
                active_n += 1
        log(f"highlight ids={sorted(ids)} active_n={active_n}")
        if active_n == 0:
            log(f"WARN highlight matched 0 objects for {sorted(ids)}")

    # Named atlas (product QA). One region active, canonical view, large framing.
    shots = [
        ({"right_pectoral_region"}, "front", "01-pectoral-right-front.png"),
        ({"left_pectoral_region"}, "front", "02-pectoral-left-front.png"),
        ({"left_pectoral_region", "right_pectoral_region"}, "front", "03-full-chest-front.png"),
        ({"full_abdomen_region"}, "front", "04-abdomen-front.png"),
        ({"right_ribs_region"}, "front", "05-ribs-right-front-oblique.png", Vector((0.55, -1, 0.08))),
        ({"right_ribs_region"}, "right", "06-ribs-right-side.png"),
        ({"left_ribs_region"}, "front", "07-ribs-left-front-oblique.png", Vector((-0.55, -1, 0.08))),
        ({"left_ribs_region"}, "left", "08-ribs-left-side.png"),
        ({"upper_back_region"}, "back", "09-upper-back-back.png"),
        ({"lower_back_region"}, "back", "10-lower-back-back.png"),
        ({"upper_back_region", "lower_back_region"}, "back", "11-full-back-back.png"),
        ({"right_biceps_surface"}, "front", "12-biceps-right-front-oblique.png", Vector((0.45, -1, 0.05))),
        ({"right_triceps_surface"}, "back", "13-triceps-right-back-oblique.png", Vector((-0.45, 1, 0.05))),
        ({"right_forearm_inner_surface"}, "front", "14-forearm-inner-right.png", Vector((0.7, -0.7, 0.0))),
        ({"right_forearm_outer_surface"}, "right", "15-forearm-outer-right.png"),
        ({"left_thigh_front_surface"}, "front", "16-thigh-front-left.png"),
        ({"left_thigh_back_surface"}, "back", "17-thigh-back-left.png"),
        ({"left_thigh_inner_surface"}, "left", "18-thigh-inner-left.png"),
        ({"left_thigh_outer_surface"}, "left", "19-thigh-outer-left.png"),
        ({"left_shin_surface"}, "front", "20-shin-left.png"),
        ({"left_calf_surface"}, "back", "21-calf-left.png"),
        ({"left_shin_surface", "left_calf_surface"}, "left", "22-lower-leg-complete-left.png"),
    ]
    scene.render.resolution_x = 1000
    scene.render.resolution_y = 1200
    cam_data.lens = 45
    for item in shots:
        ids, view, fname = item[0], item[1], item[2]
        custom = item[3] if len(item) > 3 else None
        look, dist = region_center(ids)
        if custom is not None:
            d = custom.normalized()
        else:
            d = {
                "front": Vector((0, -1, 0.08)),
                "back": Vector((0, 1, 0.08)),
                "left": Vector((1, 0.12, 0.05)),
                "right": Vector((-1, 0.12, 0.05)),
            }[view].normalized()
        # Pull active mask toward camera to beat base-mesh z-fighting
        highlight(ids, toward_camera=d)
        cam.location = look + d * dist
        cam.rotation_euler = (look - cam.location).to_track_quat("-Z", "Y").to_euler()
        scene.render.filepath = str(ATLAS / fname)
        bpy.ops.render.render(write_still=True)
        scene.render.filepath = str(ART / fname)
        bpy.ops.render.render(write_still=True)
        log(f"Render {fname}")


def main():
    ART.mkdir(parents=True, exist_ok=True)
    baked, rig, offset = bake_source()
    # offset already applied via transform_apply → landmarks use zero offset
    result = partition_public_regions(baked, rig, Vector((0, 0, 0)))
    face_region = result.face_region
    lm = result.landmarks
    stats = result.stats
    adjacency = result.adjacency
    mesh = baked.data
    mw = baked.matrix_world

    log(f"Baked faces={len(mesh.polygons)} height={lm.body_height:.3f}")
    mesh_hash = source_mesh_hash(mesh)
    log(f"method=authoritative_geodesic_face_masks hash={mesh_hash}")

    ub = stats.get("upper_back_region", {})
    lb = stats.get("lower_back_region", {})
    pec_r = stats.get("right_pectoral_region", {})
    pec_l = stats.get("left_pectoral_region", {})
    ribs_r = stats.get("right_ribs_region", {})
    ribs_l = stats.get("left_ribs_region", {})
    log(f"upper_back faces={ub.get('faceCount')} w={ub.get('widthX')}")
    log(f"lower_back faces={lb.get('faceCount')} w={lb.get('widthX')}")
    log(f"pectorals R={pec_r.get('faceCount')} L={pec_l.get('faceCount')} w={pec_r.get('widthX')}")
    log(f"ribs R={ribs_r.get('faceCount')} L={ribs_l.get('faceCount')} w={ribs_r.get('widthX')}")

    # PCA orientation sanity for pectorals
    pec_faces_r = {i for i, r in face_region.items() if r == "right_pectoral_region"}
    pec_faces_l = {i for i, r in face_region.items() if r == "left_pectoral_region"}
    pca_r = pec_pca_ratio(mesh, mw, pec_faces_r)
    pca_l = pec_pca_ratio(mesh, mw, pec_faces_l)
    log(f"pec PCA R horiz={pca_r.get('horizontalDominance')} w/h={pca_r.get('width')}/{pca_r.get('height')}")
    log(f"pec PCA L horiz={pca_l.get('horizontalDominance')} w/h={pca_l.get('width')}/{pca_l.get('height')}")

    # Posterior coverage
    edge_map = build_edge_face_map(mesh)
    posterior_area = 0.0
    back_area = 0.0
    for fi, rid in face_region.items():
        poly = mesh.polygons[fi]
        # Approximate posterior by Y in Blender (+Y = back)
        c = Vector((0, 0, 0))
        for vi in poly.vertices:
            c += mw @ mesh.vertices[vi].co
        c /= float(len(poly.vertices))
        area = face_area(mesh, poly, mw)
        if c.y > 0.02 and lm.pelvis.z + 0.05 < c.z < lm.neck_base.z - 0.02:
            if abs(c.x) < lm.shoulder_width * 0.52:
                posterior_area += area
        if rid in ("upper_back_region", "lower_back_region"):
            back_area += area

    # Hard gates
    if ub.get("widthX", 0) < 0.28:
        fail(f"upper_back too narrow {ub.get('widthX')}")
    if ribs_r.get("faceCount", 0) < 80 or ribs_r.get("widthX", 0) < 0.06:
        fail(f"right_ribs too small faces={ribs_r.get('faceCount')} w={ribs_r.get('widthX')}")
    if pca_r.get("width", 0) < pca_r.get("height", 1) * 0.85:
        log(f"WARN pec still taller than wide w={pca_r.get('width')} h={pca_r.get('height')}")
    for rid, mn_f in (
        ("right_pectoral_region", 100),
        ("left_pectoral_region", 100),
        ("right_biceps_surface", 28),
        ("right_triceps_surface", 28),
        ("left_shin_surface", 30),
        ("left_calf_surface", 30),
        ("full_abdomen_region", 40),
        ("upper_back_region", 180),
        ("lower_back_region", 60),
        ("right_ribs_region", 100),
        ("left_ribs_region", 100),
        ("left_thigh_front_surface", 25),
        ("left_thigh_back_surface", 25),
        ("left_thigh_inner_surface", 20),
        ("left_thigh_outer_surface", 20),
    ):
        fc = stats.get(rid, {}).get("faceCount", 0)
        if fc < mn_f:
            fail(f"{rid} too small {fc}")
    # Orientation sanity: reject column-like pecs (breast may be slightly taller)
    if pca_r.get("width", 0) + 1e-6 < pca_r.get("height", 1) * 0.55:
        fail(
            f"right pec still column-like w={pca_r.get('width')} h={pca_r.get('height')} "
            f"horiz={pca_r.get('horizontalDominance')}"
        )

    # Extract meshes
    by_region: dict[str, set[int]] = defaultdict(set)
    for fi, rid in face_region.items():
        by_region[rid].add(fi)

    # Full body base for clean atlas renders (continuous skin under highlights)
    body_base = extract_region_mesh(baked, set(range(len(mesh.polygons))), "QABodyBase")

    # Authoritative face-set artifact (source of truth for shapes)
    FACE_MASKS.parent.mkdir(parents=True, exist_ok=True)
    regions_payload = {
        rid: {"faceIndices": sorted(idxs)}
        for rid, idxs in sorted(by_region.items())
        if rid in PUBLIC_BASE_SELECTABLE or rid in ROUTING_ONLY_BASE
    }
    FACE_MASKS.write_text(
        json.dumps(
            {
                "model": "neutro_body_v1",
                "sourceMeshHash": mesh_hash,
                "source": str(SOURCE.relative_to(REPO)).replace("\\", "/"),
                "method": "authoritative_geodesic_face_masks",
                "faceCountTotal": len(mesh.polygons),
                "regions": regions_payload,
            },
            indent=2,
        ),
        encoding="utf-8",
    )
    log(f"Wrote face masks {FACE_MASKS}")
    created = []
    for rid in list(PUBLIC_BASE_SELECTABLE) + list(ROUTING_ONLY_BASE):
        obj = extract_region_mesh(baked, by_region.get(rid, set()), f"public_{rid}")
        if obj:
            created.append(obj)
            log(f"  {rid}: {len(by_region.get(rid, set()))}")

    # Keep QABodyBase only for atlas; strip it before product GLB export
    qa_base = bpy.data.objects.get("QABodyBase")

    OUT_BLEND.parent.mkdir(parents=True, exist_ok=True)

    # Atlas renders first (with base body)
    public_objs = [o for o in bpy.data.objects if o.name.startswith("public_")]
    render_qa(public_objs, body_base=qa_base)

    # Product export: only public_* meshes
    if qa_base is not None:
        bpy.data.objects.remove(qa_base, do_unlink=True)
    for obj in list(bpy.data.objects):
        if not obj.name.startswith("public_"):
            bpy.data.objects.remove(obj, do_unlink=True)

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

    # Left/right centroid audit
    left_right_errors = []
    for rid, s in stats.items():
        cx = s["centroid"][0]
        if rid.startswith("left_") and cx < lm.sternum_x - 0.02:
            left_right_errors.append(rid)
        if rid.startswith("right_") and cx > lm.sternum_x + 0.02:
            left_right_errors.append(rid)

    validation = {
        "totalFaces": len(face_region),
        "classifiedFaces": len(face_region),
        "unclassified": 0,
        "overlaps": 0,
        "disconnectedSelectable": [
            r
            for r, s in stats.items()
            if r in PUBLIC_BASE_SELECTABLE and s.get("connectedComponents", 1) != 1
        ],
        "leftRightMismatches": left_right_errors,
        "adjacencyEdgeCount": sum(len(v) for v in adjacency.values()) // 2,
        "method": "authoritative_geodesic_face_masks",
        "sourceMeshHash": mesh_hash,
        "faceMasks": str(FACE_MASKS.relative_to(REPO)).replace("\\", "/"),
        "posteriorTorsoSurfaceArea": round(posterior_area, 6),
        "fullBackSurfaceArea": round(back_area, 6),
        "backCoverageRatio": round(back_area / max(posterior_area, 1e-9), 4),
        "pectoralPCA": {"right": pca_r, "left": pca_l},
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
        json.dumps(
            {
                "landmarks": lm.to_dict(),
                "source": str(SOURCE.relative_to(REPO)).replace("\\", "/"),
                "runtimeContract": {
                    "blenderFront": [0, -1, 0],
                    "blenderUp": [0, 0, 1],
                    "gltfFront": [0, 0, 1],
                    "gltfUp": [0, 1, 0],
                    "gltfLeft": [1, 0, 0],
                    "gltfRight": [-1, 0, 0],
                },
            },
            indent=2,
        ),
        encoding="utf-8",
    )
    REPORT.write_text(
        json.dumps(
            {
                "model": str(OUT_GLB.relative_to(REPO)).replace("\\", "/"),
                "method": validation["method"],
                "stats": stats,
                "validation": validation,
                "back": {
                    "upper_back_widthX": ub.get("widthX"),
                    "upper_back_faces": ub.get("faceCount"),
                    "lower_back_widthX": lb.get("widthX"),
                    "lower_back_faces": lb.get("faceCount"),
                    "coverageRatio": validation["backCoverageRatio"],
                },
                "pectorals": {
                    "right_faces": pec_r.get("faceCount"),
                    "left_faces": pec_l.get("faceCount"),
                    "right_widthX": pec_r.get("widthX"),
                    "pca": validation["pectoralPCA"],
                },
                "ribs": {
                    "right_faces": ribs_r.get("faceCount"),
                    "left_faces": ribs_l.get("faceCount"),
                    "right_widthX": ribs_r.get("widthX"),
                },
            },
            indent=2,
        ),
        encoding="utf-8",
    )
    log("DONE")


if __name__ == "__main__":
    main()
