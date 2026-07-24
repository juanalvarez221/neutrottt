"""Geodesic shortest paths and enclosed surface flood-fill on a mesh."""

from __future__ import annotations

import heapq
from collections import defaultdict, deque

from mathutils import Vector


def build_vertex_adjacency(mesh) -> dict[int, list[tuple[int, float]]]:
    """Vertex → list of (neighbor, edge_length) in local mesh space."""
    adj: dict[int, list[tuple[int, float]]] = defaultdict(list)
    seen: set[tuple[int, int]] = set()
    verts = mesh.vertices
    for poly in mesh.polygons:
        vs = list(poly.vertices)
        n = len(vs)
        for i in range(n):
            a, b = vs[i], vs[(i + 1) % n]
            key = (a, b) if a < b else (b, a)
            if key in seen:
                continue
            seen.add(key)
            d = (verts[a].co - verts[b].co).length
            adj[a].append((b, d))
            adj[b].append((a, d))
    return adj


def nearest_vertex(mesh, mw, point: Vector, candidates: list[int] | None = None) -> int:
    best = -1
    best_d = 1e18
    ids = candidates if candidates is not None else range(len(mesh.vertices))
    for vi in ids:
        d = (mw @ mesh.vertices[vi].co - point).length_squared
        if d < best_d:
            best_d = d
            best = vi
    return best


def shortest_path(
    vadj: dict[int, list[tuple[int, float]]],
    start: int,
    end: int,
) -> list[int]:
    """Dijkstra vertex path. Empty if unreachable."""
    if start < 0 or end < 0:
        return []
    if start == end:
        return [start]
    dist = {start: 0.0}
    prev: dict[int, int] = {}
    heap = [(0.0, start)]
    while heap:
        d, u = heapq.heappop(heap)
        if d != dist.get(u, 1e18):
            continue
        if u == end:
            break
        for v, w in vadj.get(u, ()):
            nd = d + w
            if nd < dist.get(v, 1e18):
                dist[v] = nd
                prev[v] = u
                heapq.heappush(heap, (nd, v))
    if end not in dist:
        return []
    path = [end]
    while path[-1] != start:
        path.append(prev[path[-1]])
    path.reverse()
    return path


def path_edge_set(path: list[int]) -> set[tuple[int, int]]:
    edges: set[tuple[int, int]] = set()
    for i in range(len(path) - 1):
        a, b = path[i], path[i + 1]
        edges.add((a, b) if a < b else (b, a))
    return edges


def closed_loop_edges(paths: list[list[int]]) -> set[tuple[int, int]]:
    edges: set[tuple[int, int]] = set()
    for p in paths:
        edges |= path_edge_set(p)
    return edges


def flood_fill_faces(
    mesh,
    seed_faces: set[int],
    allowed: set[int],
    blocked_edges: set[tuple[int, int]],
    face_adj: dict[int, set[int]],
) -> set[int]:
    """
    Grow faces from seeds within `allowed`, never crossing `blocked_edges`.
    Crossing = shared edge between two faces is in blocked_edges.
    """
    # Precompute face→edge list
    face_edges: dict[int, list[tuple[int, int]]] = {}
    for fi in allowed | seed_faces:
        vs = list(mesh.polygons[fi].vertices)
        n = len(vs)
        face_edges[fi] = [
            ((vs[i], vs[(i + 1) % n]) if vs[i] < vs[(i + 1) % n] else (vs[(i + 1) % n], vs[i]))
            for i in range(n)
        ]

    out: set[int] = set()
    q = deque()
    for s in seed_faces:
        if s in allowed:
            out.add(s)
            q.append(s)
    while q:
        fi = q.popleft()
        for nb in face_adj.get(fi, ()):
            if nb in out or nb not in allowed:
                continue
            # Shared edges between fi and nb
            shared = set(face_edges.get(fi, ())) & set(face_edges.get(nb, ()))
            if shared & blocked_edges:
                continue
            out.add(nb)
            q.append(nb)
    return out


def optimize_boundary_faces(
    face_set: set[int],
    face_adj: dict[int, set[int]],
    *,
    passes: int = 3,
) -> set[int]:
    """
    Remove single-face spikes / concave notches without changing interior mass.
    Majority vote on boundary faces only.
    """
    current = set(face_set)
    for _ in range(passes):
        remove: list[int] = []
        add: list[int] = []
        # Spike removal: face with ≤1 neighbor in set
        for fi in list(current):
            n_in = sum(1 for nb in face_adj.get(fi, ()) if nb in current)
            if n_in <= 1:
                remove.append(fi)
        for fi in remove:
            current.discard(fi)
        # Fill notches: exterior face with ≥3 neighbors in set
        frontier = set()
        for fi in current:
            for nb in face_adj.get(fi, ()):
                if nb not in current:
                    frontier.add(nb)
        for fi in frontier:
            n_in = sum(1 for nb in face_adj.get(fi, ()) if nb in current)
            if n_in >= 3:
                add.append(fi)
        current.update(add)
        if not remove and not add:
            break
    return current


def build_face_adjacency(mesh, face_set: set[int] | None = None) -> dict[int, set[int]]:
    edge_to_faces: dict[tuple[int, int], list[int]] = defaultdict(list)
    for poly in mesh.polygons:
        if face_set is not None and poly.index not in face_set:
            continue
        vs = list(poly.vertices)
        n = len(vs)
        for i in range(n):
            e = tuple(sorted((vs[i], vs[(i + 1) % n])))
            edge_to_faces[e].append(poly.index)
    adj: dict[int, set[int]] = defaultdict(set)
    for faces in edge_to_faces.values():
        for i in range(len(faces)):
            for j in range(i + 1, len(faces)):
                a, b = faces[i], faces[j]
                adj[a].add(b)
                adj[b].add(a)
    return adj


def mirror_vertex_map(mesh, mw, sternum_x: float, tol: float = 0.012) -> dict[int, int]:
    """Approximate left↔right topological mirror by nearest mirrored position."""
    pts = [(i, mw @ v.co) for i, v in enumerate(mesh.vertices)]
    # Bucket by (z, y) for speed
    buckets: dict[tuple[int, int], list[tuple[int, Vector]]] = defaultdict(list)
    for i, p in pts:
        key = (int(round(p.z / tol)), int(round(p.y / tol)))
        buckets[key].append((i, p))
    mapping: dict[int, int] = {}
    for i, p in pts:
        target = Vector((2.0 * sternum_x - p.x, p.y, p.z))
        key = (int(round(target.z / tol)), int(round(target.y / tol)))
        best = i
        best_d = 1e18
        for dk in ((0, 0), (1, 0), (-1, 0), (0, 1), (0, -1), (1, 1), (-1, -1), (1, -1), (-1, 1)):
            for j, q in buckets.get((key[0] + dk[0], key[1] + dk[1]), ()):
                d = (q - target).length_squared
                if d < best_d:
                    best_d = d
                    best = j
        mapping[i] = best
    return mapping


def mirror_face_set(
    mesh,
    faces: set[int],
    vmap: dict[int, int],
    face_lookup: dict[frozenset[int], int],
) -> set[int]:
    out: set[int] = set()
    for fi in faces:
        vs = frozenset(vmap[vi] for vi in mesh.polygons[fi].vertices)
        mj = face_lookup.get(vs)
        if mj is not None:
            out.add(mj)
    return out


def build_face_vert_lookup(mesh) -> dict[frozenset[int], int]:
    return {frozenset(p.vertices): p.index for p in mesh.polygons}
