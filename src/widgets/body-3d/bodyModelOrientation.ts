/**
 * Orientación anatómica del GLB `human_body.glb` (Tripo3D).
 *
 * Medición (accessors POSITION):
 * - Eje más largo: Y (altura ~1.00) → Y-up correcto.
 * - Eje más ancho: Z (~0.33) vs X (~0.17) → hombros sobre Z nativo.
 * - Vértice más alejado del centro en la banda craneal (top 12%):
 *   offset dominante en +X → el rostro / frente anatómica apunta a +X nativo.
 *
 * Three.js / OrbitControls por defecto observan desde +Z hacia el origen,
 * por tanto hay que rotar el modelo -90° en Y para que +X nativo mire a +Z mundo.
 */
export const MODEL_Y_UP_FRONT_OFFSET = -Math.PI / 2;

/** Distancia de cámara para presets de laboratorio (unidades del modelo centrado). */
export const LAB_CAMERA_DISTANCE = 1.85;

/** Altura relativa del target/cámara respecto al centro del modelo centrado. */
export const LAB_CAMERA_TARGET_Y = 0.05;
