/**
 * Detección ligera de WebGL (sin librerías).
 * Solo para fallback técnico — no user-agent sniffing.
 */

export function isWebGLAvailable(): boolean {
  if (typeof document === "undefined") return true;
  try {
    const canvas = document.createElement("canvas");
    const gl =
      canvas.getContext("webgl") || canvas.getContext("experimental-webgl");
    return Boolean(gl);
  } catch {
    return false;
  }
}
