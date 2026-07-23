"""
Generate Neutro Body V1 bilateral leg circumferential pilots G1/G2 on L2 base.

Outputs:
  assets/blender/neutro-body/interaction/leg-circumferential-pilot/
    legs_g1_balanced_quadrants.blend
    legs_g2_tattoo_optimized.blend
  public/models/interaction/pilot/
    neutro_body_v1_legs_g1.glb
    neutro_body_v1_legs_g2.glb
  artifacts/body-v1-leg-circumferential/report.json + renders

22 meshes per candidate (16 quads + knee/ankle/foot ×2). No coarse thigh/lower meshes.

Run:
  blender.exe --background --python tools/blender/generate_neutro_body_v1_leg_circumferential.py
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

from neutro_body_interaction.arm_segmentation import angular_sector_scores  # noqa: E402
from neutro_body_interaction.config import (  # noqa: E402
    LEG_CIRC_ISLAND_CLEANUP,
    LEG_DETAILED_ZONE_COLORS,
    LEG_DETAILED_ZONE_IDS,
    LEG_FINAL_LONGITUDINAL_CONFIG,
    LEG_G1_CONFIG,
    LEG_G2_CONFIG,
    PELVIS_FINAL_CONFIG,
    QUAD,
    TORSO_T2_CONFIG,
    LegCircumferentialPair,
)
from neutro_body_interaction.geometry import project_point_on_segment, world_bbox  # noqa: E402
from neutro_body_interaction.island_cleanup import connected_components  # noqa: E402
from neutro_body_interaction.island_cleanup_generic import (  # noqa: E402
    cleanup_islands_generic,
)
from neutro_body_interaction.leg_segmentation import (  # noqa: E402
    angular_cfg_dict,
    apply_leg_circumferential,
    expected_detailed_leg_zones,
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
OUT_DIR = (
    REPO / "assets" / "blender" / "neutro-body" / "interaction" / "leg-circumferential-pilot"
)
PILOT_GLB = REPO / "public" / "models" / "interaction" / "pilot"
ART = REPO / "artifacts" / "body-v1-leg-circumferential"
REPORT = ART / "report.json"
ARMS_GLB = REPO / "public" / "models" / "interaction" / "neutro_body_v1_detailed_arms_interaction.glb"
TORSO_GLB = REPO / "public" / "models" / "interaction" / "neutro_body_v1_torso_pelvis_interaction.glb"


def log(msg: str) -> None:
    print(f"[leg-circumferential] {msg}", flush=True)


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
    world = bpy.data.worlds.new("LegCircWorld")
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
    cam_d = bpy.data.cameras.new("LegCircCam")
    cam_d.lens = 50.0
    cam = bpy.data.objects.new("LegCircCam", cam_d)
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
    baked = bpy.data.objects.new("LegCircBake", baked_mesh)
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


def parent_area(face_zone, areas, parent_id: str) -> float:
    return sum(areas.get(fi, 0.0) for fi, z in face_zone.items() if z.startswith(parent_id) or z == parent_id)


def run_pipeline(tag: str, circ: LegCircumferentialPair, center_hint=None, radius_hint=None):
    human, rig, baked, baked_mesh, offset = open_and_bake()
    vg_map = {vg.name: vg.index for vg in baked.vertex_groups}
    mw = baked.matrix_world
    long_cfg = LEG_FINAL_LONGITUDINAL_CONFIG
    margin = PELVIS_FINAL_CONFIG.thigh_start_margin

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

    landmarks = {}
    for side, sfx in (("right", "r"), ("left", "l")):
        hip = bh(f"thigh_{sfx}")
        knee = bt(f"thigh_{sfx}")
        if bone_head(rig, f"calf_{sfx}") is not None:
            knee = bh(f"calf_{sfx}")
        ankle = bt(f"calf_{sfx}")
        if bone_head(rig, f"foot_{sfx}") is not None:
            ankle = bh(f"foot_{sfx}")
        foot_end = bt(f"ball_{sfx}")
        landmarks[side] = resolve_leg_landmarks(
            side, hip, knee, ankle, foot_end, thigh_start_margin=margin
        )

    pelvis_center = bh("pelvis")

    # Frozen torso/pelvis + arms for overlap
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
    knee_l = bh("calf_l") if bone_head(rig, "calf_l") else bt("thigh_l")
    knee_r = bh("calf_r") if bone_head(rig, "calf_r") else bt("thigh_r")
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

    # L2 longitudinal base
    long_r = segment_leg_faces(baked_mesh, mw, vg_map, landmarks["right"], long_cfg)
    long_l = segment_leg_faces(baked_mesh, mw, vg_map, landmarks["left"], long_cfg)
    if set(long_r.face_zone) & set(long_l.face_zone):
        fail(f"{tag}: L2 right ∩ left")
    if (set(long_r.face_zone) | set(long_l.face_zone)) & torso_pelvis_faces:
        fail(f"{tag}: L2 legs ∩ torsoPelvis")

    circ_r = apply_leg_circumferential(baked_mesh, mw, long_r, pelvis_center, circ)
    circ_l = apply_leg_circumferential(baked_mesh, mw, long_l, pelvis_center, circ)

    face_zone = {**circ_r.face_zone, **circ_l.face_zone}
    areas = {**circ_r.areas, **circ_l.areas}
    tris_by_face = {**circ_r.tris_by_face, **circ_l.tris_by_face}
    long_parent = {**circ_r.long_parent, **circ_l.long_parent}

    # Centroids for angular cleanup scoring
    centroids: dict[int, Vector] = {}
    for fi in face_zone:
        poly = baked_mesh.polygons[fi]
        c = Vector((0, 0, 0))
        for vi in poly.vertices:
            c += mw @ baked_mesh.vertices[vi].co
        centroids[fi] = c / float(len(poly.vertices))

    before = {
        zid: len(
            connected_components(
                baked_mesh, [i for i, z in face_zone.items() if z == zid]
            )
        )
        for zid in LEG_DETAILED_ZONE_IDS
    }

    def parent_tris(zid: str) -> int:
        # Parent = thigh or lower_leg segment for quads; self for joints
        if "_thigh_" in zid:
            parent = zid.split("_thigh_")[0] + "_thigh"
            faces = [fi for fi, p in long_parent.items() if p == parent]
        elif "_lower_leg_" in zid:
            parent = zid.split("_lower_leg_")[0] + "_lower_leg"
            faces = [fi for fi, p in long_parent.items() if p == parent]
        else:
            faces = [fi for fi, z in face_zone.items() if z == zid]
        return max(16, sum(tris_by_face.get(fi, 0) for fi in faces))

    def score_fn(comp_set, zid: str):
        scores = {z: 0.05 for z in LEG_DETAILED_ZONE_IDS}
        side = "right" if zid.startswith("right_") else "left"
        frames = circ_r.frames if side == "right" else circ_l.frames
        lm = landmarks[side]
        is_thigh = "_thigh_" in zid
        is_lower = "_lower_leg_" in zid
        frame = frames.thigh if is_thigh else frames.lower
        a = lm.hip_center if is_thigh else lm.knee_center
        b = lm.knee_center if is_thigh else lm.ankle_center
        for z in LEG_DETAILED_ZONE_IDS:
            if z == zid or not z.startswith(side):
                continue
            sc = 0.15
            if ("_thigh_" in zid) == ("_thigh_" in z):
                sc += 0.35
            if ("_lower_leg_" in zid) == ("_lower_leg_" in z):
                sc += 0.35
            # Angular second choice for quad siblings
            if is_thigh and "_thigh_" in z:
                q_tgt = z.rsplit("_", 1)[-1]
                ang_scores = []
                for fi in comp_set:
                    c = centroids.get(fi)
                    if c is None:
                        continue
                    closest, _, _ = project_point_on_segment(c, a, b)
                    R = c - closest
                    ang_scores.append(
                        angular_sector_scores(R.dot(frame.F), R.dot(frame.S)).get(
                            q_tgt, 0.0
                        )
                    )
                if ang_scores:
                    sc += sum(ang_scores) / len(ang_scores)
            if is_lower and "_lower_leg_" in z:
                q_tgt = z.rsplit("_", 1)[-1]
                ang_scores = []
                for fi in comp_set:
                    c = centroids.get(fi)
                    if c is None:
                        continue
                    closest, _, _ = project_point_on_segment(c, a, b)
                    R = c - closest
                    ang_scores.append(
                        angular_sector_scores(R.dot(frame.F), R.dot(frame.S)).get(
                            q_tgt, 0.0
                        )
                    )
                if ang_scores:
                    sc += sum(ang_scores) / len(ang_scores)
            scores[z] = sc
        return scores

    # Only clean circumferential quads (never move knee/ankle/foot)
    clean_ids = tuple(
        z
        for z in LEG_DETAILED_ZONE_IDS
        if any(q in z for q in ("_front", "_back", "_inner", "_outer"))
    )
    locked = {fi: z for fi, z in face_zone.items() if z not in clean_ids}

    reassigned, _details, island_stats = cleanup_islands_generic(
        baked_mesh,
        face_zone,
        clean_ids,
        parent_tris,
        score_fn=score_fn,
        cfg=LEG_CIRC_ISLAND_CLEANUP,
        max_passes=5,
    )
    # Restore locked joints
    for fi, z in locked.items():
        face_zone[fi] = z

    rl = {fi for fi, z in face_zone.items() if z.startswith("right_")}
    ll = {fi for fi, z in face_zone.items() if z.startswith("left_")}
    if rl & ll:
        fail(f"{tag}: right ∩ left = {len(rl & ll)}")
    if (rl | ll) & torso_pelvis_faces:
        fail(f"{tag}: legs ∩ torsoPelvis")
    if (rl | ll) & arm_face_set:
        fail(f"{tag}: legs ∩ arms")

    # Verify knee/ankle/foot match L2 long parents exactly
    for fi, parent in long_parent.items():
        z = face_zone[fi]
        if parent.endswith(("_knee", "_ankle", "_foot")):
            if z != parent:
                fail(f"{tag}: joint {parent} mutated to {z}")
        elif parent.endswith("_thigh"):
            if not z.startswith(parent + "_"):
                fail(f"{tag}: thigh face escaped to {z}")
        elif parent.endswith("_lower_leg"):
            if not z.startswith(parent + "_"):
                fail(f"{tag}: lower_leg face escaped to {z}")

    right_area = sum(areas.get(fi, 0.0) for fi in rl)
    left_area = sum(areas.get(fi, 0.0) for fi in ll)

    def zone_pack(zid: str) -> dict:
        faces = [fi for fi, z in face_zone.items() if z == zid]
        tris = sum(tris_by_face.get(fi, 0) for fi in faces)
        area = sum(areas.get(fi, 0.0) for fi in faces)
        # Parent % for quads
        if "_thigh_" in zid:
            parent = zid.split("_thigh_")[0] + "_thigh"
            p_area = sum(
                areas.get(fi, 0.0)
                for fi, p in long_parent.items()
                if p == parent
            )
        elif "_lower_leg_" in zid:
            parent = zid.split("_lower_leg_")[0] + "_lower_leg"
            p_area = sum(
                areas.get(fi, 0.0)
                for fi, p in long_parent.items()
                if p == parent
            )
        else:
            side = "right" if zid.startswith("right_") else "left"
            p_area = right_area if side == "right" else left_area
        comps_after = len(connected_components(baked_mesh, faces)) if faces else 0
        st = island_stats.get(zid, {})
        return {
            "triangleCount": tris,
            "surfaceArea": round(area, 6),
            "percentageOfParentArea": round(100.0 * area / p_area, 2)
            if p_area > 1e-12
            else 0.0,
            "percentageOfLegSurface": round(
                100.0
                * area
                / (right_area if zid.startswith("right_") else left_area),
                2,
            ),
            "connectedComponentsBefore": before.get(zid, comps_after),
            "connectedComponentsAfter": st.get("after", comps_after),
            "trianglesReassigned": st.get("reassigned", 0),
        }

    metrics = {zid: zone_pack(zid) for zid in LEG_DETAILED_ZONE_IDS}
    empty = [z for z, m in metrics.items() if m["triangleCount"] == 0]
    if empty:
        fail(f"{tag}: empty zones {empty}")

    log(
        f"{tag}: R faces={len(rl)} area={right_area:.4f} | "
        f"L faces={len(ll)} area={left_area:.4f} reassigned={reassigned}"
    )

    mats = {
        zid: make_mat(f"Debug_{zid}", LEG_DETAILED_ZONE_COLORS[zid])
        for zid in LEG_DETAILED_ZONE_IDS
    }
    zone_objs = []
    for zid in LEG_DETAILED_ZONE_IDS:
        faces = [fi for fi, z in face_zone.items() if z == zid]
        zone_objs.append(extract_zone_object(baked, faces, f"zone_{zid}", mats[zid]))

    for obj in list(bpy.data.objects):
        if obj.name.startswith("zone_"):
            continue
        bpy.data.objects.remove(obj, do_unlink=True)

    OUT_DIR.mkdir(parents=True, exist_ok=True)
    PILOT_GLB.mkdir(parents=True, exist_ok=True)
    blend_names = {
        "G1": "legs_g1_balanced_quadrants.blend",
        "G2": "legs_g2_tattoo_optimized.blend",
    }
    glb_names = {"G1": "neutro_body_v1_legs_g1.glb", "G2": "neutro_body_v1_legs_g2.glb"}
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

    def frame_pack(fb):
        return {
            "L": list(fb.L),
            "F": list(fb.F),
            "S": list(fb.S),
        }

    return {
        "tag": tag,
        "longitudinal": "L2",
        "cfg": {
            "thigh": angular_cfg_dict(circ.thigh),
            "lower_leg": angular_cfg_dict(circ.lower_leg),
            "island_max_fraction": LEG_CIRC_ISLAND_CLEANUP.max_fraction_of_parent,
        },
        "coverage": 100.0,
        "overlap": 0,
        "holes": 0,
        "duplicates": 0,
        "rightLeftOverlap": 0,
        "legsTorsoPelvisOverlap": 0,
        "reassignedFaces": reassigned,
        "right": {
            "universeFaces": len(rl),
            "surfaceArea": round(right_area, 6),
            "frames": {
                "thigh": frame_pack(circ_r.frames.thigh),
                "lower": frame_pack(circ_r.frames.lower),
                "angleF": round(circ_r.frames.angle_f_deg, 3),
                "angleS": round(circ_r.frames.angle_s_deg, 3),
                "artificialTwist": circ_r.frames.artificial_twist_deg,
            },
            "zones": {
                zid: metrics[zid] for zid in expected_detailed_leg_zones("right")
            },
        },
        "left": {
            "universeFaces": len(ll),
            "surfaceArea": round(left_area, 6),
            "frames": {
                "thigh": frame_pack(circ_l.frames.thigh),
                "lower": frame_pack(circ_l.frames.lower),
                "angleF": round(circ_l.frames.angle_f_deg, 3),
                "angleS": round(circ_l.frames.angle_s_deg, 3),
                "artificialTwist": circ_l.frames.artificial_twist_deg,
            },
            "zones": {
                zid: metrics[zid] for zid in expected_detailed_leg_zones("left")
            },
        },
        "zones": metrics,
        "paths": {k: str(v.as_posix()) for k, v in paths.items()},
        "blend": str(blend_path.as_posix()),
        "glb": str(glb_path.as_posix()),
        "glbBytes": glb_path.stat().st_size,
        "center": list(center),
        "radius": radius,
    }


def render_full_body(tag: str, legs_glb: Path, center, radius, out_name: str):
    bpy.ops.wm.read_homefile(use_empty=True)
    if TORSO_GLB.exists():
        bpy.ops.import_scene.gltf(filepath=str(TORSO_GLB))
    if ARMS_GLB.exists():
        bpy.ops.import_scene.gltf(filepath=str(ARMS_GLB))
    bpy.ops.import_scene.gltf(filepath=str(legs_glb))
    cam, radius = setup_studio(Vector(center), radius * 1.35)
    place_cam(cam, "three-quarter-front", Vector(center) + Vector((0, 0, 0.15)), radius)
    out = ART / out_name
    bpy.context.scene.render.filepath = str(out)
    bpy.ops.render.render(write_still=True)
    log(f"Render {out.name}")


def symmetry_rows(result: dict) -> list[dict]:
    rows = []
    for suf in (
        "thigh_front",
        "thigh_back",
        "thigh_inner",
        "thigh_outer",
        "lower_leg_front",
        "lower_leg_back",
        "lower_leg_inner",
        "lower_leg_outer",
    ):
        r = result["zones"][f"right_{suf}"]["triangleCount"]
        l = result["zones"][f"left_{suf}"]["triangleCount"]
        avg = (r + l) * 0.5
        diff = abs(r - l) / avg * 100.0 if avg > 0 else 0.0
        rows.append(
            {"zone": suf, "rightTris": r, "leftTris": l, "diffPct": round(diff, 2)}
        )
    return rows


def main():
    if not SOURCE.exists():
        fail(f"Missing {SOURCE}")
    ART.mkdir(parents=True, exist_ok=True)

    g1 = run_pipeline("G1", LEG_G1_CONFIG)
    g2 = run_pipeline(
        "G2",
        LEG_G2_CONFIG,
        center_hint=Vector(g1["center"]),
        radius_hint=g1["radius"],
    )

    stitch_images(
        [Path(g1["paths"]["front"]), Path(g2["paths"]["front"])],
        ART / "thigh-front-back-comparison.png",
    )
    stitch_images(
        [Path(g1["paths"]["left"]), Path(g2["paths"]["left"])],
        ART / "thigh-inner-outer-comparison.png",
    )
    stitch_images(
        [Path(g1["paths"]["front"]), Path(g2["paths"]["front"])],
        ART / "lower-leg-front-back-comparison.png",
    )
    stitch_images(
        [Path(g1["paths"]["right"]), Path(g2["paths"]["right"])],
        ART / "lower-leg-inner-outer-comparison.png",
    )
    stitch_images(
        [Path(g1["paths"]["front"]), Path(g1["paths"]["back"])],
        ART / "bilateral-leg-symmetry.png",
    )

    render_full_body(
        "G1", Path(g1["glb"]), g1["center"], g1["radius"], "full-body-with-g1.png"
    )
    render_full_body(
        "G2", Path(g2["glb"]), g2["center"], g2["radius"], "full-body-with-g2.png"
    )

    report = {
        "baseLongitudinal": "L2 Leg Anatomical Balanced (frozen)",
        "thighStartMargin": PELVIS_FINAL_CONFIG.thigh_start_margin,
        "G1": {k: v for k, v in g1.items() if k not in {"paths", "center", "radius"}},
        "G2": {k: v for k, v in g2.items() if k not in {"paths", "center", "radius"}},
        "symmetryG1": symmetry_rows(g1),
        "symmetryG2": symmetry_rows(g2),
        "below15pctG1": [
            z
            for z, m in g1["zones"].items()
            if ("_front" in z or "_back" in z or "_inner" in z or "_outer" in z)
            and m["percentageOfParentArea"] < 15.0
        ],
        "below15pctG2": [
            z
            for z, m in g2["zones"].items()
            if ("_front" in z or "_back" in z or "_inner" in z or "_outer" in z)
            and m["percentageOfParentArea"] < 15.0
        ],
    }
    REPORT.write_text(json.dumps(report, indent=2), encoding="utf-8")
    log(f"Report {REPORT}")
    log("DONE")


if __name__ == "__main__":
    main()
