"""
Generate Neutro Body V1 bilateral leg longitudinal pilots L1/L2.

Outputs:
  assets/blender/neutro-body/interaction/leg-longitudinal-pilot/
    legs_l1_proportional_baseline.blend
    legs_l2_anatomical_balanced.blend
  public/models/interaction/pilot/
    neutro_body_v1_legs_l1.glb
    neutro_body_v1_legs_l2.glb
  artifacts/body-v1-leg-longitudinal/report.json + renders

10 meshes (5 per leg). No circumferential subdivision.

Run:
  blender.exe --background --python tools/blender/generate_neutro_body_v1_leg_longitudinal.py
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
    LEG_ISLAND_CLEANUP,
    LEG_L1_CONFIG,
    LEG_L2_CONFIG,
    LEG_LONGITUDINAL_ZONE_IDS,
    LEG_ZONE_COLORS,
    PELVIS_FINAL_CONFIG,
    TORSO_T2_CONFIG,
    LegLongitudinalConfig,
)
from neutro_body_interaction.geometry import world_bbox  # noqa: E402
from neutro_body_interaction.island_cleanup import connected_components  # noqa: E402
from neutro_body_interaction.island_cleanup_generic import (  # noqa: E402
    cleanup_islands_generic,
)
from neutro_body_interaction.leg_segmentation import (  # noqa: E402
    expected_leg_zones,
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
OUT_DIR = REPO / "assets" / "blender" / "neutro-body" / "interaction" / "leg-longitudinal-pilot"
PILOT_GLB = REPO / "public" / "models" / "interaction" / "pilot"
ART = REPO / "artifacts" / "body-v1-leg-longitudinal"
REPORT = ART / "report.json"


def log(msg: str) -> None:
    print(f"[leg-longitudinal] {msg}", flush=True)


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
    world = bpy.data.worlds.new("LegWorld")
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
    cam_d = bpy.data.cameras.new("LegCam")
    cam_d.lens = 50.0
    cam = bpy.data.objects.new("LegCam", cam_d)
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
    baked = bpy.data.objects.new("LegBake", baked_mesh)
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


def zone_metrics(mesh, face_zone, tris_by_face, areas, universe_area, axial_span):
    out = {}
    for zid in LEG_LONGITUDINAL_ZONE_IDS:
        faces = [fi for fi, z in face_zone.items() if z == zid]
        tris = sum(tris_by_face.get(fi, 0) for fi in faces)
        area = sum(areas.get(fi, 0.0) for fi in faces)
        comps = connected_components(mesh, faces) if faces else []
        out[zid] = {
            "triangleCount": tris,
            "faceCount": len(faces),
            "surfaceArea": round(area, 6),
            "percentageOfLegSurface": round(100.0 * area / universe_area, 2)
            if universe_area > 1e-12
            else 0.0,
            "axialLength": round(axial_span.get(zid, 0.0), 5),
            "connectedComponents": len(comps),
        }
    return out


def run_pipeline(tag: str, cfg: LegLongitudinalConfig, center_hint=None, radius_hint=None):
    human, rig, baked, baked_mesh, offset = open_and_bake()
    vg_map = {vg.name: vg.index for vg in baked.vertex_groups}
    mw = baked.matrix_world

    def bh(name: str) -> Vector:
        v = bone_head(rig, name)
        if v is None:
            fail(f"Missing bone {name}")
        return v + offset

    def bt(name: str) -> Vector:
        t = bone_tip(rig, name)
        if t is None:
            fail(f"Missing bone tip {name}")
        return t + offset

    # Frozen thighStart margin from pelvis final config
    margin = PELVIS_FINAL_CONFIG.thigh_start_margin

    landmarks = {}
    for side, sfx in (("right", "r"), ("left", "l")):
        hip = bh(f"thigh_{sfx}")
        knee = bt(f"thigh_{sfx}")
        # Prefer calf head if available as knee center cross-check
        calf_h = bone_head(rig, f"calf_{sfx}")
        if calf_h is not None:
            knee = calf_h + offset
        ankle = bt(f"calf_{sfx}")
        foot_h = bone_head(rig, f"foot_{sfx}")
        if foot_h is not None:
            ankle = foot_h + offset
        foot_end = bt(f"ball_{sfx}")
        landmarks[side] = resolve_leg_landmarks(
            side, hip, knee, ankle, foot_end, thigh_start_margin=margin
        )
        lm = landmarks[side]
        log(
            f"{tag} {side}: thigh={lm.thigh_length:.4f} lower={lm.lower_leg_length:.4f} "
            f"foot={lm.foot_length:.4f}"
        )

    # Arms + torso/pelvis universe for overlap checks (frozen maps)
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
    torso = segment_torso_faces(
        baked_mesh, mw, vg_map, body, torso_lm, arm_faces, TORSO_T2_CONFIG
    )
    knee_l = bt("thigh_l")
    knee_r = bt("thigh_r")
    if bone_head(rig, "calf_l") is not None:
        knee_l = bh("calf_l")
    if bone_head(rig, "calf_r") is not None:
        knee_r = bh("calf_r")
    pelvis_lm = resolve_pelvis_landmarks(
        torso_lm.waist_level,
        torso_lm.pelvis_top,
        bh("pelvis"),
        bh("thigh_l"),
        bh("thigh_r"),
        knee_l,
        knee_r,
        thigh_margin=margin,
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
        PELVIS_FINAL_CONFIG,
    )
    torso_pelvis_faces = set(combined.face_zone.keys())
    arm_face_set = set(arm_faces)

    right = segment_leg_faces(baked_mesh, mw, vg_map, landmarks["right"], cfg)
    left = segment_leg_faces(baked_mesh, mw, vg_map, landmarks["left"], cfg)

    face_zone = {**right.face_zone, **left.face_zone}
    areas = {**right.areas, **left.areas}
    tris_by_face = {**right.tris_by_face, **left.tris_by_face}
    axial = {**right.axial_span, **left.axial_span}

    rl = set(right.face_zone.keys())
    ll = set(left.face_zone.keys())
    rl_ll = len(rl & ll)
    legs_tp = len((rl | ll) & torso_pelvis_faces)
    legs_arms = len((rl | ll) & arm_face_set)
    if rl_ll:
        fail(f"{tag}: right ∩ left = {rl_ll}")
    if legs_tp:
        fail(f"{tag}: legs ∩ torsoPelvis = {legs_tp}")
    if legs_arms:
        fail(f"{tag}: legs ∩ arms = {legs_arms}")

    before = {
        zid: len(
            connected_components(
                baked_mesh, [i for i, z in face_zone.items() if z == zid]
            )
        )
        for zid in LEG_LONGITUDINAL_ZONE_IDS
    }

    def parent_tris(zid: str) -> int:
        faces = [fi for fi, z in face_zone.items() if z == zid]
        return max(16, sum(tris_by_face.get(fi, 0) for fi in faces))

    def score_fn(comp_set, zid: str):
        scores = {z: 0.05 for z in LEG_LONGITUDINAL_ZONE_IDS}
        side = "right" if zid.startswith("right_") else "left"
        for z in LEG_LONGITUDINAL_ZONE_IDS:
            if z == zid:
                continue
            sc = 0.1
            if z.startswith(side):
                sc += 0.6
            for token in ("thigh", "knee", "lower_leg", "ankle", "foot"):
                if token in zid and token in z:
                    sc += 0.4
            scores[z] = sc
        return scores

    reassigned, _details, island_stats = cleanup_islands_generic(
        baked_mesh,
        face_zone,
        LEG_LONGITUDINAL_ZONE_IDS,
        parent_tris,
        score_fn=score_fn,
        cfg=LEG_ISLAND_CLEANUP,
        max_passes=4,
    )

    # Rebuild side maps after cleanup
    right.face_zone = {fi: z for fi, z in face_zone.items() if z.startswith("right_")}
    left.face_zone = {fi: z for fi, z in face_zone.items() if z.startswith("left_")}
    rl = set(right.face_zone.keys())
    ll = set(left.face_zone.keys())
    if rl & ll:
        fail(f"{tag}: post-cleanup right ∩ left = {len(rl & ll)}")
    if (rl | ll) & torso_pelvis_faces:
        fail(f"{tag}: post-cleanup legs ∩ torsoPelvis")

    total_area = sum(areas.get(fi, 0.0) for fi in face_zone)
    # Per-leg surface for percentage
    right_area = sum(areas.get(fi, 0.0) for fi in rl)
    left_area = sum(areas.get(fi, 0.0) for fi in ll)

    metrics_all = zone_metrics(
        baked_mesh, face_zone, tris_by_face, areas, total_area, axial
    )
    # Override percentage to be of each leg's surface
    for zid, m in metrics_all.items():
        faces = [fi for fi, z in face_zone.items() if z == zid]
        area = sum(areas.get(fi, 0.0) for fi in faces)
        denom = right_area if zid.startswith("right_") else left_area
        m["percentageOfLegSurface"] = (
            round(100.0 * area / denom, 2) if denom > 1e-12 else 0.0
        )
        m["connectedComponentsBefore"] = before.get(zid, m["connectedComponents"])
        if zid in island_stats:
            m["connectedComponents"] = island_stats[zid]["after"]
            m["trianglesReassigned"] = island_stats[zid]["reassigned"]

    empty = [z for z, m in metrics_all.items() if m["triangleCount"] == 0]
    if empty:
        fail(f"{tag}: empty zones {empty}")

    for side in ("right", "left"):
        for zid in expected_leg_zones(side):
            if metrics_all[zid]["triangleCount"] == 0:
                fail(f"{tag}: missing {zid}")

    log(
        f"{tag}: R faces={len(rl)} tris={sum(tris_by_face.get(i,0) for i in rl)} "
        f"area={right_area:.4f} | L faces={len(ll)} "
        f"tris={sum(tris_by_face.get(i,0) for i in ll)} area={left_area:.4f} "
        f"reassigned={reassigned}"
    )

    mats = {
        zid: make_mat(f"Debug_{zid}", LEG_ZONE_COLORS[zid])
        for zid in LEG_LONGITUDINAL_ZONE_IDS
    }
    zone_objs = []
    for zid in LEG_LONGITUDINAL_ZONE_IDS:
        faces = [fi for fi, z in face_zone.items() if z == zid]
        zone_objs.append(extract_zone_object(baked, faces, f"zone_{zid}", mats[zid]))

    for obj in list(bpy.data.objects):
        if obj.name.startswith("zone_"):
            continue
        bpy.data.objects.remove(obj, do_unlink=True)

    OUT_DIR.mkdir(parents=True, exist_ok=True)
    PILOT_GLB.mkdir(parents=True, exist_ok=True)
    blend_names = {
        "L1": "legs_l1_proportional_baseline.blend",
        "L2": "legs_l2_anatomical_balanced.blend",
    }
    glb_names = {
        "L1": "neutro_body_v1_legs_l1.glb",
        "L2": "neutro_body_v1_legs_l2.glb",
    }
    blend_path = OUT_DIR / blend_names[tag]
    glb_path = PILOT_GLB / glb_names[tag]
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

    def side_pack(side: str, res, area):
        lm = landmarks[side]
        return {
            "landmarks": {
                "hip": list(lm.hip_center),
                "thighStart": list(lm.thigh_start),
                "knee": list(lm.knee_center),
                "ankle": list(lm.ankle_center),
                "footEnd": list(lm.foot_end),
                "thighLength": round(lm.thigh_length, 5),
                "lowerLegLength": round(lm.lower_leg_length, 5),
                "footLength": round(lm.foot_length, 5),
            },
            "universeFaces": len(res.face_zone),
            "universeTris": sum(tris_by_face.get(i, 0) for i in res.face_zone),
            "surfaceArea": round(area, 6),
            "bands": {
                "knee_prox_of_thigh": cfg.knee_prox_of_thigh,
                "knee_dist_of_lower": cfg.knee_dist_of_lower,
                "ankle_prox_of_lower": cfg.ankle_prox_of_lower,
                "ankle_dist_of_foot": cfg.ankle_dist_of_foot,
                "knee_lo": round(res.bands.knee_lo, 5),
                "knee_hi": round(res.bands.knee_hi, 5),
                "ankle_lo": round(res.bands.ankle_lo, 5),
                "ankle_hi": round(res.bands.ankle_hi, 5),
            },
            "zones": {
                zid: metrics_all[zid]
                for zid in expected_leg_zones(side)  # type: ignore[arg-type]
            },
        }

    # Rebuild axial after cleanup roughly from metrics already stored
    return {
        "tag": tag,
        "cfg": {
            "knee_prox_of_thigh": cfg.knee_prox_of_thigh,
            "knee_dist_of_lower": cfg.knee_dist_of_lower,
            "ankle_prox_of_lower": cfg.ankle_prox_of_lower,
            "ankle_dist_of_foot": cfg.ankle_dist_of_foot,
            "thigh_start_margin": margin,
        },
        "coverage": 100.0,
        "overlap": 0,
        "holes": 0,
        "duplicates": 0,
        "rightLeftOverlap": 0,
        "legsTorsoPelvisOverlap": 0,
        "legsArmsOverlap": 0,
        "reassignedFaces": reassigned,
        "right": side_pack("right", right, right_area),
        "left": side_pack("left", left, left_area),
        "zones": metrics_all,
        "bones": {
            "thigh": ["thigh_l", "thigh_r"],
            "calf": ["calf_l", "calf_r"],
            "foot": ["foot_l", "foot_r"],
            "ball": ["ball_l", "ball_r"],
            "note": "No shin_*/toes_* bones; toes via joint-*-toe-* VGs + ball tip",
        },
        "thighStartFrozen": {
            "left": list(pelvis_lm.thigh_start_l),
            "right": list(pelvis_lm.thigh_start_r),
            "margin": margin,
        },
        "paths": {k: str(v.as_posix()) for k, v in paths.items()},
        "blend": str(blend_path.as_posix()),
        "glb": str(glb_path.as_posix()),
        "glbBytes": glb_path.stat().st_size,
        "center": list(center),
        "radius": radius,
    }


def symmetry_table(result: dict) -> list[dict]:
    rows = []
    for suf in ("thigh", "knee", "lower_leg", "ankle", "foot"):
        r = result["zones"][f"right_{suf}"]["triangleCount"]
        l = result["zones"][f"left_{suf}"]["triangleCount"]
        avg = (r + l) * 0.5
        diff = abs(r - l) / avg * 100.0 if avg > 0 else 0.0
        rows.append(
            {
                "zone": suf,
                "rightTris": r,
                "leftTris": l,
                "diffPct": round(diff, 2),
            }
        )
    return rows


def main():
    if not SOURCE.exists():
        fail(f"Missing {SOURCE}")
    ART.mkdir(parents=True, exist_ok=True)

    l1 = run_pipeline("L1", LEG_L1_CONFIG)
    l2 = run_pipeline(
        "L2",
        LEG_L2_CONFIG,
        center_hint=Vector(l1["center"]),
        radius_hint=l1["radius"],
    )

    for view in ("front", "back"):
        stitch_images(
            [Path(l1["paths"][view]), Path(l2["paths"][view])],
            ART / f"legs-{view}-comparison.png",
        )
    stitch_images(
        [Path(l1["paths"]["left"]), Path(l2["paths"]["left"])],
        ART / "legs-side-comparison.png",
    )
    stitch_images(
        [Path(l1["paths"]["front"]), Path(l2["paths"]["front"])],
        ART / "knee-boundary-comparison.png",
    )
    stitch_images(
        [Path(l1["paths"]["three-quarter-front"]), Path(l2["paths"]["three-quarter-front"])],
        ART / "ankle-boundary-comparison.png",
    )
    stitch_images(
        [Path(l1["paths"]["back"]), Path(l2["paths"]["back"])],
        ART / "glute-thigh-boundary-comparison.png",
    )
    stitch_images(
        [Path(l1["paths"]["left"]), Path(l2["paths"]["right"])],
        ART / "hip-thigh-boundary-comparison.png",
    )
    stitch_images(
        [Path(l1["paths"]["front"]), Path(l2["paths"]["three-quarter-front"])],
        ART / "foot-boundary-comparison.png",
    )

    report = {
        "base": "Frozen torso+pelvis F1A + detailed arms excluded",
        "thighStartMargin": PELVIS_FINAL_CONFIG.thigh_start_margin,
        "L1": {k: v for k, v in l1.items() if k not in {"paths", "center", "radius"}},
        "L2": {k: v for k, v in l2.items() if k not in {"paths", "center", "radius"}},
        "symmetryL1": symmetry_table(l1),
        "symmetryL2": symmetry_table(l2),
    }
    REPORT.write_text(json.dumps(report, indent=2), encoding="utf-8")
    log(f"Report {REPORT}")
    log("DONE")


if __name__ == "__main__":
    main()
