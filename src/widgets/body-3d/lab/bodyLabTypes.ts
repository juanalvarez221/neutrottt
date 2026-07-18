import type {
  BodyAppearanceMode,
  BodyCameraView,
} from "@/widgets/body-3d/bodyViewerTypes";

export type { BodyAppearanceMode, BodyCameraView };

export const BODY_LAB_STATS = {
  verticesLabel: "28.391 vértices",
  trianglesLabel: "50.000 triángulos",
  meshesLabel: "1 mesh",
  rigLabel: "Sin rig",
} as const;

export const CAMERA_VIEW_LABELS: Record<BodyCameraView, string> = {
  front: "Frente",
  back: "Espalda",
  left: "Izquierda",
  right: "Derecha",
};
