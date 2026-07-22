"""
Neutro Body V1 Step 17 — detail review of complete_source (Q2).

Does NOT modify anatomy targets. Only:
  - verifies macros / targets / topology / pose / rig
  - inventories helpers (MASK / vertex groups / materials)
  - measures head / neck / ears / hands / feet proportions
  - renders diagnostic close-ups + full-body views

Run:
  blender.exe --background --python tools/blender/review_neutro_body_v1_details.py
"""

from __future__ import annotations

import hashlib
import json
import math
import sys
import traceback
from pathlib import Path

import bpy
from mathutils import Vector

REPO = Path(__file__).resolve().parents[2]
SRC = REPO / "assets" / "blender" / "neutro-body" / "neutro_body_v1_complete_source.blend"
ART = REPO / "artifacts" / "body-v1-details"
OUT_JSON = ART / "review.json"

EXPECTED_TOPO = (19158, 18486, 36972)

LOCKED = {
    "muscle": 0.40,
    "weight": 0.575,
    "height": 0.575,
    "proportions": 0.50,
}

FIXED_LOCAL = {
    "measure-shoulder-dist-decr": 0.10,
    "l-upperarm-fat-incr": 0.10,
    "r-upperarm-fat-incr": 0.10,
    "l-lowerarm-fat-incr": 0.10,
    "r-lowerarm-fat-incr": 0.10,
    "torso-muscle-pectoral-decr": 0.08,
    "stomach-tone-decr": 0.08,
    "stomach-pregnant-incr": 0.04,
    "l-upperleg-fat-incr": 0.10,
    "r-upperleg-fat-incr": 0.10,
    "l-lowerleg-fat-incr": 0.08,
    "r-lowerleg-fat-incr": 0.08,
    "buttocks-volume-incr": 0.06,
    "hip-scale-depth-incr": 0.05,
}


def log(msg: str) -> None:
    print(f"[neutro-details] {msg}", flush=True)


def fail(msg: str) -> None:
    log(f"FAIL: {msg}")
    sys.exit(1)


def sha256_file(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as f:
        for chunk in iter(lambda: f.read(1024 * 1024), b""):
            h.update(chunk)
    return h.hexdigest().upper()


def depsgraph_eval(obj):
    return obj.evaluated_get(bpy.context.evaluated_depsgraph_get())


def world_bbox(obj):
    ev = depsgraph_eval(obj)
    corners = [ev.matrix_world @ Vector(c) for c in ev.bound_box]
    xs = [c.x for c in corners]
    ys = [c.y for c in corners]
    zs = [c.z for c in corners]
    return Vector((min(xs), min(ys), min(zs))), Vector((max(xs), max(ys), max(zs)))


def group_centroid(obj, name: str, wmin: float = 0.3):
    if name not in obj.vertex_groups:
        return None
    prior = []
    for m in obj.modifiers:
        if m.type == "MASK":
            prior.append((m, m.show_viewport, m.show_render))
            m.show_viewport = False
            m.show_render = False
    if prior:
        bpy.context.view_layer.update()
    try:
        ev = depsgraph_eval(obj)
        mesh = ev.to_mesh()
        try:
            use_orig = len(mesh.vertices) != len(obj.data.vertices)
            verts = obj.data.vertices if use_orig else mesh.vertices
            matrix = obj.matrix_world if use_orig else ev.matrix_world
            gidx = obj.vertex_groups[name].index
            pts = []
            for i, v in enumerate(obj.data.vertices):
                w = 0.0
                for g in v.groups:
                    if g.group == gidx:
                        w = g.weight
                        break
                if w >= wmin:
                    pts.append(matrix @ verts[i].co)
            if not pts:
                return None
            acc = Vector((0, 0, 0))
            for p in pts:
                acc += p
            return acc / len(pts)
        finally:
            ev.to_mesh_clear()
    finally:
        for m, vp, rr in prior:
            m.show_viewport = vp
            m.show_render = rr
        if prior:
            bpy.context.view_layer.update()


def posed_group_pts(obj, names: list[str], wmin: float = 0.35, step: int = 1):
    present = [n for n in names if n in obj.vertex_groups]
    if not present:
        return []
    idxs = {obj.vertex_groups[n].index for n in present}
    prior = []
    for m in obj.modifiers:
        if m.type == "MASK":
            prior.append((m, m.show_viewport, m.show_render))
            m.show_viewport = False
            m.show_render = False
    if prior:
        bpy.context.view_layer.update()
    try:
        ev = depsgraph_eval(obj)
        mesh = ev.to_mesh()
        try:
            if len(mesh.vertices) != len(obj.data.vertices):
                return []
            matrix = ev.matrix_world
            out = []
            for i, v in enumerate(obj.data.vertices):
                if step > 1 and i % step:
                    continue
                for g in v.groups:
                    if g.group in idxs and g.weight >= wmin:
                        out.append(matrix @ mesh.vertices[i].co)
                        break
            return out
        finally:
            ev.to_mesh_clear()
    finally:
        for m, vp, rr in prior:
            m.show_viewport = vp
            m.show_render = rr
        if prior:
            bpy.context.view_layer.update()


def extent(pts, axis: str):
    if len(pts) < 6:
        return "No fiable"
    vals = [getattr(p, axis) for p in pts]
    return float(max(vals) - min(vals))


def clear_diag():
    for name in list(bpy.data.objects.keys()):
        if name.startswith(("NeutroDiag", "NeutroKey", "NeutroFill", "NeutroRim")):
            bpy.data.objects.remove(bpy.data.objects[name], do_unlink=True)
    for block in (bpy.data.lights, bpy.data.cameras, bpy.data.worlds):
        for item in list(block):
            if item.name.startswith(("NeutroDiag", "NeutroKey", "NeutroFill", "NeutroRim")):
                block.remove(item)


def setup_studio(lens=50.0):
    scene = bpy.context.scene
    try:
        scene.render.engine = "BLENDER_EEVEE_NEXT"
    except TypeError:
        try:
            scene.render.engine = "BLENDER_EEVEE"
        except TypeError:
            scene.render.engine = "CYCLES"
            scene.cycles.samples = 28
    scene.render.resolution_x = 1024
    scene.render.resolution_y = 1024
    scene.render.image_settings.file_format = "PNG"
    scene.render.film_transparent = False

    world = bpy.data.worlds.new("NeutroDiagWorld")
    scene.world = world
    world.use_nodes = True
    nodes = world.node_tree.nodes
    links = world.node_tree.links
    nodes.clear()
    bg = nodes.new("ShaderNodeBackground")
    bg.inputs[0].default_value = (0.035, 0.036, 0.038, 1.0)
    out = nodes.new("ShaderNodeOutputWorld")
    links.new(bg.outputs[0], out.inputs[0])

    def add_light(name, energy, loc, size):
        d = bpy.data.lights.new(name, type="AREA")
        d.energy = energy
        d.size = size
        o = bpy.data.objects.new(name, d)
        bpy.context.collection.objects.link(o)
        o.location = loc

    add_light("NeutroKey", 250.0, (2.2, -2.5, 2.4), 2.5)
    add_light("NeutroFill", 90.0, (-2.5, -1.5, 1.8), 3.0)
    add_light("NeutroRim", 120.0, (0.0, 3.0, 2.2), 2.0)

    cam_d = bpy.data.cameras.new("NeutroDiagCamera")
    cam_d.lens = lens
    cam = bpy.data.objects.new("NeutroDiagCamera", cam_d)
    bpy.context.collection.objects.link(cam)
    scene.camera = cam
    return cam


def apply_clay(obj):
    originals = [s.material for s in obj.material_slots]
    clay = bpy.data.materials.get("NeutroDiagClay")
    if clay is None:
        clay = bpy.data.materials.new("NeutroDiagClay")
        clay.use_nodes = True
        nodes = clay.node_tree.nodes
        links = clay.node_tree.links
        nodes.clear()
        bsdf = nodes.new("ShaderNodeBsdfPrincipled")
        bsdf.inputs["Base Color"].default_value = (0.72, 0.62, 0.52, 1.0)
        bsdf.inputs["Roughness"].default_value = 0.55
        out = nodes.new("ShaderNodeOutputMaterial")
        links.new(bsdf.outputs[0], out.inputs[0])
    if not obj.material_slots:
        obj.data.materials.append(clay)
    else:
        for i in range(len(obj.material_slots)):
            obj.material_slots[i].material = clay
    return originals


def restore_mats(obj, originals):
    while len(obj.material_slots) < len(originals):
        obj.data.materials.append(None)
    for i, m in enumerate(originals):
        obj.material_slots[i].material = m


def place_camera(cam, view: str, center: Vector, radius: float):
    if view == "three-quarter":
        a = math.radians(35)
        elev = radius * 0.12
        cam.location = (
            center.x + radius * math.sin(a),
            center.y - radius * math.cos(a),
            center.z + elev,
        )
    else:
        angles = {"front": 0.0, "back": math.pi, "left": math.pi / 2, "right": -math.pi / 2}
        a = angles[view]
        cam.location = (
            center.x + radius * math.sin(a),
            center.y - radius * math.cos(a),
            center.z,
        )
    direction = center - cam.location
    cam.rotation_euler = direction.to_track_quat("-Z", "Y").to_euler()


def render_named(human, center: Vector, radius: float, out_path: Path, view: str, lens: float = 85.0):
    ART.mkdir(parents=True, exist_ok=True)
    clear_diag()
    cam = setup_studio(lens)
    originals = apply_clay(human)
    try:
        place_camera(cam, view, center, radius)
        bpy.context.scene.render.filepath = str(out_path)
        bpy.context.scene.render.resolution_x = 1024
        bpy.context.scene.render.resolution_y = 1024
        log(f"Render {out_path.name}")
        bpy.ops.render.render(write_still=True)
        if not out_path.exists():
            fail(f"Missing {out_path}")
    finally:
        restore_mats(human, originals)
        clear_diag()
    return str(out_path.as_posix())


def inspect_helpers(human):
    info = {
        "modifiers": [],
        "materials": [],
        "vertexGroupsSample": [],
        "helperLikeGroups": [],
        "bodyGroups": [],
        "evaluatedVsOriginalVerts": {},
    }
    for m in human.modifiers:
        info["modifiers"].append({
            "name": m.name,
            "type": m.type,
            "showViewport": m.show_viewport,
            "showRender": m.show_render,
            **({"vertexGroup": getattr(m, "vertex_group", None), "invert": getattr(m, "invert_vertex_group", None)} if m.type == "MASK" else {}),
        })
    for s in human.material_slots:
        info["materials"].append(s.material.name if s.material else None)

    helper_kw = ("helper", "joint-", "helper-", "joint", "genital", "penis", "tongue", "eye-", "lashes")
    body_kw = ("body", "head", "neck", "ear", "hand", "finger", "foot", "toe", "spine", "thigh", "calf", "upperarm", "lowerarm")
    for vg in human.vertex_groups:
        n = vg.name
        low = n.lower()
        if any(k in low for k in helper_kw) or n.startswith("joint-") or n.startswith("Helper"):
            info["helperLikeGroups"].append(n)
        if any(k in low for k in body_kw) and n not in info["helperLikeGroups"]:
            info["bodyGroups"].append(n)

    # Count verts with MASK on vs off
    for m in human.modifiers:
        if m.type == "MASK":
            m.show_viewport = True
    bpy.context.view_layer.update()
    ev_on = depsgraph_eval(human)
    mesh_on = ev_on.to_mesh()
    n_on = len(mesh_on.vertices)
    ev_on.to_mesh_clear()

    for m in human.modifiers:
        if m.type == "MASK":
            m.show_viewport = False
    bpy.context.view_layer.update()
    ev_off = depsgraph_eval(human)
    mesh_off = ev_off.to_mesh()
    n_off = len(mesh_off.vertices)
    ev_off.to_mesh_clear()

    # restore mask on (MPFB default for helpers is hide)
    for m in human.modifiers:
        if m.type == "MASK":
            m.show_viewport = True
            m.show_render = True
    bpy.context.view_layer.update()

    info["evaluatedVsOriginalVerts"] = {
        "original": len(human.data.vertices),
        "withMaskOn": n_on,
        "withMaskOff": n_off,
        "helpersHiddenByMask": n_off - n_on,
    }
    return info


def measure_details(human, rig):
    mn, mx = world_bbox(human)
    height = float(mx.z - mn.z)

    head_pts = posed_group_pts(human, ["head"], 0.3, step=1)
    neck_pts = posed_group_pts(human, ["neck"], 0.3, step=1)
    # ears may be named ear / ear-l etc
    ear_names = [vg.name for vg in human.vertex_groups if "ear" in vg.name.lower()]
    ear_l = posed_group_pts(human, [n for n in ear_names if n.lower().startswith("l") or ".l" in n.lower() or "-l" in n.lower() or n.lower().endswith("_l")], 0.25)
    ear_r = posed_group_pts(human, [n for n in ear_names if n.lower().startswith("r") or ".r" in n.lower() or "-r" in n.lower() or n.lower().endswith("_r")], 0.25)
    if not ear_l and not ear_r and ear_names:
        # split by x
        all_ears = posed_group_pts(human, ear_names, 0.25)
        ear_l = [p for p in all_ears if p.x > 0]
        ear_r = [p for p in all_ears if p.x < 0]

    hand_l = posed_group_pts(human, ["hand_l", "l-hand", "hand.L"], 0.3)
    if not hand_l:
        # game_engine weights may use hand_l already or finger groups
        hand_l = posed_group_pts(human, [vg.name for vg in human.vertex_groups if "hand" in vg.name.lower() and ("_l" in vg.name.lower() or ".l" in vg.name.lower() or vg.name.lower().startswith("l"))], 0.3)
    hand_r = posed_group_pts(human, [vg.name for vg in human.vertex_groups if "hand" in vg.name.lower() and ("_r" in vg.name.lower() or ".r" in vg.name.lower() or vg.name.lower().startswith("r"))], 0.3)

    foot_l = posed_group_pts(human, [vg.name for vg in human.vertex_groups if "foot" in vg.name.lower() and ("_l" in vg.name.lower() or ".l" in vg.name.lower() or vg.name.lower().startswith("l"))], 0.3)
    foot_r = posed_group_pts(human, [vg.name for vg in human.vertex_groups if "foot" in vg.name.lower() and ("_r" in vg.name.lower() or ".r" in vg.name.lower() or vg.name.lower().startswith("r"))], 0.3)

    # bone-based fallbacks for centers
    def bone_head(name):
        pb = rig.pose.bones.get(name)
        if not pb:
            return None
        return (rig.matrix_world @ pb.matrix).translation.copy()

    head_c = bone_head("head")
    neck_c = bone_head("neck_01")
    hand_lc = bone_head("hand_l")
    hand_rc = bone_head("hand_r")
    foot_lc = bone_head("foot_l")
    foot_rc = bone_head("foot_r")

    # arm angle check (Q2 ~22°)
    def arm_angle(side):
        pb = rig.pose.bones.get(f"upperarm_{side}")
        if not pb:
            return None
        m = rig.matrix_world @ pb.matrix
        d = (m.to_3x3() @ Vector((0, 1, 0))).normalized()
        return float(math.degrees(math.atan2(abs(d.x), -d.z)))

    return {
        "body": {
            "height": height,
            "width": float(mx.x - mn.x),
            "depth": float(mx.y - mn.y),
            "minZ": float(mn.z),
        },
        "poseCheck": {
            "armAngleL": arm_angle("l"),
            "armAngleR": arm_angle("r"),
            "spineUntouched": all(
                (
                    abs(rig.pose.bones[n].rotation_euler.x)
                    + abs(rig.pose.bones[n].rotation_euler.y)
                    + abs(rig.pose.bones[n].rotation_euler.z)
                )
                < 1e-5
                for n in ("spine_01", "spine_02", "spine_03", "neck_01", "head")
                if rig.pose.bones.get(n) is not None
            ),
        },
        "head": {
            "width": extent(head_pts, "x"),
            "depth": extent(head_pts, "y"),
            "height": extent(head_pts, "z"),
            "center": [float(v) for v in head_c] if head_c else None,
            "vertexGroupsAvailable": [vg.name for vg in human.vertex_groups if "head" in vg.name.lower()][:20],
            "headToBodyHeightRatio": (
                float(extent(head_pts, "z") / height)
                if isinstance(extent(head_pts, "z"), float) and height
                else "No fiable"
            ),
        },
        "neck": {
            "width": extent(neck_pts, "x"),
            "depth": extent(neck_pts, "y"),
            "height": extent(neck_pts, "z"),
            "center": [float(v) for v in neck_c] if neck_c else None,
            "vertexGroupsAvailable": [vg.name for vg in human.vertex_groups if "neck" in vg.name.lower()],
        },
        "ears": {
            "groupNames": ear_names,
            "leftWidth": extent(ear_l, "x"),
            "leftHeight": extent(ear_l, "z"),
            "rightWidth": extent(ear_r, "x"),
            "rightHeight": extent(ear_r, "z"),
            "leftCount": len(ear_l),
            "rightCount": len(ear_r),
            "symmetryDeltaHeight": (
                abs(extent(ear_l, "z") - extent(ear_r, "z"))
                if isinstance(extent(ear_l, "z"), float) and isinstance(extent(ear_r, "z"), float)
                else "No fiable"
            ),
        },
        "hands": {
            "leftWidth": extent(hand_l, "x"),
            "leftLengthApprox": extent(hand_l, "y") if extent(hand_l, "y") != "No fiable" else extent(hand_l, "z"),
            "rightWidth": extent(hand_r, "x"),
            "rightLengthApprox": extent(hand_r, "y") if extent(hand_r, "y") != "No fiable" else extent(hand_r, "z"),
            "leftCount": len(hand_l),
            "rightCount": len(hand_r),
            "leftCenter": [float(v) for v in hand_lc] if hand_lc else None,
            "rightCenter": [float(v) for v in hand_rc] if hand_rc else None,
        },
        "feet": {
            "leftLength": extent(foot_l, "y"),
            "leftWidth": extent(foot_l, "x"),
            "rightLength": extent(foot_r, "y"),
            "rightWidth": extent(foot_r, "x"),
            "leftCount": len(foot_l),
            "rightCount": len(foot_r),
            "leftCenter": [float(v) for v in foot_lc] if foot_lc else None,
            "rightCenter": [float(v) for v in foot_rc] if foot_rc else None,
        },
    }


def main():
    log(f"Blender {bpy.app.version_string}")
    if not SRC.is_file():
        fail(f"Missing {SRC}")

    sha = sha256_file(SRC)
    bpy.ops.wm.open_mainfile(filepath=str(SRC))
    log(f"Opened {SRC.name}")

    from bl_ext.blender_org.mpfb.entities.objectproperties import HumanObjectProperties

    human = bpy.data.objects.get("Human")
    rig = bpy.data.objects.get("Human.rig")
    if human is None or rig is None:
        fail("Missing Human or Human.rig")

    macros = {m: float(HumanObjectProperties.get_value(m, entity_reference=human)) for m in LOCKED}
    for k, expected in LOCKED.items():
        if abs(macros[k] - expected) > 1e-3:
            fail(f"Macro lock broken: {k}={macros[k]}")

    sk = human.data.shape_keys
    targets = []
    if sk:
        for kb in sk.key_blocks:
            if kb.name != "Basis" and not kb.name.startswith("$md"):
                targets.append({"name": kb.name, "value": round(float(kb.value), 5)})
                if kb.name in FIXED_LOCAL and abs(kb.value - FIXED_LOCAL[kb.name]) > 1e-3:
                    fail(f"Fixed target changed: {kb.name}")

    mesh = human.data
    topo = {
        "vertices": len(mesh.vertices),
        "faces": len(mesh.polygons),
        "triangles": sum(max(0, len(p.vertices) - 2) for p in mesh.polygons),
    }
    if (topo["vertices"], topo["faces"], topo["triangles"]) != EXPECTED_TOPO:
        fail(f"Topology mismatch: {topo}")

    helpers = inspect_helpers(human)
    measures = measure_details(human, rig)

    # --- Renders ---
    mn, mx = world_bbox(human)
    body_center = (mn + mx) * 0.5
    body_radius = float(max(mx.z - mn.z, max(mx.x - mn.x, mx.y - mn.y)) * 1.35)
    full_paths = {
        "front": render_named(human, body_center, body_radius, ART / "full-body-final-current-front.png", "front", 50.0),
        "back": render_named(human, body_center, body_radius, ART / "full-body-final-current-back.png", "back", 50.0),
        "three-quarter": render_named(
            human, body_center, body_radius, ART / "full-body-final-current-three-quarter.png", "three-quarter", 50.0
        ),
    }

    head_c = Vector(measures["head"]["center"]) if measures["head"]["center"] else Vector((0, 0, 1.55))
    head_h = measures["head"]["height"]
    head_radius = float(head_h) * 1.8 if isinstance(head_h, float) else 0.35
    head_paths = {
        "front": render_named(human, head_c, head_radius, ART / "head-front.png", "front", 85.0),
        "left": render_named(human, head_c, head_radius, ART / "head-left.png", "left", 85.0),
        "right": render_named(human, head_c, head_radius, ART / "head-right.png", "right", 85.0),
        "back": render_named(human, head_c, head_radius, ART / "head-back.png", "back", 85.0),
    }

    hand_paths = {}
    for side, key, prefix in (
        ("left", "leftCenter", "left-hand"),
        ("right", "rightCenter", "right-hand"),
    ):
        c = measures["hands"].get(key)
        if not c:
            continue
        center = Vector(c)
        hand_paths[side] = {
            "front": render_named(human, center, 0.22, ART / f"{prefix}-front.png", "front", 90.0),
            "back": render_named(human, center, 0.22, ART / f"{prefix}-back.png", "back", 90.0),
        }

    feet_paths = {}
    fl = measures["feet"].get("leftCenter")
    fr = measures["feet"].get("rightCenter")
    if fl and fr:
        feet_c = (Vector(fl) + Vector(fr)) * 0.5
        feet_c.z = min(fl[2], fr[2]) + 0.05
        feet_paths = {
            "front": render_named(human, feet_c, 0.45, ART / "feet-front.png", "front", 70.0),
            "three-quarter": render_named(human, feet_c, 0.45, ART / "feet-three-quarter.png", "three-quarter", 70.0),
        }

    review = {
        "source": str(SRC.as_posix()),
        "sha256": sha,
        "macros": macros,
        "targets": targets,
        "topology": topo,
        "rig": {
            "name": rig.name,
            "bones": len(rig.data.bones),
            "boneNames": sorted(b.name for b in rig.data.bones),
        },
        "helpers": helpers,
        "measurements": measures,
        "renders": {
            "fullBody": full_paths,
            "head": head_paths,
            "hands": hand_paths,
            "feet": feet_paths,
        },
        "candidatesGenerated": False,
        "decision": {
            "note": "No additional anatomy candidates generated — evaluate from renders + measurements; current Q2 complete source is the review base (H1 Current Approved).",
        },
    }

    ART.mkdir(parents=True, exist_ok=True)
    OUT_JSON.write_text(json.dumps(review, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    log(f"Wrote {OUT_JSON}")
    log("PASS — detail review complete")


if __name__ == "__main__":
    try:
        main()
    except SystemExit:
        raise
    except Exception:
        traceback.print_exc()
        fail("Unhandled exception")
