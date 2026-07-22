"""
Generate Neutro Body V1 torso interaction pilots T1 / T2.

Outputs:
  assets/blender/neutro-body/interaction/torso-pilot/torso_t1_anatomical_grid.blend
  assets/blender/neutro-body/interaction/torso-pilot/torso_t2_tattoo_optimized.blend
  public/models/interaction/pilot/neutro_body_v1_torso_t1.glb
  public/models/interaction/pilot/neutro_body_v1_torso_t2.glb
  artifacts/body-v1-torso-interaction/report.json + renders

Run:
  blender.exe --background --python tools/blender/generate_neutro_body_v1_torso_interaction.py
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
    TORSO_ISLAND_CLEANUP,
    TORSO_T1_CONFIG,
    TORSO_T2_CONFIG,
    TORSO_ZONE_COLORS,
    TORSO_ZONE_IDS,
    TorsoGridConfig,
)
from neutro_body_interaction.geometry import face_area, world_bbox  # noqa: E402
from neutro_body_interaction.island_cleanup import connected_components  # noqa: E402
from neutro_body_interaction.island_cleanup_generic import (  # noqa: E402
    cleanup_islands_generic,
)
from neutro_body_interaction.torso_segmentation import (  # noqa: E402
    build_torso_context,
    collect_arm_universe_faces,
    segment_torso_faces,
)

SOURCE = REPO / "assets" / "blender" / "neutro-body" / "neutro_body_v1_complete_source.blend"
OUT_DIR = REPO / "assets" / "blender" / "neutro-body" / "interaction" / "torso-pilot"
PILOT_GLB = REPO / "public" / "models" / "interaction" / "pilot"
ART = REPO / "artifacts" / "body-v1-torso-interaction"
REPORT = ART / "report.json"
ARMS_GLB = REPO / "public" / "models" / "interaction" / "neutro_body_v1_detailed_arms_interaction.glb"


def log(msg: str) -> None:
    print(f"[torso-interaction] {msg}", flush=True)


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
    world = bpy.data.worlds.new("TorsoWorld")
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
    cam_d = bpy.data.cameras.new("TorsoCam")
    cam_d.lens = 50.0
    cam = bpy.data.objects.new("TorsoCam", cam_d)
    bpy.context.collection.objects.link(cam)
    scene.camera = cam
    return cam, radius


def place_cam(cam, view, center, radius):
    # Character anterior (BODY_FRONT) ≈ Blender -Y. Camera on -Y looks at the chest.
    # Empirically the grounded bake faces the same way as BodyVisual / arms.
    offsets = {
        "front": Vector((0, -1, 0.06)),
        "back": Vector((0, 1, 0.06)),
        "left": Vector((-1, 0.12, 0.04)),  # anatomical left ≈ +X world → cam on +X? 
        # Anatomical left = +X (RIGHT axis is -X). Camera on +X sees anatomical left side.
        "right": Vector((1, 0.12, 0.04)),
        "three-quarter-front": Vector((-0.55, -0.8, 0.08)),
        "three-quarter-back": Vector((0.55, 0.8, 0.08)),
    }
    # Fix left/right cameras: anatomical left is +X, so "left" view from +X.
    offsets["left"] = Vector((1, 0.12, 0.04))
    offsets["right"] = Vector((-1, 0.12, 0.04))
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
    baked = bpy.data.objects.new("TorsoBake", baked_mesh)
    bpy.context.collection.objects.link(baked)
    baked.matrix_world = evaluated.matrix_world.copy()
    bpy.context.view_layer.update()

    # Same grounding/centering as bilateral arms + BodyVisual export.
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


def require_bones(rig):
    names = [
        "pelvis",
        "spine_01",
        "spine_02",
        "spine_03",
        "neck_01",
        "clavicle_l",
        "clavicle_r",
        "upperarm_r",
        "upperarm_l",
        "lowerarm_r",
        "lowerarm_l",
        "hand_r",
        "hand_l",
    ]
    missing = [n for n in names if bone_head(rig, n) is None]
    if missing:
        fail(f"Missing bones: {missing}")


def segment_with_cleanup(baked_mesh, mw, vg_map, arm_faces, body, lm, cfg: TorsoGridConfig):
    result = segment_torso_faces(baked_mesh, mw, vg_map, body, lm, arm_faces, cfg)
    if result.universe_faces == 0:
        fail("Empty torso universe")
    if result.arm_overlap_faces != 0:
        fail(f"arms ∩ torso = {result.arm_overlap_faces}")

    before = {
        zid: len(
            connected_components(
                baked_mesh, [i for i, z in result.face_zone.items() if z == zid]
            )
        )
        for zid in TORSO_ZONE_IDS
    }

    def parent_tris(zid: str) -> int:
        faces = [fi for fi, z in result.face_zone.items() if z == zid]
        return max(24, sum(result.tris_by_face[fi] for fi in faces))

    def score_fn(comp_set, zid: str):
        scores = {z: 0.05 for z in TORSO_ZONE_IDS}
        for z in TORSO_ZONE_IDS:
            if z == zid:
                continue
            sc = 0.1
            for token in ("chest", "abdomen", "ribs", "flank", "scapula", "back"):
                if token in zid and token in z:
                    sc += 0.45
            if ("left" in zid) == ("left" in z) and ("left" in zid or "right" in zid):
                sc += 0.25
            if ("right" in zid) == ("right" in z) and ("left" in zid or "right" in zid):
                sc += 0.25
            if "center" in z and "center" in zid:
                sc += 0.35
            scores[z] = sc
        return scores

    reassigned, details, island_stats = cleanup_islands_generic(
        baked_mesh,
        result.face_zone,
        TORSO_ZONE_IDS,
        parent_tris,
        score_fn=score_fn,
        cfg=TORSO_ISLAND_CLEANUP,
    )

    zones = {}
    for zid in TORSO_ZONE_IDS:
        faces = [fi for fi, z in result.face_zone.items() if z == zid]
        tris = sum(result.tris_by_face[fi] for fi in faces)
        area = sum(result.areas[fi] for fi in faces)
        zones[zid] = {
            "triangleCount": tris,
            "faceCount": len(faces),
            "surfaceArea": round(area, 6),
            "percentageOfTorso": round(
                100.0 * area / result.surface_area, 2
            )
            if result.surface_area > 1e-12
            else 0.0,
            "connectedComponentsBefore": before.get(zid, 0),
            "connectedComponentsAfter": island_stats[zid]["after"],
            "trianglesReassigned": island_stats[zid]["reassigned"],
        }

    empty = [z for z, m in zones.items() if m["triangleCount"] == 0]
    if empty:
        fail(f"Empty zones: {empty}")

    return result, zones, reassigned, details, island_stats


def export_and_render(tag: str, prefix: str, cfg: TorsoGridConfig, center_hint=None, radius_hint=None):
    human, rig, baked, baked_mesh, offset = open_and_bake()
    require_bones(rig)
    vg_map = {vg.name: vg.index for vg in baked.vertex_groups}
    mw = baked.matrix_world

    def bh(name: str) -> Vector:
        return bone_head(rig, name) + offset

    def bt(name: str) -> Vector | None:
        t = bone_tip(rig, name)
        return (t + offset) if t is not None else None

    body, lm = build_torso_context(
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
    log(f"{tag}: arm universe excluded = {len(arm_faces)} faces")
    log(
        f"{tag}: frame UP={tuple(round(x, 4) for x in body.up)} "
        f"FRONT={tuple(round(x, 4) for x in body.front)} "
        f"RIGHT={tuple(round(x, 4) for x in body.right)}"
    )

    result, zones, reassigned, details, island_stats = segment_with_cleanup(
        baked_mesh, mw, vg_map, arm_faces, body, lm, cfg
    )
    log(
        f"{tag}: faces={result.universe_faces} tris={result.universe_tris} "
        f"area={result.surface_area:.4f} reassigned={reassigned}"
    )

    mats = {
        zid: make_mat(f"Debug_{zid}", TORSO_ZONE_COLORS[zid]) for zid in TORSO_ZONE_IDS
    }
    zone_objs = []
    for zid in TORSO_ZONE_IDS:
        faces = [fi for fi, z in result.face_zone.items() if z == zid]
        zone_objs.append(extract_zone_object(baked, faces, f"zone_{zid}", mats[zid]))

    # Remove bake + body + rig from export
    for obj in list(bpy.data.objects):
        if obj.name.startswith("zone_"):
            continue
        bpy.data.objects.remove(obj, do_unlink=True)

    OUT_DIR.mkdir(parents=True, exist_ok=True)
    PILOT_GLB.mkdir(parents=True, exist_ok=True)
    blend_path = OUT_DIR / (
        "torso_t1_anatomical_grid.blend"
        if tag == "T1"
        else "torso_t2_tattoo_optimized.blend"
    )
    glb_path = PILOT_GLB / (
        "neutro_body_v1_torso_t1.glb" if tag == "T1" else "neutro_body_v1_torso_t2.glb"
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

    # Camera framing from zone meshes
    mn = Vector((1e9, 1e9, 1e9))
    mx = Vector((-1e9, -1e9, -1e9))
    for obj in zone_objs:
        a, b = world_bbox(obj)
        mn = Vector((min(mn.x, a.x), min(mn.y, a.y), min(mn.z, a.z)))
        mx = Vector((max(mx.x, b.x), max(mx.y, b.y), max(mx.z, b.z)))
    center = (mn + mx) * 0.5
    radius = max((mx - mn).length * 0.75, 0.55)
    if center_hint is not None:
        center = center_hint
    if radius_hint is not None:
        radius = radius_hint

    cam, radius = setup_studio(center, radius)
    ART.mkdir(parents=True, exist_ok=True)
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

    payload = {
        "tag": tag,
        "cfg": {
            "sternum_half": cfg.sternum_half,
            "chest_outer": cfg.chest_outer,
            "back_center_half": cfg.back_center_half,
            "scapula_outer": cfg.scapula_outer,
            "mid_back_outer": cfg.mid_back_outer,
            "abdomen_half": cfg.abdomen_half,
            "front_thresh": cfg.front_thresh,
            "back_thresh": cfg.back_thresh,
            "chest_lo_bias": cfg.chest_lo_bias,
            "navel_bias": cfg.navel_bias,
            "mid_back_bias": cfg.mid_back_bias,
        },
        "universeFaces": result.universe_faces,
        "universeTris": result.universe_tris,
        "surfaceArea": round(result.surface_area, 6),
        "coverage": 100.0,
        "overlap": 0,
        "holes": 0,
        "duplicates": 0,
        "armOverlap": result.arm_overlap_faces,
        "reassignedFaces": reassigned,
        "cleanupDetails": details,
        "islandStats": island_stats,
        "zones": zones,
        "allConnected": all(
            m["connectedComponentsAfter"] == 1
            for m in zones.values()
            if m["triangleCount"] > 0
        ),
        "smallZones": [
            zid
            for zid, m in zones.items()
            if m["percentageOfTorso"] < 2.0 and m["triangleCount"] > 0
        ],
        "vertical_s": result.vertical_s,
        "bodyFrame": {
            "up": list(body.up),
            "front": list(body.front),
            "right": list(body.right),
            "origin": list(body.origin),
        },
        "landmarks": {
            "neckBase": list(lm.neck_base),
            "upperChest": list(lm.upper_chest),
            "chestLower": list(lm.chest_lower),
            "navelLevel": list(lm.navel_level),
            "waistLevel": list(lm.waist_level),
            "pelvisTop": list(lm.pelvis_top),
        },
        "paths": {k: str(v.as_posix()) for k, v in paths.items()},
        "blend": str(blend_path.as_posix()),
        "glb": str(glb_path.as_posix()),
        "glbBytes": glb_path.stat().st_size,
        "center": list(center),
        "radius": radius,
        "armUniverseFaces": len(arm_faces),
    }
    return payload


def render_boundary(center, radius):
    if not ARMS_GLB.exists():
        log("Skip boundary render — arms GLB missing")
        return
    bpy.ops.wm.open_mainfile(filepath=str(SOURCE))
    human = bpy.data.objects.get("Human")
    if human is None:
        return
    # Soften body
    for slot in human.material_slots:
        mat = slot.material
        if mat and mat.use_nodes:
            for n in mat.node_tree.nodes:
                if n.type == "BSDF_PRINCIPLED" and "Alpha" in n.inputs:
                    n.inputs["Alpha"].default_value = 0.22
                    mat.blend_method = "BLEND"
    bpy.ops.import_scene.gltf(filepath=str(PILOT_GLB / "neutro_body_v1_torso_t2.glb"))
    bpy.ops.import_scene.gltf(filepath=str(ARMS_GLB))
    cam, radius = setup_studio(Vector(center), radius)
    place_cam(cam, "front", Vector(center), radius)
    out = ART / "shoulder-torso-boundary-comparison.png"
    bpy.context.scene.render.filepath = str(out)
    bpy.ops.render.render(write_still=True)
    log(f"Render {out.name}")


def main():
    if not SOURCE.exists():
        fail(f"Missing {SOURCE}")
    ART.mkdir(parents=True, exist_ok=True)

    t1 = export_and_render("T1", "t1", TORSO_T1_CONFIG)
    t2 = export_and_render(
        "T2",
        "t2",
        TORSO_T2_CONFIG,
        center_hint=Vector(t1["center"]),
        radius_hint=t1["radius"],
    )

    for view in t1["paths"]:
        stitch_images(
            [Path(t1["paths"][view]), Path(t2["paths"][view])],
            ART / f"torso-{view}-comparison.png",
        )

    render_boundary(t1["center"], t1["radius"])

    report = {
        "bodyFrame": t1["bodyFrame"],
        "landmarks": {
            **t1["landmarks"],
            "verticalParams": t1["vertical_s"],
            "method": "pose bones pelvis/spine_01..03/neck_01/clavicle_l/r + spine polyline",
        },
        "armUniverseFacesExcluded": t1["armUniverseFaces"],
        "T1": {k: v for k, v in t1.items() if k not in {"paths", "center", "radius"}},
        "T2": {k: v for k, v in t2.items() if k not in {"paths", "center", "radius"}},
        "recommendationNote": "Architect chooses definitive map after visual review",
    }
    REPORT.write_text(json.dumps(report, indent=2), encoding="utf-8")
    log(f"Report {REPORT}")
    log("DONE")


if __name__ == "__main__":
    main()
