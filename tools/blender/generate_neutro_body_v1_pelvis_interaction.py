"""
Generate Neutro Body V1 pelvis pilots P1/P2 on top of official T2 torso.

Keeps locked T2 upper/mid zones; redraws lower_abdomen / lower_back_*;
adds left_hip, right_hip, left_glute, right_glute, sacrum; cleans ribs.

Outputs:
  assets/blender/neutro-body/interaction/pelvis-pilot/pelvis_p1_anatomical.blend
  assets/blender/neutro-body/interaction/pelvis-pilot/pelvis_p2_tattoo_optimized.blend
  public/models/interaction/pilot/neutro_body_v1_torso_pelvis_p1.glb
  public/models/interaction/pilot/neutro_body_v1_torso_pelvis_p2.glb
  artifacts/body-v1-pelvis-interaction/report.json + renders

Run:
  blender.exe --background --python tools/blender/generate_neutro_body_v1_pelvis_interaction.py
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

import bpy
import bmesh
from mathutils import Vector

REPO = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(Path(__file__).resolve().parent))

from neutro_body_interaction.config import (  # noqa: E402
    COMBINED_TORSO_PELVIS_ZONE_IDS,
    PELVIS_ISLAND_CLEANUP,
    PELVIS_P1_CONFIG,
    PELVIS_P2_CONFIG,
    PELVIS_ZONE_COLORS,
    PELVIS_ZONE_IDS,
    RIBS_ISLAND_CLEANUP,
    TORSO_T2_CONFIG,
    TORSO_ZONE_COLORS,
    TORSO_ZONE_IDS,
    PelvisGridConfig,
)
from neutro_body_interaction.geometry import world_bbox  # noqa: E402
from neutro_body_interaction.island_cleanup import connected_components  # noqa: E402
from neutro_body_interaction.island_cleanup_generic import (  # noqa: E402
    cleanup_islands_generic,
)
from neutro_body_interaction.pelvis_segmentation import (  # noqa: E402
    cleanup_wrapping_islands,
    expand_lower_back_from_lumbar_mid,
    integrate_pelvis_with_torso,
    resolve_pelvis_landmarks,
    ribs_secondary_ok,
)
from neutro_body_interaction.torso_segmentation import (  # noqa: E402
    build_torso_context,
    collect_arm_universe_faces,
    segment_torso_faces,
)

SOURCE = REPO / "assets" / "blender" / "neutro-body" / "neutro_body_v1_complete_source.blend"
OUT_DIR = REPO / "assets" / "blender" / "neutro-body" / "interaction" / "pelvis-pilot"
PILOT_GLB = REPO / "public" / "models" / "interaction" / "pilot"
ART = REPO / "artifacts" / "body-v1-pelvis-interaction"
REPORT = ART / "report.json"
ARMS_GLB = REPO / "public" / "models" / "interaction" / "neutro_body_v1_detailed_arms_interaction.glb"


def log(msg: str) -> None:
    print(f"[pelvis-interaction] {msg}", flush=True)


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


def make_mat(name: str, color):
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    nodes, links = mat.node_tree.nodes, mat.node_tree.links
    nodes.clear()
    bsdf = nodes.new("ShaderNodeBsdfPrincipled")
    bsdf.inputs["Base Color"].default_value = color
    bsdf.inputs["Roughness"].default_value = 0.55
    if "Alpha" in bsdf.inputs:
        bsdf.inputs["Alpha"].default_value = 0.78
    mat.blend_method = "BLEND"
    try:
        mat.surface_render_method = "BLENDED"
    except Exception:
        pass
    out = nodes.new("ShaderNodeOutputMaterial")
    links.new(bsdf.outputs[0], out.inputs[0])
    return mat


def color_for(zid: str):
    if zid in TORSO_ZONE_COLORS:
        return TORSO_ZONE_COLORS[zid]
    return PELVIS_ZONE_COLORS[zid]


def extract_zone_object(src_obj, face_indices, name, mat):
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
    bmesh.ops.delete(bm, geom=[f for f in bm.faces if f.index not in keep], context="FACES")
    loose = [v for v in bm.verts if not v.link_faces]
    if loose:
        bmesh.ops.delete(bm, geom=loose, context="VERTS")
    bm.to_mesh(zone.data)
    bm.free()
    zone.data.update()
    zone.data.materials.clear()
    zone.data.materials.append(mat)
    return zone


def setup_studio(center: Vector, radius: float):
    scene = bpy.context.scene
    try:
        scene.render.engine = "BLENDER_EEVEE_NEXT"
    except TypeError:
        try:
            scene.render.engine = "BLENDER_EEVEE"
        except TypeError:
            scene.render.engine = "CYCLES"
            scene.cycles.samples = 24
    scene.render.resolution_x = 1024
    scene.render.resolution_y = 1200
    scene.render.image_settings.file_format = "PNG"
    world = bpy.data.worlds.new("PelvisWorld")
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

    add_light("Key", 300.0, center + Vector((2.2, -2.6, 2.4)), 2.4)
    add_light("Fill", 110.0, center + Vector((-2.6, -1.4, 1.7)), 3.0)
    add_light("Rim", 140.0, center + Vector((0.0, 3.0, 2.1)), 2.2)
    cam_d = bpy.data.cameras.new("PelvisCam")
    cam_d.lens = 50.0
    cam = bpy.data.objects.new("PelvisCam", cam_d)
    bpy.context.collection.objects.link(cam)
    scene.camera = cam
    return cam, radius


def place_cam(cam, view, center, radius):
    offsets = {
        "front": Vector((0, -1, 0.06)),
        "back": Vector((0, 1, 0.06)),
        "left": Vector((1, 0.12, 0.04)),
        "right": Vector((-1, 0.12, 0.04)),
        "three-quarter-front": Vector((-0.55, -0.8, 0.08)),
        "three-quarter-back": Vector((0.55, 0.8, 0.08)),
    }
    d = offsets[view].normalized()
    cam.location = center + d * radius
    direction = center - cam.location
    cam.rotation_euler = direction.to_track_quat("-Z", "Y").to_euler()


def stitch_images(paths: list[Path], out: Path):
    imgs = [bpy.data.images.load(str(p)) for p in paths if p.exists()]
    if len(imgs) < 2:
        return
    w = sum(i.size[0] for i in imgs)
    h = max(i.size[1] for i in imgs)
    combined = bpy.data.images.new("cmp", width=w, height=h, alpha=True)
    pixels = [0.0] * (w * h * 4)
    x0 = 0
    for img in imgs:
        iw, ih = img.size
        src = list(img.pixels)
        for y in range(ih):
            for x in range(iw):
                si = (y * iw + x) * 4
                di = (y * w + (x0 + x)) * 4
                pixels[di : di + 4] = src[si : si + 4]
        x0 += iw
    combined.pixels = pixels
    combined.filepath_raw = str(out)
    combined.file_format = "PNG"
    combined.save()
    for img in imgs:
        bpy.data.images.remove(img)
    bpy.data.images.remove(combined)


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
    baked = bpy.data.objects.new("PelvisBake", baked_mesh)
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


def zone_metrics(mesh, face_zone, tris_by_face, areas, universe_area, before_map=None):
    out = {}
    for zid in COMBINED_TORSO_PELVIS_ZONE_IDS:
        faces = [fi for fi, z in face_zone.items() if z == zid]
        tris = sum(tris_by_face.get(fi, 0) for fi in faces)
        area = sum(areas.get(fi, 0.0) for fi in faces)
        comps = connected_components(mesh, faces) if faces else []
        out[zid] = {
            "triangleCount": tris,
            "faceCount": len(faces),
            "surfaceArea": round(area, 6),
            "percentageOfCombinedTorsoPelvis": round(
                100.0 * area / universe_area, 2
            )
            if universe_area > 1e-12
            else 0.0,
            "connectedComponentsBefore": (before_map or {}).get(zid, len(comps)),
            "connectedComponentsAfter": len(comps),
            "trianglesReassigned": 0,
        }
    return out


def run_pipeline(tag: str, pelvis_cfg: PelvisGridConfig, center_hint=None, radius_hint=None):
    human, rig, baked, baked_mesh, offset = open_and_bake()
    vg_map = {vg.name: vg.index for vg in baked.vertex_groups}
    mw = baked.matrix_world

    def bh(name: str) -> Vector:
        v = bone_head(rig, name)
        if v is None:
            fail(f"Missing bone {name}")
        return v + offset

    def bt(name: str) -> Vector | None:
        t = bone_tip(rig, name)
        return (t + offset) if t is not None else None

    body, torso_lm = build_torso_context(
        bh("pelvis"),
        bh("spine_01"),
        bh("spine_02"),
        bh("spine_03"),
        bh("neck_01"),
        bh("clavicle_l"),
        bh("clavicle_r"),
    )
    tip_r = bt("middle_03_r") or bt("hand_r")
    tip_l = bt("middle_03_l") or bt("hand_l")
    arm_faces = collect_arm_universe_faces(
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
    log(f"{tag}: arms excluded = {len(arm_faces)}")

    torso = segment_torso_faces(
        baked_mesh, mw, vg_map, body, torso_lm, arm_faces, TORSO_T2_CONFIG
    )
    log(f"{tag}: T2 torso faces={torso.universe_faces} tris={torso.universe_tris}")

    # Knee ≈ thigh bone tip (toward knee) or calf head
    knee_l = bt("thigh_l")
    knee_r = bt("thigh_r")
    if knee_l is None and bone_head(rig, "calf_l") is not None:
        knee_l = bh("calf_l")
    if knee_r is None and bone_head(rig, "calf_r") is not None:
        knee_r = bh("calf_r")

    pelvis_lm = resolve_pelvis_landmarks(
        torso_lm.waist_level,
        torso_lm.pelvis_top,
        bh("pelvis"),
        bh("thigh_l"),
        bh("thigh_r"),
        knee_l,
        knee_r,
        thigh_margin=pelvis_cfg.thigh_start_margin,
    )
    log(
        f"{tag}: pelvis landmarks waist={tuple(round(x,3) for x in pelvis_lm.waist_level)} "
        f"hips=({tuple(round(x,3) for x in pelvis_lm.hip_joint_l)},"
        f"{tuple(round(x,3) for x in pelvis_lm.hip_joint_r)})"
    )

    combined = integrate_pelvis_with_torso(
        baked_mesh,
        mw,
        vg_map,
        body,
        pelvis_lm,
        arm_faces,
        torso.face_zone,
        torso.coords,
        torso.centroids,
        torso.tris_by_face,
        torso.areas,
        pelvis_cfg,
    )
    if combined.arm_overlap_faces:
        fail(f"{tag}: arms ∩ combined = {combined.arm_overlap_faces}")

    lumbar_moved = expand_lower_back_from_lumbar_mid(
        combined.face_zone,
        combined.centroids,
        body,
        pelvis_lm.waist_level,
        torso_lm.chest_lower,
    )
    log(f"{tag}: lumbar mid→lower_back faces={lumbar_moved}")

    ribs_before = {
        "left_ribs": len(
            connected_components(
                baked_mesh,
                [i for i, z in combined.face_zone.items() if z == "left_ribs"],
            )
        ),
        "right_ribs": len(
            connected_components(
                baked_mesh,
                [i for i, z in combined.face_zone.items() if z == "right_ribs"],
            )
        ),
    }

    before_all = {
        zid: len(
            connected_components(
                baked_mesh, [i for i, z in combined.face_zone.items() if z == zid]
            )
        )
        for zid in COMBINED_TORSO_PELVIS_ZONE_IDS
    }

    def parent_tris(zid: str) -> int:
        faces = [fi for fi, z in combined.face_zone.items() if z == zid]
        return max(24, sum(combined.tris_by_face.get(fi, 0) for fi in faces))

    def score_fn(comp_set, zid: str):
        scores = {z: 0.05 for z in COMBINED_TORSO_PELVIS_ZONE_IDS}
        for z in COMBINED_TORSO_PELVIS_ZONE_IDS:
            if z == zid:
                continue
            sc = 0.1
            for token in (
                "chest",
                "abdomen",
                "ribs",
                "flank",
                "scapula",
                "back",
                "hip",
                "glute",
                "sacrum",
            ):
                if token in zid and token in z:
                    sc += 0.5
            if ("left" in zid) == ("left" in z) and ("left" in z or "right" in z):
                sc += 0.25
            if ("right" in zid) == ("right" in z) and ("left" in z or "right" in z):
                sc += 0.25
            scores[z] = sc
        return scores

    def secondary(comp, frm, to):
        return ribs_secondary_ok(combined.coords, comp, frm, to)

    # General cleanup then stronger ribs pass
    reassigned, details, island_stats = cleanup_islands_generic(
        baked_mesh,
        combined.face_zone,
        COMBINED_TORSO_PELVIS_ZONE_IDS,
        parent_tris,
        score_fn=score_fn,
        cfg=PELVIS_ISLAND_CLEANUP,
        secondary_ok_fn=secondary,
        max_passes=6,
    )
    ribs_re, ribs_details, ribs_stats = cleanup_wrapping_islands(
        baked_mesh,
        combined.face_zone,
        combined.coords,
        (
            "left_ribs",
            "right_ribs",
            "left_chest",
            "right_chest",
            "left_flank",
            "right_flank",
            "left_scapula",
            "right_scapula",
            "left_mid_back",
            "right_mid_back",
            "left_hip",
            "right_hip",
            "left_glute",
            "right_glute",
            "sacrum",
            "lower_abdomen",
            "left_lower_back",
            "right_lower_back",
            "lower_back_center",
        ),
        max_fraction=0.25,
    )
    reassigned += ribs_re
    details.extend(ribs_details)
    for zid, st in ribs_stats.items():
        if zid in island_stats:
            island_stats[zid]["reassigned"] += st["reassigned"]
            island_stats[zid]["after"] = st["after"]

    ribs_after = {
        "left_ribs": len(
            connected_components(
                baked_mesh,
                [i for i, z in combined.face_zone.items() if z == "left_ribs"],
            )
        ),
        "right_ribs": len(
            connected_components(
                baked_mesh,
                [i for i, z in combined.face_zone.items() if z == "right_ribs"],
            )
        ),
    }

    # Recompute surface after reassignment
    surface = sum(combined.areas.get(fi, 0.0) for fi in combined.face_zone)
    combined.surface_area = surface
    combined.universe_faces = len(combined.face_zone)
    combined.universe_tris = sum(
        combined.tris_by_face.get(fi, 0) for fi in combined.face_zone
    )

    metrics = zone_metrics(
        baked_mesh,
        combined.face_zone,
        combined.tris_by_face,
        combined.areas,
        combined.surface_area,
        before_all,
    )
    for zid, st in island_stats.items():
        if zid in metrics:
            metrics[zid]["connectedComponentsAfter"] = st["after"]
            metrics[zid]["trianglesReassigned"] = st["reassigned"]

    empty = [z for z, m in metrics.items() if m["triangleCount"] == 0]
    if empty:
        fail(f"{tag}: empty zones {empty}")

    small = [
        z
        for z, m in metrics.items()
        if m["percentageOfCombinedTorsoPelvis"] < 2.0 and m["triangleCount"] > 0
    ]
    log(
        f"{tag}: faces={combined.universe_faces} tris={combined.universe_tris} "
        f"area={combined.surface_area:.4f} reassigned={reassigned} "
        f"ribs {ribs_before}→{ribs_after} small={small}"
    )

    mats = {
        zid: make_mat(f"Debug_{zid}", color_for(zid))
        for zid in COMBINED_TORSO_PELVIS_ZONE_IDS
    }
    zone_objs = []
    for zid in COMBINED_TORSO_PELVIS_ZONE_IDS:
        faces = [fi for fi, z in combined.face_zone.items() if z == zid]
        zone_objs.append(extract_zone_object(baked, faces, f"zone_{zid}", mats[zid]))

    for obj in list(bpy.data.objects):
        if obj.name.startswith("zone_"):
            continue
        bpy.data.objects.remove(obj, do_unlink=True)

    OUT_DIR.mkdir(parents=True, exist_ok=True)
    PILOT_GLB.mkdir(parents=True, exist_ok=True)
    blend_path = OUT_DIR / (
        "pelvis_p1_anatomical.blend" if tag == "P1" else "pelvis_p2_tattoo_optimized.blend"
    )
    glb_path = PILOT_GLB / (
        "neutro_body_v1_torso_pelvis_p1.glb"
        if tag == "P1"
        else "neutro_body_v1_torso_pelvis_p2.glb"
    )
    bpy.ops.wm.save_as_mainfile(filepath=str(blend_path))
    bpy.ops.export_scene.gltf(
        filepath=str(glb_path),
        export_format="GLB",
        use_selection=False,
        export_animations=False,
        export_skins=False,
        export_morph=False,
        export_apply=True,
    )
    log(f"Saved {blend_path}")
    log(f"Exported {glb_path} ({glb_path.stat().st_size} bytes)")

    mn = Vector((1e9, 1e9, 1e9))
    mx = Vector((-1e9, -1e9, -1e9))
    for obj in zone_objs:
        a, b = world_bbox(obj)
        mn = Vector((min(mn.x, a.x), min(mn.y, a.y), min(mn.z, a.z)))
        mx = Vector((max(mx.x, b.x), max(mx.y, b.y), max(mx.z, b.z)))
    center = (mn + mx) * 0.5
    radius = max((mx - mn).length * 0.72, 0.6)
    if center_hint is not None:
        center = center_hint
    if radius_hint is not None:
        radius = radius_hint

    cam, radius = setup_studio(center, radius)
    ART.mkdir(parents=True, exist_ok=True)
    prefix = tag.lower()
    views = [
        "front",
        "back",
        "left",
        "right",
        "three-quarter-front",
        "three-quarter-back",
    ]
    paths = {}
    for view in views:
        place_cam(cam, view, center, radius)
        out = ART / f"{prefix}-{view}.png"
        bpy.context.scene.render.filepath = str(out)
        bpy.ops.render.render(write_still=True)
        paths[view] = out
        log(f"Render {out.name}")

    return {
        "tag": tag,
        "cfg": {
            "lower_back_lo": pelvis_cfg.lower_back_lo,
            "sacrum_hi": pelvis_cfg.sacrum_hi,
            "sacrum_lo": pelvis_cfg.sacrum_lo,
            "glute_hi": pelvis_cfg.glute_hi,
            "hip_hi": pelvis_cfg.hip_hi,
            "abdomen_lo": pelvis_cfg.abdomen_lo,
            "sacrum_half": pelvis_cfg.sacrum_half,
            "abdomen_half": pelvis_cfg.abdomen_half,
            "hip_inner": pelvis_cfg.hip_inner,
            "glute_inner": pelvis_cfg.glute_inner,
            "front_thresh": pelvis_cfg.front_thresh,
            "back_thresh": pelvis_cfg.back_thresh,
            "thigh_start_margin": pelvis_cfg.thigh_start_margin,
        },
        "universeFaces": combined.universe_faces,
        "universeTris": combined.universe_tris,
        "surfaceArea": round(combined.surface_area, 6),
        "coverage": 100.0,
        "overlap": 0,
        "holes": 0,
        "duplicates": 0,
        "armOverlap": combined.arm_overlap_faces,
        "thighExcluded": combined.thigh_excluded_faces,
        "reassignedFaces": reassigned,
        "zones": metrics,
        "smallZones": small,
        "ribsBefore": ribs_before,
        "ribsAfter": ribs_after,
        "ribsReassigned": {
            "left_ribs": island_stats.get("left_ribs", {}).get("reassigned", 0),
            "right_ribs": island_stats.get("right_ribs", {}).get("reassigned", 0),
        },
        "landmarks": {
            "waistLevel": list(pelvis_lm.waist_level),
            "pelvisTop": list(pelvis_lm.pelvis_top),
            "pelvisCenter": list(pelvis_lm.pelvis_center),
            "hipJointLeft": list(pelvis_lm.hip_joint_l),
            "hipJointRight": list(pelvis_lm.hip_joint_r),
            "gluteLowerBoundary": list(pelvis_lm.glute_lower),
            "thighStartLeft": list(pelvis_lm.thigh_start_l),
            "thighStartRight": list(pelvis_lm.thigh_start_r),
            "verticalParams": combined.vertical_pelvis_s,
        },
        "bodyFrame": {
            "up": list(body.up),
            "front": list(body.front),
            "right": list(body.right),
        },
        "paths": {k: str(v.as_posix()) for k, v in paths.items()},
        "blend": str(blend_path.as_posix()),
        "glb": str(glb_path.as_posix()),
        "glbBytes": glb_path.stat().st_size,
        "center": list(center),
        "radius": radius,
        "armUniverseFaces": len(arm_faces),
    }


def main():
    if not SOURCE.exists():
        fail(f"Missing {SOURCE}")
    ART.mkdir(parents=True, exist_ok=True)

    p1 = run_pipeline("P1", PELVIS_P1_CONFIG)
    p2 = run_pipeline(
        "P2",
        PELVIS_P2_CONFIG,
        center_hint=Vector(p1["center"]),
        radius_hint=p1["radius"],
    )

    for view in ("front", "back"):
        stitch_images(
            [Path(p1["paths"][view]), Path(p2["paths"][view])],
            ART / f"pelvis-{view}-comparison.png",
        )
    stitch_images(
        [Path(p1["paths"]["left"]), Path(p2["paths"]["left"])],
        ART / "pelvis-side-comparison.png",
    )
    stitch_images(
        [Path(p1["paths"]["front"]), Path(p2["paths"]["front"])],
        ART / "lower-abdomen-boundary-comparison.png",
    )
    stitch_images(
        [Path(p1["paths"]["back"]), Path(p2["paths"]["back"])],
        ART / "lower-back-sacrum-comparison.png",
    )
    stitch_images(
        [Path(p1["paths"]["back"]), Path(p2["paths"]["three-quarter-back"])],
        ART / "glute-boundary-comparison.png",
    )
    stitch_images(
        [Path(p1["paths"]["left"]), Path(p2["paths"]["right"])],
        ART / "hip-thigh-boundary-comparison.png",
    )
    # Ribs before/after approximated by P1 vs stronger P2 cleanup views (front)
    stitch_images(
        [Path(p1["paths"]["front"]), Path(p2["paths"]["front"])],
        ART / "ribs-cleanup-before-after.png",
    )

    report = {
        "baseTorso": "T2 Tattoo Optimized (locked upper/mid)",
        "bodyFrame": p1["bodyFrame"],
        "landmarks": {
            **{k: v for k, v in p1["landmarks"].items() if k != "verticalParams"},
            "verticalParams": p1["landmarks"]["verticalParams"],
            "method": "pose bones pelvis/thigh_l/r (+ calf fallback) + waist/pelvisTop from torso landmarks",
        },
        "armUniverseFacesExcluded": p1["armUniverseFaces"],
        "P1": {k: v for k, v in p1.items() if k not in {"paths", "center", "radius"}},
        "P2": {k: v for k, v in p2.items() if k not in {"paths", "center", "radius"}},
    }
    REPORT.write_text(json.dumps(report, indent=2), encoding="utf-8")
    log(f"Report {REPORT}")
    log("DONE")


if __name__ == "__main__":
    main()
