/**
 * Metadatos intrínsecos de las ilustraciones corporales del cotizador.
 * Los hotspots se posicionan en % relativos a este aspect (sin letterbox).
 */
export const BODY_IMAGE_INTRINSICS = {
  "/body/body-map-front.png": { width: 687, height: 1024 },
  "/body/body-map-back.png": { width: 687, height: 1024 },
  "/body/arm-outer-detail.png": { width: 768, height: 1024 },
  "/body/arm-inner-detail.png": { width: 472, height: 1024 },
  "/body/back-detail.png": { width: 681, height: 1024 },
  "/body/leg-anterior-detail.png": { width: 682, height: 1024 },
  "/body/leg-posterior-detail.png": { width: 682, height: 1024 },
  "/body/head-top-profile.png": { width: 768, height: 1024 },
  "/body/head-right-profile.png": { width: 768, height: 1024 },
  "/body/head-left-profile.png": { width: 768, height: 1024 },
  "/body/head-back-profile.png": { width: 768, height: 1024 },
} as const;

export type BodyImageSrc = keyof typeof BODY_IMAGE_INTRINSICS;

export function getBodyImageIntrinsic(src: string): { width: number; height: number } {
  if (src in BODY_IMAGE_INTRINSICS) {
    return BODY_IMAGE_INTRINSICS[src as BodyImageSrc];
  }
  return { width: 3, height: 4 };
}

export function getBodyImageAspectRatio(src: string): string {
  const { width, height } = getBodyImageIntrinsic(src);
  return `${width} / ${height}`;
}
