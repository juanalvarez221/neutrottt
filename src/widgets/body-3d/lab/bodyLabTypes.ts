import type { BodyCameraView } from "@/widgets/body-3d/bodyViewerTypes";

export type { BodyAppearanceMode, BodyCameraView } from "@/widgets/body-3d/bodyViewerTypes";

export const CAMERA_VIEW_LABELS: Record<BodyCameraView, string> = {
  front: "Frente",
  back: "Espalda",
  left: "Izquierda",
  right: "Derecha",
};
