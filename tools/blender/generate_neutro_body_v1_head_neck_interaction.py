"""
Generate Neutro Body V1 head/neck InteractionModel (12 atomic zones).

Outputs:
  assets/blender/neutro-body/interaction/neutro_body_v1_head_neck_interaction.blend
  public/models/interaction/neutro_body_v1_head_neck_interaction.glb
  artifacts/body-v1-81-zone-map/head-neck-report.json

Run:
  blender.exe --background --python tools/blender/generate_neutro_body_v1_head_neck_interaction.py
"""

from __future__ import annotations

import json
import os
import sys
from pathlib import Path

import bmesh
import bpy
from mathutils import Vector

REPO = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(Path(__file__).resolve().parent))

from neutro_body_interaction.body_frame import build_body_frame  # noqa: E402
from neutro_body_interaction.config import (  # noqa: E402
    HEAD_ZONE_COLORS,
    HEAD_ZONE_IDS,
    LEG_FINAL_CIRCUMFERENTIAL_CONFIG,
    LEG_FINAL_LONGITUDINAL_CONFIG,
    PELVIS_FINAL_CONFIG,
    TORSO_T2_CONFIG,
)
from neutro_body_interaction.geometry import face_area, world_bbox  # noqa: E402
from neutro_body_interaction.head_segmentation import (  # noqa: E402
    build_head_frame,
    collect_cephalic_universe,
    resolve_head_landmarks,
    segment_head_faces,
)
from neutro_body_interaction.leg_segmentation import (  # noqa: E402
    apply_leg_circumferential,
    resolve_leg_landmarks,
    segment_leg_faces,
)
from neutro_body_interaction.pelvis_segmentation import (  # noqa: E402
    integrate_pelvis_with_torso,
    resolve_pelvis_landmarks,
)
from neutro_body_interaction.torso_segmentation import (  # noqa: E402
    build_torso_context,
    collect_arm_universe_faces,
    segment_torso_faces,
)

SOURCE = REPO / "assets" / "blender" / "neutro-body" / "neutro_body_v1_complete_source.blend"
OUT_BLEND = (
    REPO
    / "assets"
    / "blender"
    / "neutro-body"
    / "interaction"
    / "neutro_body_v1_head_neck_interaction.blend"
)
OUT_GLB = REPO / "public" / "models" / "interaction" / "neutro_body_v1_head_neck_interaction.glb"
ART = REPO / "artifacts" / "body-v1-81-zone-map"
REPORT = ART / "head-neck-report.json"


def log(msg: str) -> None:
    print(f"[head-neck] {msg}", flush=True)


def fail(msg: str) -> None:
    log(f"FAIL: {msg}")
    sys.exit(1)


def bone_head(rig, name: str) -> Vector | None:
    pb = rig.pose.bones.get(name)
    if pb is None:
        return None
    return (rig.matrix_world @ pb.matrix).translation.copy()


def bone_tip(rig, name: str) -> Vector | None:
    pb = rig.pose.bones.get(name)
    if pb is None:
        return None
    return (rig.matrix_world @ pb.matrix @ Vector((0.0, pb.length, 0.0)).to_4d()).xyz


def open_and_bake():
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
    baked = bpy.data.objects.new("HeadBake", baked_mesh)
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
    return human, rig, baked, baked_mesh, offset


def reconstruct_assigned69(rig, baked_mesh, mw, vg_map, offset):
    def bh(name: str) -> Vector:
        v = bone_head(rig, name)
        if v is None:
            fail(f"Missing {name}")
        return v + offset

    def bt(name: str) -> Vector:
        t = bone_tip(rig, name)
        if t is None:
            fail(f"Missing tip {name}")
        return t + offset

    body, torso_lm = build_torso_context(
        bh("pelvis"),
        bh("spine_01"),
        bh("spine_02"),
        bh("spine_03"),
        bh("neck_01"),
        bh("clavicle_l"),
        bh("clavicle_r"),
    )
    tip_r = bone_tip(rig, "middle_03_r")
    tip_l = bone_tip(rig, "middle_03_l")
    tip_r = (tip_r + offset) if tip_r is not None else bt("hand_r")
    tip_l = (tip_l + offset) if tip_l is not None else bt("hand_l")
    arm_universe = collect_arm_universe_faces(
        baked_mesh,
        mw,
        vg_map,
        bh("upperarm_r"),
        bh("lowerarm_r"),
        bh("hand_r"),
        tip_r,
        bh("upperarm_l"),
        bh("lowerarm_l"),
        bh("hand_l"),
        tip_l,
    )
    torso = segment_torso_faces(
        baked_mesh, mw, vg_map, body, torso_lm, arm_universe, TORSO_T2_CONFIG
    )
    margin = PELVIS_FINAL_CONFIG.thigh_start_margin
    combined = integrate_pelvis_with_torso(
        baked_mesh,
        mw,
        vg_map,
        body,
        resolve_pelvis_landmarks(
            torso_lm.waist_level,
            torso_lm.pelvis_top,
            bh("pelvis"),
            bh("thigh_l"),
            bh("thigh_r"),
            bh("calf_l"),
            bh("calf_r"),
            thigh_margin=margin,
        ),
        arm_universe,
        torso.face_zone,
        torso.coords,
        torso.centroids,
        torso.tris_by_face,
        torso.areas,
        PELVIS_FINAL_CONFIG,
    )
    leg_faces: set[int] = set()
    for side, sfx in (("right", "r"), ("left", "l")):
        lm = resolve_leg_landmarks(
            side,
            bh(f"thigh_{sfx}"),
            bh(f"calf_{sfx}"),
            bh(f"foot_{sfx}"),
            bt(f"ball_{sfx}"),
            margin,
        )
        long = segment_leg_faces(
            baked_mesh, mw, vg_map, lm, LEG_FINAL_LONGITUDINAL_CONFIG
        )
        circ = apply_leg_circumferential(
            baked_mesh, mw, long, bh("pelvis"), LEG_FINAL_CIRCUMFERENTIAL_CONFIG
        )
        leg_faces |= set(circ.face_zone.keys())
    assigned = set(arm_universe) | set(combined.face_zone.keys()) | leg_faces
    return assigned, body, bh


def make_mat(name: str, color):
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    nodes, links = mat.node_tree.nodes, mat.node_tree.links
    nodes.clear()
    bsdf = nodes.new("ShaderNodeBsdfPrincipled")
    bsdf.inputs["Base Color"].default_value = (*color[:3], 1.0)
    if "Alpha" in bsdf.inputs:
        bsdf.inputs["Alpha"].default_value = 0.85
    mat.blend_method = "BLEND"
    out = nodes.new("ShaderNodeOutputMaterial")
    links.new(bsdf.outputs[0], out.inputs[0])
    return mat


def extract_zone(src, faces, name, mat):
    bpy.ops.object.select_all(action="DESELECT")
    src.select_set(True)
    bpy.context.view_layer.objects.active = src
    bpy.ops.object.duplicate()
    zone = bpy.context.active_object
    zone.name = name
    zone.data = zone.data.copy()
    bm = bmesh.new()
    bm.from_mesh(zone.data)
    bm.faces.ensure_lookup_table()
    keep = set(faces)
    bmesh.ops.delete(bm, geom=[f for f in bm.faces if f.index not in keep], context="FACES")
    loose = [v for v in bm.verts if not v.link_faces]
    if loose:
        bmesh.ops.delete(bm, geom=loose, context="VERTS")
    bm.to_mesh(zone.data)
    bm.free()
    zone.data.materials.clear()
    zone.data.materials.append(mat)
    return zone


def setup_studio(center: Vector, radius: float):
    scene = bpy.context.scene
    try:
        scene.render.engine = "BLENDER_EEVEE_NEXT"
    except TypeError:
        scene.render.engine = "BLENDER_EEVEE"
    scene.render.resolution_x = 1280
    scene.render.resolution_y = 1600
    scene.render.image_settings.file_format = "PNG"
    world = bpy.data.worlds.new("HNWorld")
    scene.world = world
    world.use_nodes = True
    bg = world.node_tree.nodes["Background"]
    bg.inputs[0].default_value = (0.08, 0.08, 0.09, 1)
    for o in list(bpy.data.objects):
        if o.type == "LIGHT":
            bpy.data.objects.remove(o, do_unlink=True)
    key = bpy.data.lights.new("Key", "AREA")
    key.energy = 220
    ko = bpy.data.objects.new("Key", key)
    bpy.context.collection.objects.link(ko)
    ko.location = center + Vector((1.0, -1.4, 1.0))
    cam_data = bpy.data.cameras.new("HNCam")
    cam_data.lens = 55
    cam = bpy.data.objects.new("HNCam", cam_data)
    bpy.context.collection.objects.link(cam)
    scene.camera = cam
    return cam, max(radius, 0.25)


def place_cam(cam, view, center, radius):
    d = radius * 2.6
    offs = {
        "front": Vector((0, -d, 0)),
        "back": Vector((0, d, 0)),
        "left": Vector((-d, 0, 0)),
        "right": Vector((d, 0, 0)),
        "top": Vector((0, -0.15 * d, d)),
    }
    cam.location = center + offs[view]
    cam.rotation_euler = (center - cam.location).to_track_quat("-Z", "Y").to_euler()


def main():
    ART.mkdir(parents=True, exist_ok=True)
    human, rig, baked, baked_mesh, offset = open_and_bake()
    vg_map = {vg.name: vg.index for vg in baked.vertex_groups}
    mw = baked.matrix_world

    assigned69, body, bh = reconstruct_assigned69(rig, baked_mesh, mw, vg_map, offset)
    universe = collect_cephalic_universe(
        baked_mesh, mw, vg_map, assigned69, bh("neck_01"), body
    )
    if assigned69 & universe:
        fail(f"headNeck ∩ 69 = {len(assigned69 & universe)}")

    head_tip = bone_tip(rig, "head")
    head_tip = (head_tip + offset) if head_tip is not None else None
    lm = resolve_head_landmarks(
        baked_mesh,
        mw,
        vg_map,
        universe,
        bh("neck_01"),
        bh("head"),
        head_tip,
        body,
    )
    frame = build_head_frame(body, lm)
    result = segment_head_faces(baked_mesh, mw, vg_map, universe, lm, frame, body)

    # Invariants
    claimed = set(result.face_zone.keys())
    if claimed != universe:
        fail(f"coverage holes/extra {len(universe - claimed)} / {len(claimed - universe)}")
    if len(claimed) != len(result.face_zone):
        fail("duplicate face keys")
    zone_ids = set(result.face_zone.values())
    if not zone_ids <= set(HEAD_ZONE_IDS):
        fail(f"unknown zones {zone_ids - set(HEAD_ZONE_IDS)}")

    log(
        f"universe={len(universe)} area={sum(face_area(baked_mesh, baked_mesh.polygons[i], mw) for i in universe):.6f}"
    )
    for zid in HEAD_ZONE_IDS:
        m = result.metrics[zid]
        log(
            f"  {zid}: faces={m['faces']} area%={m['percentageOfHeadNeck']} "
            f"comp={m['connectedComponentsAfter']}"
        )

    # Extract meshes
    mats = {zid: make_mat(f"Debug_{zid}", HEAD_ZONE_COLORS[zid]) for zid in HEAD_ZONE_IDS}
    zone_faces = {zid: [] for zid in HEAD_ZONE_IDS}
    for fi, zid in result.face_zone.items():
        zone_faces[zid].append(fi)
    zone_objs = []
    for zid in HEAD_ZONE_IDS:
        if not zone_faces[zid]:
            fail(f"Empty zone {zid}")
        zone_objs.append(extract_zone(baked, zone_faces[zid], f"zone_{zid}", mats[zid]))

    for o in list(bpy.data.objects):
        if not o.name.startswith("zone_"):
            bpy.data.objects.remove(o, do_unlink=True)

    OUT_BLEND.parent.mkdir(parents=True, exist_ok=True)
    OUT_GLB.parent.mkdir(parents=True, exist_ok=True)
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
    log(f"Saved {OUT_BLEND}")
    log(f"Exported {OUT_GLB} ({OUT_GLB.stat().st_size} bytes)")

    def v3(v: Vector):
        return [round(v.x, 4), round(v.y, 4), round(v.z, 4)]

    hit_targets = [
        zid
        for zid, m in result.metrics.items()
        if m["percentageOfHeadNeck"] < 3.0
    ]
    report = {
        "universeFaces": len(universe),
        "universeTris": sum(
            max(0, len(baked_mesh.polygons[i].vertices) - 2) for i in universe
        ),
        "universeArea": round(
            sum(m["surfaceArea"] for m in result.metrics.values()), 6
        ),
        "coverage": 100.0,
        "overlap": 0,
        "holes": 0,
        "duplicates": 0,
        "overlapWith69": 0,
        "landmarks": {
            "neckBase": v3(lm.neck_base),
            "jawLevel": v3(lm.jaw_level),
            "leftEarCenter": v3(lm.left_ear_center),
            "rightEarCenter": v3(lm.right_ear_center),
            "faceFrontReference": v3(lm.face_front_reference),
            "headTop": v3(lm.head_top),
        },
        "zones": result.metrics,
        "hitTargetsUnder3pct": hit_targets,
        "trianglesReassigned": result.triangles_reassigned,
        "blend": str(OUT_BLEND.as_posix()),
        "glb": str(OUT_GLB.as_posix()),
        "glbBytes": OUT_GLB.stat().st_size,
    }
    REPORT.write_text(json.dumps(report, indent=2), encoding="utf-8")
    log(f"Report {REPORT}")

    # Diagnostic head renders (best-effort; EEVEE can crash after GLB export)
    if os.environ.get("NEUTRO_SKIP_RENDERS") != "1":
        try:
            mn, mx = world_bbox(zone_objs[0])
            for o in zone_objs:
                a, b = world_bbox(o)
                mn = Vector((min(mn.x, a.x), min(mn.y, a.y), min(mn.z, a.z)))
                mx = Vector((max(mx.x, b.x), max(mx.y, b.y), max(mx.z, b.z)))
            center = (mn + mx) * 0.5
            radius = (mx - mn).length * 0.55
            cam, radius = setup_studio(center, radius)
            for view in ("front", "back", "left", "right", "top"):
                place_cam(cam, view, center, radius)
                out = ART / f"head-{view}.png"
                bpy.context.scene.render.filepath = str(out)
                bpy.ops.render.render(write_still=True)
                log(f"Render {out.name}")
            for view in ("front", "back"):
                place_cam(cam, view, center, radius)
                out = ART / f"head-boundaries-{view}.png"
                bpy.context.scene.render.filepath = str(out)
                bpy.ops.render.render(write_still=True)
                log(f"Render {out.name}")
        except Exception as exc:  # noqa: BLE001
            log(f"Render skipped/failed: {exc}")

    log("DONE")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
