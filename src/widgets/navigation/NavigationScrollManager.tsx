"use client";

import { useLayoutEffect, useRef } from "react";
import { usePathname } from "next/navigation";

const SCROLL_POSITIONS_KEY = "neutrott_scroll_positions";
const VISITED_PATHS_KEY = "neutrott_visited_paths";

function readScrollPositions(): Record<string, number> {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.sessionStorage.getItem(SCROLL_POSITIONS_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object") return {};
    return parsed as Record<string, number>;
  } catch {
    return {};
  }
}

function writeScrollPosition(path: string, y: number) {
  const positions = readScrollPositions();
  positions[path] = y;
  window.sessionStorage.setItem(SCROLL_POSITIONS_KEY, JSON.stringify(positions));
}

function readVisitedPaths(): Set<string> {
  if (typeof window === "undefined") return new Set();
  try {
    const raw = window.sessionStorage.getItem(VISITED_PATHS_KEY);
    if (!raw) return new Set();
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return new Set();
    return new Set(parsed.filter((item): item is string => typeof item === "string"));
  } catch {
    return new Set();
  }
}

function markPathVisited(path: string) {
  const visited = readVisitedPaths();
  visited.add(path);
  window.sessionStorage.setItem(VISITED_PATHS_KEY, JSON.stringify([...visited]));
}

function scrollToTop() {
  window.scrollTo({ top: 0, left: 0, behavior: "auto" });
  document.documentElement.scrollTop = 0;
  document.body.scrollTop = 0;
}

export function NavigationScrollManager() {
  const pathname = usePathname();
  const activePathRef = useRef<string | null>(null);

  useLayoutEffect(() => {
    const previousPath = activePathRef.current;

    if (previousPath && previousPath !== pathname) {
      writeScrollPosition(previousPath, window.scrollY);
    }

    const isHome = pathname === "/";
    const visited = readVisitedPaths();
    const hasVisited = visited.has(pathname);

    if (isHome) {
      scrollToTop();
    } else if (hasVisited) {
      const savedY = readScrollPositions()[pathname] ?? 0;
      window.scrollTo({ top: savedY, left: 0, behavior: "auto" });
    } else {
      scrollToTop();
    }

    if (!isHome && !hasVisited) {
      markPathVisited(pathname);
    }

    activePathRef.current = pathname;

    return () => {
      if (activePathRef.current) {
        writeScrollPosition(activePathRef.current, window.scrollY);
      }
    };
  }, [pathname]);

  return null;
}
