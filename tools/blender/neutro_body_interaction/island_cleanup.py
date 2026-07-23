"""Connected-component island cleanup for circumferential subzones."""

from __future__ import annotations

from collections import defaultdict

from mathutils import Vector

from .anatomical_frames import AnatomicalFrame
from .arm_segmentation import angular_sector_scores
from .config import ISLAND_CLEANUP_CONFIG, IslandCleanupConfig, QUAD
from .geometry import project_point_on_segment


def build_edge_face_map(mesh, face_set: set[int] | None = None):
    edge_to_faces: dict[tuple[int, int], list[int]] = defaultdict(list)
    for poly in mesh.polygons:
        if face_set is not None and poly.index not in face_set:
            continue
        vs = list(poly.vertices)
        n = len(vs)
        for i in range(n):
            e = tuple(sorted((vs[i], vs[(i + 1) % n])))
            edge_to_faces[e].append(poly.index)
    return edge_to_faces


def connected_components(mesh, face_indices: list[int]) -> list[list[int]]:
    face_set = set(face_indices)
    if not face_set:
        return []
    edge_to_faces = build_edge_face_map(mesh, face_set)
    adj: dict[int, set[int]] = defaultdict(set)
    for faces in edge_to_faces.values():
        for i in range(len(faces)):
            for j in range(i + 1, len(faces)):
                a, b = faces[i], faces[j]
                if a in face_set and b in face_set:
                    adj[a].add(b)
                    adj[b].add(a)
    visited = set()
    comps = []
    for start in face_set:
        if start in visited:
            continue
        stack = [start]
        visited.add(start)
        comp = []
        while stack:
            u = stack.pop()
            comp.append(u)
            for v in adj[u]:
                if v not in visited:
                    visited.add(v)
                    stack.append(v)
        comps.append(comp)
    comps.sort(key=len, reverse=True)
    return comps


def cleanup_islands(
    mesh,
    face_zone: dict[int, str],
    centroids: dict[int, Vector],
    tris_by_face: dict[int, int],
    side: str,
    upper: AnatomicalFrame,
    forearm: AnatomicalFrame,
    shoulder: Vector,
    elbow: Vector,
    wrist: Vector,
    cfg: IslandCleanupConfig | None = None,
) -> tuple[int, list[dict]]:
    """
    Reassign small disconnected components using shared boundary edges +
    angular score coherence. Geometry unchanged.
    """
    cfg = cfg or ISLAND_CLEANUP_CONFIG
    prefix = f"{side}_"
    subzones = [f"{prefix}upper_arm_{q}" for q in QUAD] + [
        f"{prefix}forearm_{q}" for q in QUAD
    ]

    parent_tris = {
        f"{prefix}upper_arm": sum(
            tris_by_face[i]
            for i, z in face_zone.items()
            if z.startswith(f"{prefix}upper_arm_")
        ),
        f"{prefix}forearm": sum(
            tris_by_face[i]
            for i, z in face_zone.items()
            if z.startswith(f"{prefix}forearm_")
        ),
    }

    all_faces = set(face_zone.keys())
    edge_to_faces = build_edge_face_map(mesh, all_faces)
    reassigned = 0
    details: list[dict] = []

    def neighbor_edge_counts(comp_faces: set[int]) -> dict[str, int]:
        counts: dict[str, int] = defaultdict(int)
        for faces in edge_to_faces.values():
            if len(faces) != 2:
                continue
            a, b = faces
            if a in comp_faces and b not in comp_faces:
                counts[face_zone[b]] += 1
            elif b in comp_faces and a not in comp_faces:
                counts[face_zone[a]] += 1
        return counts

    def mean_angular(comp_faces: set[int], is_upper: bool) -> dict[str, float]:
        scores: dict[str, float] = defaultdict(float)
        n = 0
        for fi in comp_faces:
            c = centroids[fi]
            if is_upper:
                closest, _, _ = project_point_on_segment(c, shoulder, elbow)
                R = c - closest
                fs, ss = R.dot(upper.F), R.dot(upper.S)
            else:
                closest, _, _ = project_point_on_segment(c, elbow, wrist)
                R = c - closest
                fs, ss = R.dot(forearm.F), R.dot(forearm.S)
            for k, v in angular_sector_scores(fs, ss).items():
                scores[k] += v
            n += 1
        if n == 0:
            return {}
        return {k: v / n for k, v in scores.items()}

    for _pass in range(4):
        changed = 0
        for zid in subzones:
            faces = [fi for fi, z in face_zone.items() if z == zid]
            if not faces:
                continue
            is_upper = "_upper_arm_" in zid
            parent_key = f"{prefix}upper_arm" if is_upper else f"{prefix}forearm"
            threshold = max(
                cfg.min_faces, int(parent_tris[parent_key] * cfg.max_fraction_of_parent)
            )
            comps = connected_components(mesh, faces)
            if len(comps) <= 1:
                continue
            for comp in comps[1:]:
                if len(comp) >= threshold:
                    continue
                comp_set = set(comp)
                neigh = neighbor_edge_counts(comp_set)
                parent_prefix = f"{prefix}upper_arm_" if is_upper else f"{prefix}forearm_"
                cand = {
                    k: v
                    for k, v in neigh.items()
                    if k.startswith(parent_prefix) and k != zid
                }
                if not cand:
                    continue
                ang = mean_angular(comp_set, is_upper)
                top2 = {
                    k
                    for k, _ in sorted(ang.items(), key=lambda kv: kv[1], reverse=True)[
                        :2
                    ]
                }
                best = None
                best_score = -1.0
                for nz, ec in cand.items():
                    q = nz.rsplit("_", 1)[-1]
                    if q not in top2:
                        continue
                    score = ec + 2.0 + ang.get(q, 0.0)
                    if score > best_score:
                        best_score = score
                        best = nz
                if best is None:
                    continue
                for fi in comp_set:
                    face_zone[fi] = best
                    reassigned += 1
                    changed += 1
                details.append(
                    {
                        "from": zid,
                        "to": best,
                        "faces": len(comp_set),
                        "neighborEdges": dict(cand),
                        "angularTop2": list(top2),
                    }
                )
        if changed == 0:
            break

    return reassigned, details
