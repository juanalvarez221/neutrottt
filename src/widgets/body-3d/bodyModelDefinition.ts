/**
 * Definición visual de un cuerpo 3D cargable.
 * Solo presenta cómo cargar y encuadrar un GLB — sin zonas ni interacción.
 */
export type BodyModelDefinition = {
  id: string;
  displayName: string;
  /** Ruta pública del GLB (p. ej. `/models/prototypes/...`). */
  src: string;
  /** Rol del asset en el pipeline Neutro. */
  role: "prototype" | "production";
  /**
   * Rotación Euler [x, y, z] en radianes aplicada al modelo
   * para que su frente anatómico mire a +Z mundo.
   */
  rotation: [number, number, number];
  /** Escala uniforme opcional (default 1). */
  scale?: number;
  /** Encuadre de cámara relativo al modelo ya centrado. */
  camera: {
    distance: number;
    target: [number, number, number];
    minDistance?: number;
    maxDistance?: number;
  };
  /** Etiquetas de diagnóstico opcionales (laboratorio). */
  labStats?: {
    verticesLabel: string;
    trianglesLabel: string;
    meshesLabel: string;
    rigLabel: string;
  };
};

/**
 * Prototipo Tripo — solo evaluación técnica.
 *
 * Orientación medida sobre accessors POSITION:
 * frente anatómico nativo en +X → rotación Y = -π/2 para mirar a +Z.
 */
export const TRIPO_PROTOTYPE_MODEL: BodyModelDefinition = {
  id: "tripoPrototype",
  displayName: "Prototipo Tripo",
  src: "/models/prototypes/tripo-human-prototype.glb",
  role: "prototype",
  rotation: [0, -Math.PI / 2, 0],
  scale: 1,
  camera: {
    distance: 1.85,
    target: [0, 0.05, 0],
    minDistance: 1.0,
    maxDistance: 3.8,
  },
  labStats: {
    verticesLabel: "28.391 vértices",
    trianglesLabel: "50.000 triángulos",
    meshesLabel: "1 mesh",
    rigLabel: "Sin rig",
  },
};

/** Catálogo de definiciones conocidas (extensible). */
export const BODY_MODELS_BY_ID: Record<string, BodyModelDefinition> = {
  [TRIPO_PROTOTYPE_MODEL.id]: TRIPO_PROTOTYPE_MODEL,
};

export function getBodyModel(id: string): BodyModelDefinition | undefined {
  return BODY_MODELS_BY_ID[id];
}
