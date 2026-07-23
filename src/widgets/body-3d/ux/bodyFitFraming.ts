/**
 * Framing automático a partir del bounding box del BodyVisual.
 * No hardcodea assets: solo tamaño/centro + FOV/aspecto.
 */

import { Box3, Vector3 } from "three";
import type { BodyCameraFraming } from "@/widgets/body-3d/cameraViewHelpers";

export type BodyFitOptions = {
  fovDeg: number;
  aspect: number;
  /** Fracción de la altura del viewport que debe ocupar el cuerpo (0.70–0.82). */
  verticalFill: number;
  /** Margen extra sobre la distancia mínima de encuadre. */
  padding?: number;
};

export type FittedBodyFraming = BodyCameraFraming & {
  minDistance: number;
  maxDistance: number;
};

/**
 * Calcula distancia/target para mostrar el cuerpo completo y centrado.
 * Prioriza fill vertical; también evita recorte horizontal en vistas frontales.
 */
export function computeFitFramingFromBox(
  box: Box3,
  opts: BodyFitOptions,
): FittedBodyFraming | null {
  if (box.isEmpty()) return null;

  const size = new Vector3();
  const center = new Vector3();
  box.getSize(size);
  box.getCenter(center);

  if (size.y < 1e-4) return null;

  const padding = opts.padding ?? 1.04;
  const fill = Math.min(0.82, Math.max(0.7, opts.verticalFill));
  const aspect = Math.max(0.35, opts.aspect);

  const vFov = (opts.fovDeg * Math.PI) / 180;
  const halfY = size.y * 0.5;
  let distance = halfY / (fill * Math.tan(vFov * 0.5));

  const hFov = 2 * Math.atan(Math.tan(vFov * 0.5) * aspect);
  const halfX = Math.max(size.x, size.z) * 0.5;
  const distanceForWidth = halfX / (0.7 * Math.tan(hFov * 0.5));
  distance = Math.max(distance, distanceForWidth) * padding;

  // Sesgo mínimo: centra el cuerpo sin aire grande arriba ni pegarlo abajo.
  const yBias = size.y * 0.01;

  return {
    distance,
    target: [center.x, center.y + yBias, center.z],
    minDistance: distance * 0.52,
    maxDistance: distance * 2.35,
  };
}

/** Fill vertical según ancho de viewport (desktop ≈ 75–80% útil). */
export function verticalFillForViewport(widthPx: number): number {
  if (widthPx >= 1440) return 0.8;
  if (widthPx >= 1280) return 0.79;
  if (widthPx >= 900) return 0.77;
  if (widthPx >= 768) return 0.76;
  return 0.75;
}
