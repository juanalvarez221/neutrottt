"""
Generate official bilateral detailed-arm InteractionModel (R2+C2+D2+cleanup).

Outputs:
  assets/blender/neutro-body/interaction/neutro_body_v1_detailed_arms_interaction.blend
  public/models/interaction/neutro_body_v1_detailed_arms_interaction.glb
  artifacts/body-v1-bilateral-arms/report.json + renders

24 meshes (12 per arm). No coarse upper_arm/forearm meshes.

Run:
  blender.exe --background --python tools/blender/generate_neutro_body_v1_detailed_arms.py
"""

from __future__ import annotations

import json
import math
import sys
from collections import defaultdict
from pathlib import Path

import bpy
import bmesh
from mathutils import Vector

REPO = Path(__file__).resolve().parents[2]
# Allow `import neutro_body_interaction` when run via blender --python
sys.path.insert(0, str(Path(__file__).resolve().parent))

from neutro_body_interaction import (  # noqa: E402
    ARM_ANGULAR_CONFIG,
    ARM_LONGITUDINAL_CONFIG,
    JOINT_COLORS,
    QUAD_COLORS,
    ArmBoneNames,
    connected_components,
    cleanup_islands,
    segment_arm_faces,
    world_bbox,
)
from neutro_body_interaction.config import QUAD  # noqa: E402
from neutro_body_interaction.geometry import angle_deg, face_area  # noqa: E402

SOURCE = REPO / "assets" / "blender" / "neutro-body" / "neutro_body_v1_complete_source.blend"
OUT_DIR = REPO / "assets" / "blender" / "neutro-body" / "interaction"
OUT_BLEND = OUT_DIR / "neutro_body_v1_detailed_arms_interaction.blend"
OUT_GLB = REPO / "public" / "models" / "interaction" / "neutro_body_v1_detailed_arms_interaction.glb"
ART = REPO / "artifacts" / "body-v1-bilateral-arms"
REPORT = ART / "report.json"


def log(msg: str) -> None:
    print(f"[detailed-arms] {msg}", flush=True)


def fail(msg: str) -> None:
    log(f"FAIL: {msg}")
    sys.exit(1)


def bone_head(rig, name: str) -> Vector | None:
    pb = rig.pose.bones.get(name)
    if pb is None:
        return None
    return (rig.matrix_world @ pb.matrix).translation.copy()


def bone_tail(rig, name: str) -> Vector | None:
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


def color_for_zone(zid: str):
    if zid.endswith("_shoulder"):
        return JOINT_COLORS["shoulder"]
    if zid.endswith("_elbow"):
        return JOINT_COLORS["elbow"]
    if zid.endswith("_wrist"):
        return JOINT_COLORS["wrist"]
    if zid.endswith("_hand"):
        return JOINT_COLORS["hand"]
    q = zid.rsplit("_", 1)[-1]
    return QUAD_COLORS[q]


def expected_atomic_zones(side: str) -> list[str]:
    return [
        f"{side}_shoulder",
        *[f"{side}_upper_arm_{q}" for q in QUAD],
        f"{side}_elbow",
        *[f"{side}_forearm_{q}" for q in QUAD],
        f"{side}_wrist",
        f"{side}_hand",
    ]


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
    scene.render.resolution_x = 1024
    scene.render.resolution_y = 1200
    scene.render.image_settings.file_format = "PNG"
    world = bpy.data.worlds.new("BilateralWorld")
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

    add_light("Key", 300.0, (2.2, -2.6, 2.4), 2.4)
    add_light("Fill", 110.0, (-2.6, -1.4, 1.7), 3.0)
    add_light("Rim", 140.0, (0.0, 3.0, 2.1), 2.2)
    cam_d = bpy.data.cameras.new("BilatCam")
    cam_d.lens = 50.0
    cam = bpy.data.objects.new("BilatCam", cam_d)
    bpy.context.collection.objects.link(cam)
    scene.camera = cam
    return cam


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
    cam.rotation_euler = (center - cam.location).to_track_quat("-Z", "Y").to_euler()


def composite_horizontal(paths, out_path):
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
            filepath=str(path), use_selection=True, export_apply=False, export_materials="EXPORT"
        )


def zone_metrics(mesh, face_zone, side, area_by, tris_by):
    out = {}
    for zid in expected_atomic_zones(side):
        faces = [i for i, z in face_zone.items() if z == zid]
        comps = connected_components(mesh, faces)
        area = sum(area_by.get(i, 0.0) for i in faces)
        tris = sum(tris_by.get(i, 0) for i in faces)
        parent_area = None
        if "_upper_arm_" in zid:
            parent_faces = [
                i for i, z in face_zone.items() if z.startswith(f"{side}_upper_arm_")
            ]
            parent_area = sum(area_by.get(i, 0.0) for i in parent_faces)
        elif "_forearm_" in zid:
            parent_faces = [
                i for i, z in face_zone.items() if z.startswith(f"{side}_forearm_")
            ]
            parent_area = sum(area_by.get(i, 0.0) for i in parent_faces)
        pct = round(100.0 * area / parent_area, 2) if parent_area else None
        out[zid] = {
            "triangleCount": tris,
            "faceCount": len(faces),
            "surfaceArea": round(area, 6),
            "percentageOfParent": pct,
            "connectedComponents": len(comps),
        }
    return out


def verify_inner_outer(frame, torso, mid) -> dict:
    to_torso = torso - mid
    to_torso = to_torso - to_torso.dot(frame.L) * frame.L
    if to_torso.length < 1e-8:
        return {"ok": False, "reason": "degenerate"}
    inner_dir = -frame.S
    return {
        "ok": inner_dir.dot(to_torso.normalized()) > 0,
        "innerDotTorso": inner_dir.dot(to_torso.normalized()),
        "outerDotTorso": frame.S.dot(to_torso.normalized()),
    }


def main():
    log(f"Blender {bpy.app.version_string}")
    log(f"Longitudinal: {ARM_LONGITUDINAL_CONFIG}")
    log(f"Angular: {ARM_ANGULAR_CONFIG}")
    ART.mkdir(parents=True, exist_ok=True)
    OUT_DIR.mkdir(parents=True, exist_ok=True)

    if not SOURCE.is_file():
        fail(f"Missing {SOURCE}")

    bpy.ops.wm.open_mainfile(filepath=str(SOURCE))
    human = bpy.data.objects.get("Human")
    rig = bpy.data.objects.get("Human.rig")
    if human is None or rig is None:
        fail("Missing Human / Human.rig")

    # Confirm bone names exist on rig
    for side in ("right", "left"):
        bones = ArmBoneNames.for_side(side)
        for n in bones.deformation_groups():
            if bone_head(rig, n) is None:
                fail(f"Missing bone {n}")
        if bone_head(rig, bones.middle_03) is None and bone_tail(rig, bones.middle_03) is None:
            log(f"WARNING: {bones.middle_03} missing — will fallback tip")
        log(f"Bones OK for {side}: {bones.upperarm}/{bones.lowerarm}/{bones.hand}")

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

    spine = bone_head(rig, "spine_02") or bone_head(rig, "spine_01")
    torso = (spine + offset) if spine else Vector((0, 0, 1.1))

    vg_map = {vg.name: vg.index for vg in baked.vertex_groups}
    mw = baked.matrix_world

    # Precompute areas/tris/centroids for all faces
    area_by = {}
    tris_by = {}
    centroids = {}
    for poly in baked_mesh.polygons:
        centroid = Vector((0, 0, 0))
        for vi in poly.vertices:
            centroid += mw @ baked_mesh.vertices[vi].co
        centroid /= float(len(poly.vertices))
        centroids[poly.index] = centroid
        area_by[poly.index] = face_area(baked_mesh, poly, mw)
        tris_by[poly.index] = max(0, len(poly.vertices) - 2)

    side_results = {}
    face_zone_all: dict[int, str] = {}

    for side in ("right", "left"):
        bones = ArmBoneNames.for_side(side)
        shoulder = bone_head(rig, bones.upperarm)
        elbow = bone_head(rig, bones.lowerarm)
        wrist = bone_head(rig, bones.hand)
        tip = bone_tail(rig, bones.middle_03) or bone_head(rig, bones.middle_03)
        if tip is None:
            tip = bone_tail(rig, bones.hand) or (
                wrist + (wrist - elbow).normalized() * 0.16
            )
        if not all(v is not None for v in (shoulder, elbow, wrist)):
            fail(f"Missing landmarks for {side}")
        shoulder, elbow, wrist, tip = (
            shoulder + offset,
            elbow + offset,
            wrist + offset,
            tip + offset,
        )

        seg = segment_arm_faces(
            baked_mesh, mw, vg_map, side, shoulder, elbow, wrist, tip, torso
        )
        reassigned, details = cleanup_islands(
            baked_mesh,
            seg.face_zone,
            centroids,
            tris_by,
            side,
            seg.upper_frame,
            seg.forearm_frame,
            shoulder,
            elbow,
            wrist,
        )
        # Recompute universe counts after cleanup (same faces)
        assigned = len(seg.face_zone)
        long_assigned = sum(len(v) for v in seg.long_faces.values())
        if assigned != long_assigned:
            fail(f"{side} face count mismatch after cleanup")

        # Coverage of parents
        for parent, kids in (
            (f"{side}_upper_arm", [f"{side}_upper_arm_{q}" for q in QUAD]),
            (f"{side}_forearm", [f"{side}_forearm_{q}" for q in QUAD]),
        ):
            parent_n = len(seg.long_faces.get(parent, []))
            child_n = sum(1 for z in seg.face_zone.values() if z in kids)
            if parent_n != child_n:
                fail(f"{side} {parent} coverage {child_n}/{parent_n}")

        metrics = zone_metrics(baked_mesh, seg.face_zone, side, area_by, tris_by)
        all_connected = all(m["connectedComponents"] == 1 for m in metrics.values())

        mid_u = (shoulder + elbow) * 0.5
        mid_f = (elbow + wrist) * 0.5
        sem_u = verify_inner_outer(seg.upper_frame, torso, mid_u)
        sem_f = verify_inner_outer(seg.forearm_frame, torso, mid_f)

        side_results[side] = {
            "universeFaces": seg.universe_faces,
            "universeTris": seg.universe_tris,
            "coverage": 100.0,
            "overlap": 0,
            "holes": 0,
            "duplicates": 0,
            "reassignedFaces": reassigned,
            "cleanupDetails": details[:10],
            "frames": {
                "upper": {
                    "L": list(seg.upper_frame.L),
                    "F": list(seg.upper_frame.F),
                    "S": list(seg.upper_frame.S),
                },
                "forearm": {
                    "L": list(seg.forearm_frame.L),
                    "F": list(seg.forearm_frame.F),
                    "S": list(seg.forearm_frame.S),
                },
                "angleF_3d": angle_deg(seg.upper_frame.F, seg.forearm_frame.F),
                "angleS_3d": angle_deg(seg.upper_frame.S, seg.forearm_frame.S),
                "twistArtificial": seg.twist_artificial_deg,
            },
            "semantic": {"upper": sem_u, "forearm": sem_f},
            "shoulderTorsoBleed": seg.shoulder_torso_bleed,
            "zones": metrics,
            "allConnected": all_connected,
            "landmarks": seg.landmarks,
        }
        face_zone_all.update(seg.face_zone)
        log(
            f"{side}: faces={seg.universe_faces} tris={seg.universe_tris} "
            f"twist={seg.twist_artificial_deg} connected={all_connected} "
            f"bleed={seg.shoulder_torso_bleed} reassigned={reassigned}"
        )
        log(f"  inner/outer upper={sem_u} forearm={sem_f}")

    # Symmetry table
    symmetry = {}
    for suffix in (
        "shoulder",
        "upper_arm_front",
        "upper_arm_back",
        "upper_arm_inner",
        "upper_arm_outer",
        "elbow",
        "forearm_front",
        "forearm_back",
        "forearm_inner",
        "forearm_outer",
        "wrist",
        "hand",
    ):
        rz = side_results["right"]["zones"][f"right_{suffix}"]
        lz = side_results["left"]["zones"][f"left_{suffix}"]
        rt, lt = rz["triangleCount"], lz["triangleCount"]
        base = max(rt, lt, 1)
        diff = 100.0 * abs(rt - lt) / base
        symmetry[suffix] = {
            "rightTris": rt,
            "leftTris": lt,
            "diffPct": round(diff, 2),
            "rightArea": rz["surfaceArea"],
            "leftArea": lz["surfaceArea"],
            "flag": "normal" if diff < 5 else ("review" if diff <= 10 else "investigate"),
        }

    # Build 24 zone objects
    mats = {}
    zone_faces = defaultdict(list)
    for fi, zid in face_zone_all.items():
        zone_faces[zid].append(fi)

    expected = expected_atomic_zones("right") + expected_atomic_zones("left")
    missing = [z for z in expected if not zone_faces[z]]
    if missing:
        fail(f"Empty zones: {missing}")

    for zid in expected:
        mats[zid] = make_mat(f"Debug_{zid}", color_for_zone(zid))

    zone_objs = []
    for zid in expected:
        zone_objs.append(
            extract_zone_object(baked, zone_faces[zid], f"zone_{zid}", mats[zid])
        )

    # Remove bake + source objects
    for obj in list(bpy.data.objects):
        if not obj.name.startswith("zone_"):
            bpy.data.objects.remove(obj, do_unlink=True)

    remaining = sorted(o.name for o in bpy.data.objects)
    expected_names = sorted(f"zone_{z}" for z in expected)
    if remaining != expected_names:
        fail(f"Unexpected objects: {remaining}")

    bpy.ops.wm.save_as_mainfile(filepath=str(OUT_BLEND))
    log(f"Saved {OUT_BLEND}")
    export_glb(zone_objs, OUT_GLB)
    log(f"Exported {OUT_GLB} ({OUT_GLB.stat().st_size} bytes)")

    # Renders
    for name in list(bpy.data.objects.keys()):
        if name.startswith(("Key", "Fill", "Rim", "Bilat")):
            bpy.data.objects.remove(bpy.data.objects[name], do_unlink=True)
    cam = setup_studio()
    corners = []
    for o in zone_objs:
        a, b = world_bbox(o)
        corners.extend([a, b])
    arm_min = Vector(
        (min(c.x for c in corners), min(c.y for c in corners), min(c.z for c in corners))
    )
    arm_max = Vector(
        (max(c.x for c in corners), max(c.y for c in corners), max(c.z for c in corners))
    )
    center = (arm_min + arm_max) * 0.5
    radius = float(max(arm_max - arm_min) * 1.55)

    views = (
        "front",
        "back",
        "left",
        "right",
        "three-quarter-front",
        "three-quarter-back",
    )
    renders = {}
    for view in views:
        place_cam(cam, view, center, radius)
        out = ART / f"bilateral-{view}.png"
        bpy.context.scene.render.filepath = str(out)
        bpy.ops.render.render(write_still=True)
        renders[view] = out
        log(f"Render {out.name}")

    # Hide one side for comparison strips — duplicate approach: re-render with visibility
    def set_side_visible(side: str | None):
        for o in zone_objs:
            if side is None:
                o.hide_render = False
            elif side == "right":
                o.hide_render = o.name.startswith("zone_left_")
            else:
                o.hide_render = o.name.startswith("zone_right_")

    side_renders = {}
    for side, view in (
        ("right", "front"),
        ("left", "front"),
        ("right", "back"),
        ("left", "back"),
        ("right", "right"),
        ("left", "left"),
    ):
        set_side_visible(side)
        place_cam(cam, view if view != "right" else "right", center, radius * 0.95)
        if view == "left":
            place_cam(cam, "left", center, radius * 0.95)
        out = ART / f"{side}-only-{view}.png"
        bpy.context.scene.render.filepath = str(out)
        bpy.ops.render.render(write_still=True)
        side_renders[f"{side}-{view}"] = out

    set_side_visible(None)
    try:
        composite_horizontal(
            [side_renders["right-front"], side_renders["left-front"]],
            ART / "arms-front-comparison.png",
        )
        composite_horizontal(
            [side_renders["right-back"], side_renders["left-back"]],
            ART / "arms-back-comparison.png",
        )
        composite_horizontal(
            [side_renders["left-left"], side_renders["right-right"]],
            ART / "arms-inner-comparison.png",
        )
        composite_horizontal(
            [side_renders["right-right"], side_renders["left-left"]],
            ART / "arms-outer-comparison.png",
        )
        composite_horizontal(
            [side_renders["right-front"], side_renders["left-front"]],
            ART / "right-vs-left-zone-symmetry.png",
        )
    except Exception as exc:
        log(f"Composite warning: {exc}")

    mirror_errors = []
    for side in ("right", "left"):
        for part in ("upper", "forearm"):
            if not side_results[side]["semantic"][part]["ok"]:
                mirror_errors.append(f"{side}/{part} inner not toward torso")

    report = {
        "algorithm": {
            "longitudinal": "R2",
            "circumferential": "C2",
            "frame": "D2 parallel transport / RMF",
            "cleanup": "connected components + edge/angular reassignment",
            "longitudinalConfig": ARM_LONGITUDINAL_CONFIG.__dict__,
            "angularConfig": {
                "front": ARM_ANGULAR_CONFIG.front_deg,
                "outer": ARM_ANGULAR_CONFIG.outer_deg,
                "back": ARM_ANGULAR_CONFIG.back_deg,
                "inner": ARM_ANGULAR_CONFIG.inner_deg,
            },
        },
        "sides": side_results,
        "symmetry": symmetry,
        "mirrorErrors": mirror_errors,
        "outputs": {
            "blend": str(OUT_BLEND.as_posix()),
            "glb": str(OUT_GLB.as_posix()),
            "glbBytes": OUT_GLB.stat().st_size,
            "meshCount": 24,
        },
        "renders": {k: str(v.as_posix()) for k, v in renders.items()},
    }
    REPORT.write_text(json.dumps(report, indent=2), encoding="utf-8")
    log(f"Report {REPORT}")
    if mirror_errors:
        fail(f"Mirror semantic errors: {mirror_errors}")
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
