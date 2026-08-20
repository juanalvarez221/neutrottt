/**
 * Fuente única del contrato público de selección corporal.
 * Taxonomía · metadata · cobertura · miembros atómicos.
 * No duplicar labels / coverages / preferredView en otros archivos.
 */

export type BodyCoverage = "complete" | "inner" | "outer";

/** Vistas preferidas (espejo operativo en bodyPreferredCamera). */
export type CatalogPreferredView =
  | "front"
  | "back"
  | "left"
  | "right"
  | "front-left"
  | "front-right"
  | "back-left"
  | "back-right";

export type CatalogFocusSection =
  | "full"
  | "head"
  | "upperBody"
  | "torso"
  | "arms"
  | "legs";

export type PublicRegionSide = "left" | "right" | "center" | "both";
export type PublicRegionSurface =
  | "anterior"
  | "posterior"
  | "inner"
  | "outer"
  | "lateral"
  | "full"
  | "top"
  | "mixed";
export type PublicRegionCategory =
  | "arm"
  | "torso"
  | "back"
  | "leg"
  | "head"
  | "neck"
  | "hand"
  | "foot"
  | "hip"
  | "other";

export type BodyPlacementSelection = {
  regionId: string;
  coverage?: BodyCoverage;
};

export type PublicBodyCatalogEntry = {
  id: string;
  shortLabel: string;
  description: string;
  side: PublicRegionSide;
  surface: PublicRegionSurface;
  category: PublicRegionCategory;
  supportedCoverages: readonly BodyCoverage[];
  preferredView: CatalogPreferredView;
  focusSection: CatalogFocusSection;
  /** Atómicas / targets anidados para geometría de resolución. */
  memberIds: readonly string[];
  kind: "anatomical" | "commercial";
  /** Si false, existe solo para migración / lab interno. */
  publicSelectable: boolean;
  fullLabel?: string;
};

const COMPLETE_ONLY = ["complete"] as const satisfies readonly BodyCoverage[];
const FULL_COVERAGE = [
  "complete",
  "inner",
  "outer",
] as const satisfies readonly BodyCoverage[];

function entry(
  partial: Omit<PublicBodyCatalogEntry, "publicSelectable" | "kind"> & {
    kind?: PublicBodyCatalogEntry["kind"];
    publicSelectable?: boolean;
  },
): PublicBodyCatalogEntry {
  return {
    kind: partial.kind ?? "anatomical",
    publicSelectable: partial.publicSelectable ?? true,
    ...partial,
  };
}

/**
 * Catálogo público definitivo (zonas grandes / músculos claros).
 * Microzonas (pectorales, codo, muñeca, rodilla, tobillo, etc.)
 * no aparecen aquí como publicSelectable. Costados sí son públicos.
 */
export const BODY_PUBLIC_SELECTION_CATALOG: readonly PublicBodyCatalogEntry[] = [
  // —— Torso ——
  entry({
    id: "full_chest",
    shortLabel: "Pecho completo",
    description:
      "Banda pectoral frontal completa, de axila a axila (superficie del pecho)",
    side: "both",
    surface: "anterior",
    category: "torso",
    supportedCoverages: COMPLETE_ONLY,
    preferredView: "front",
    focusSection: "torso",
    memberIds: ["left_chest", "right_chest"],
    fullLabel:
      "Pecho completo · Banda pectoral frontal de axila a axila",
  }),
  entry({
    id: "full_abdomen",
    shortLabel: "Abdomen completo",
    description:
      "Superficie frontal del abdomen bajo el pecho, hasta la zona púbica",
    side: "center",
    surface: "anterior",
    category: "torso",
    supportedCoverages: COMPLETE_ONLY,
    preferredView: "front",
    focusSection: "torso",
    memberIds: ["upper_abdomen", "lower_abdomen"],
    fullLabel:
      "Abdomen completo · Superficie frontal bajo el pecho hasta la zona púbica",
  }),
  entry({
    id: "right_ribs",
    shortLabel: "Costillas derechas",
    description: "Margen costal lateral derecho (caja torácica)",
    side: "right",
    surface: "lateral",
    category: "torso",
    supportedCoverages: COMPLETE_ONLY,
    preferredView: "front-right",
    focusSection: "torso",
    memberIds: ["right_ribs"],
    fullLabel: "Costillas derechas · Margen costal lateral derecho",
  }),
  entry({
    id: "left_ribs",
    shortLabel: "Costillas izquierdas",
    description: "Margen costal lateral izquierdo (caja torácica)",
    side: "left",
    surface: "lateral",
    category: "torso",
    supportedCoverages: COMPLETE_ONLY,
    preferredView: "front-left",
    focusSection: "torso",
    memberIds: ["left_ribs"],
    fullLabel: "Costillas izquierdas · Margen costal lateral izquierdo",
  }),
  entry({
    id: "right_flank",
    shortLabel: "Costado derecho",
    description: "Flanco lateral derecho bajo el margen costal",
    side: "right",
    surface: "lateral",
    category: "torso",
    supportedCoverages: COMPLETE_ONLY,
    preferredView: "front-right",
    focusSection: "torso",
    memberIds: ["right_flank"],
    fullLabel: "Costado derecho · Flanco lateral bajo el margen costal",
  }),
  entry({
    id: "left_flank",
    shortLabel: "Costado izquierdo",
    description: "Flanco lateral izquierdo bajo el margen costal",
    side: "left",
    surface: "lateral",
    category: "torso",
    supportedCoverages: COMPLETE_ONLY,
    preferredView: "front-left",
    focusSection: "torso",
    memberIds: ["left_flank"],
    fullLabel: "Costado izquierdo · Flanco lateral bajo el margen costal",
  }),
  entry({
    id: "upper_back",
    shortLabel: "Espalda alta y media",
    description: "Superficie superior y media de la espalda",
    side: "both",
    surface: "posterior",
    category: "back",
    supportedCoverages: COMPLETE_ONLY,
    preferredView: "back",
    focusSection: "upperBody",
    memberIds: [
      "left_scapula",
      "right_scapula",
      "upper_back_center",
      "left_mid_back",
      "right_mid_back",
      "mid_back_center",
    ],
  }),
  entry({
    id: "lower_back",
    shortLabel: "Espalda baja",
    description: "Superficie lumbar de la espalda",
    side: "both",
    surface: "posterior",
    category: "back",
    supportedCoverages: COMPLETE_ONLY,
    preferredView: "back",
    focusSection: "torso",
    memberIds: ["left_lower_back", "right_lower_back", "lower_back_center"],
  }),
  entry({
    id: "full_back",
    shortLabel: "Espalda completa",
    description: "Superficie completa de la espalda",
    side: "both",
    surface: "posterior",
    category: "back",
    supportedCoverages: COMPLETE_ONLY,
    preferredView: "back",
    focusSection: "torso",
    kind: "commercial",
    memberIds: [
      "left_scapula",
      "right_scapula",
      "upper_back_center",
      "left_mid_back",
      "right_mid_back",
      "mid_back_center",
      "left_lower_back",
      "right_lower_back",
      "lower_back_center",
    ],
  }),

  // —— Brazos (por lado) ——
  ...(["right", "left"] as const).flatMap((side) => {
    const L = side === "left" ? "izquierdo" : "derecho";
    const Lfem = side === "left" ? "izquierda" : "derecha";
    const view: CatalogPreferredView = side;
    return [
      entry({
        id: `${side}_shoulder`,
        shortLabel: `Hombro ${L}`,
        description:
          side === "left"
            ? "Superficie completa del hombro izquierdo"
            : "Superficie completa del hombro derecho",
        side,
        surface: "full",
        category: "arm",
        supportedCoverages: COMPLETE_ONLY,
        preferredView: side === "left" ? "front-left" : "front-right",
        focusSection: "arms",
        memberIds: [`${side}_shoulder`],
      }),
      entry({
        id: `${side}_biceps_region`,
        shortLabel: `Brazo superior · Cara anterior ${Lfem}`,
        description: `Cara anterior del brazo superior ${L}`,
        side,
        surface: "anterior",
        category: "arm",
        supportedCoverages: COMPLETE_ONLY,
        preferredView: side === "left" ? "front-left" : "front-right",
        focusSection: "arms",
        memberIds: [`${side}_upper_arm_front`],
      }),
      entry({
        id: `${side}_triceps_region`,
        shortLabel: `Brazo superior · Cara posterior ${Lfem}`,
        description: `Cara posterior del brazo superior ${L}`,
        side,
        surface: "posterior",
        category: "arm",
        supportedCoverages: COMPLETE_ONLY,
        preferredView: side === "left" ? "back-left" : "back-right",
        focusSection: "arms",
        memberIds: [`${side}_upper_arm_back`],
      }),
      entry({
        id: `${side}_forearm_inner_region`,
        shortLabel: `Antebrazo interno ${L}`,
        description: `Superficie interna del antebrazo ${L}`,
        side,
        surface: "inner",
        category: "arm",
        supportedCoverages: COMPLETE_ONLY,
        preferredView: side === "left" ? "front-left" : "front-right",
        focusSection: "arms",
        memberIds: [`${side}_forearm_front`, `${side}_forearm_inner`],
      }),
      entry({
        id: `${side}_forearm_outer_region`,
        shortLabel: `Antebrazo externo ${L}`,
        description: `Superficie externa del antebrazo ${L}`,
        side,
        surface: "outer",
        category: "arm",
        supportedCoverages: COMPLETE_ONLY,
        preferredView: side === "left" ? "back-left" : "back-right",
        focusSection: "arms",
        memberIds: [`${side}_forearm_back`, `${side}_forearm_outer`],
      }),
      entry({
        id: `${side}_upper_arm`,
        shortLabel: `Brazo superior ${L}`,
        description: `Superficie completa del brazo superior ${L}`,
        side,
        surface: "full",
        category: "arm",
        supportedCoverages: COMPLETE_ONLY,
        preferredView: side === "left" ? "front-left" : "front-right",
        focusSection: "arms",
        memberIds: [
          `${side}_upper_arm_front`,
          `${side}_upper_arm_back`,
          `${side}_upper_arm_inner`,
          `${side}_upper_arm_outer`,
        ],
      }),
      entry({
        id: `${side}_forearm`,
        shortLabel: `Antebrazo completo ${L}`,
        description: `Superficie completa del antebrazo ${L}`,
        side,
        surface: "full",
        category: "arm",
        supportedCoverages: COMPLETE_ONLY,
        preferredView: side === "left" ? "front-left" : "front-right",
        focusSection: "arms",
        memberIds: [
          `${side}_forearm_front`,
          `${side}_forearm_back`,
          `${side}_forearm_inner`,
          `${side}_forearm_outer`,
        ],
      }),
      entry({
        id: `${side}_full_sleeve`,
        shortLabel: `Manga completa ${Lfem}`,
        description: "Desde el hombro hasta la muñeca",
        side,
        surface: "full",
        category: "arm",
        supportedCoverages: FULL_COVERAGE,
        preferredView: view,
        focusSection: "arms",
        kind: "commercial",
        memberIds: [
          `${side}_shoulder`,
          `${side}_upper_arm_front`,
          `${side}_upper_arm_back`,
          `${side}_upper_arm_inner`,
          `${side}_upper_arm_outer`,
          `${side}_elbow`,
          `${side}_forearm_front`,
          `${side}_forearm_back`,
          `${side}_forearm_inner`,
          `${side}_forearm_outer`,
          `${side}_wrist`,
        ],
      }),
      entry({
        id: `${side}_hand`,
        shortLabel: `Mano ${Lfem}`,
        description: "Dorso y palma",
        side,
        surface: "full",
        category: "hand",
        supportedCoverages: COMPLETE_ONLY,
        preferredView: view,
        focusSection: "arms",
        memberIds: [`${side}_hand`],
      }),
    ];
  }),

  // —— Piernas (por lado) ——
  ...(["right", "left"] as const).flatMap((side) => {
    const L = side === "left" ? "izquierdo" : "derecho";
    const Lfem = side === "left" ? "izquierda" : "derecha";
    const view: CatalogPreferredView = side === "left" ? "left" : "right";
    return [
      entry({
        id: `${side}_thigh_front`,
        shortLabel: `Muslo ${L} · Cara anterior`,
        description: "Cara anterior del muslo",
        side,
        surface: "anterior",
        category: "leg",
        supportedCoverages: COMPLETE_ONLY,
        preferredView: "front",
        focusSection: "legs",
        memberIds: [`${side}_thigh_front`],
      }),
      entry({
        id: `${side}_thigh_back`,
        shortLabel: `Muslo ${L} · Cara posterior`,
        description: "Cara posterior del muslo",
        side,
        surface: "posterior",
        category: "leg",
        supportedCoverages: COMPLETE_ONLY,
        preferredView: "back",
        focusSection: "legs",
        memberIds: [`${side}_thigh_back`],
      }),
      entry({
        id: `${side}_thigh_inner`,
        shortLabel: `Muslo ${L} · Cara interna`,
        description: "Cara interna del muslo",
        side,
        surface: "inner",
        category: "leg",
        supportedCoverages: COMPLETE_ONLY,
        preferredView: side === "left" ? "front-left" : "front-right",
        focusSection: "legs",
        memberIds: [`${side}_thigh_inner`],
      }),
      entry({
        id: `${side}_thigh_outer`,
        shortLabel: `Muslo ${L} · Cara externa`,
        description: "Cara externa del muslo",
        side,
        surface: "outer",
        category: "leg",
        supportedCoverages: COMPLETE_ONLY,
        preferredView: view,
        focusSection: "legs",
        memberIds: [`${side}_thigh_outer`],
      }),
      entry({
        id: `${side}_thigh`,
        shortLabel: `Muslo ${L} completo`,
        description: "Circunferencia del muslo",
        side,
        surface: "full",
        category: "leg",
        supportedCoverages: FULL_COVERAGE,
        preferredView: "front",
        focusSection: "legs",
        memberIds: [
          `${side}_thigh_front`,
          `${side}_thigh_back`,
          `${side}_thigh_inner`,
          `${side}_thigh_outer`,
        ],
      }),
      entry({
        id: `${side}_lower_leg_front`,
        shortLabel: `Espinilla ${Lfem}`,
        description: "Cara anterior de la pierna inferior",
        side,
        surface: "anterior",
        category: "leg",
        supportedCoverages: COMPLETE_ONLY,
        preferredView: "front",
        focusSection: "legs",
        memberIds: [`${side}_lower_leg_front`],
      }),
      entry({
        id: `${side}_lower_leg_back`,
        shortLabel: `Pantorrilla ${Lfem}`,
        description: "Cara posterior de la pierna inferior",
        side,
        surface: "posterior",
        category: "leg",
        supportedCoverages: COMPLETE_ONLY,
        preferredView: "back",
        focusSection: "legs",
        memberIds: [`${side}_lower_leg_back`],
      }),
      entry({
        id: `${side}_lower_leg`,
        shortLabel: `Pierna inferior ${Lfem} completa`,
        description: "Circunferencia de la pierna inferior",
        side,
        surface: "full",
        category: "leg",
        supportedCoverages: FULL_COVERAGE,
        preferredView: "front",
        focusSection: "legs",
        memberIds: [
          `${side}_lower_leg_front`,
          `${side}_lower_leg_back`,
          `${side}_lower_leg_inner`,
          `${side}_lower_leg_outer`,
        ],
      }),
      entry({
        id: `${side}_full_leg`,
        shortLabel: `Pierna ${Lfem} completa`,
        description: "Desde el muslo hasta el tobillo",
        side,
        surface: "full",
        category: "leg",
        supportedCoverages: FULL_COVERAGE,
        preferredView: "front",
        focusSection: "legs",
        // Pie excluido: no se incluye automáticamente
        memberIds: [
          `${side}_thigh`,
          `${side}_knee`,
          `${side}_lower_leg`,
          `${side}_ankle`,
        ],
      }),
      entry({
        id: `${side}_foot`,
        shortLabel: `Pie ${L}`,
        description: "Dorso y planta",
        side,
        surface: "full",
        category: "foot",
        supportedCoverages: COMPLETE_ONLY,
        preferredView: "front",
        focusSection: "legs",
        memberIds: [`${side}_foot`],
      }),
    ];
  }),

  // —— Cabeza ——
  entry({
    id: "head_top",
    shortLabel: "Coronilla",
    description: "Zona superior del cráneo (coronilla)",
    side: "center",
    surface: "top",
    category: "head",
    supportedCoverages: COMPLETE_ONLY,
    preferredView: "front",
    focusSection: "head",
    memberIds: ["head_top"],
  }),
  entry({
    id: "head_left_region",
    shortLabel: "Cabeza · Lateral izquierdo",
    description: "Lateral izquierdo del cráneo",
    side: "left",
    surface: "lateral",
    category: "head",
    supportedCoverages: COMPLETE_ONLY,
    preferredView: "left",
    focusSection: "head",
    memberIds: ["head_left_side", "left_ear"],
  }),
  entry({
    id: "head_right_region",
    shortLabel: "Cabeza · Lateral derecho",
    description: "Lateral derecho del cráneo",
    side: "right",
    surface: "lateral",
    category: "head",
    supportedCoverages: COMPLETE_ONLY,
    preferredView: "right",
    focusSection: "head",
    memberIds: ["head_right_side", "right_ear"],
  }),
  entry({
    id: "head_back",
    shortLabel: "Cabeza · Parte posterior",
    description: "Occipital y parte posterior del cráneo",
    side: "center",
    surface: "posterior",
    category: "head",
    supportedCoverages: COMPLETE_ONLY,
    preferredView: "back",
    focusSection: "head",
    memberIds: ["head_back"],
  }),
  entry({
    id: "full_scalp",
    shortLabel: "Cuero cabelludo completo",
    description: "Calota y laterales del cráneo (incluye orejas)",
    side: "both",
    surface: "full",
    category: "head",
    supportedCoverages: COMPLETE_ONLY,
    preferredView: "back",
    focusSection: "head",
    memberIds: [
      "head_top",
      "head_back",
      "head_left_side",
      "head_right_side",
      "left_ear",
      "right_ear",
    ],
  }),

  // —— Cuello ——
  entry({
    id: "neck_front",
    shortLabel: "Cuello anterior",
    description: "Superficie frontal del cuello",
    side: "center",
    surface: "anterior",
    category: "neck",
    supportedCoverages: COMPLETE_ONLY,
    preferredView: "front",
    focusSection: "head",
    memberIds: ["neck_front"],
  }),
  entry({
    id: "neck_back",
    shortLabel: "Nuca",
    description: "Superficie posterior del cuello (nuca)",
    side: "center",
    surface: "posterior",
    category: "neck",
    supportedCoverages: COMPLETE_ONLY,
    preferredView: "back",
    focusSection: "head",
    memberIds: ["neck_back"],
  }),
  entry({
    id: "neck_left",
    shortLabel: "Cuello lateral izquierdo",
    description:
      "Superficie lateral izquierda del cuello, de la mandíbula a la clavícula",
    side: "left",
    surface: "lateral",
    category: "neck",
    supportedCoverages: COMPLETE_ONLY,
    preferredView: "front-left",
    focusSection: "head",
    memberIds: ["neck_left"],
    fullLabel:
      "Cuello lateral izquierdo · De la mandíbula a la clavícula",
  }),
  entry({
    id: "neck_right",
    shortLabel: "Cuello lateral derecho",
    description:
      "Superficie lateral derecha del cuello, de la mandíbula a la clavícula",
    side: "right",
    surface: "lateral",
    category: "neck",
    supportedCoverages: COMPLETE_ONLY,
    preferredView: "front-right",
    focusSection: "head",
    memberIds: ["neck_right"],
    fullLabel:
      "Cuello lateral derecho · De la mandíbula a la clavícula",
  }),
  entry({
    id: "full_neck",
    shortLabel: "Cuello completo",
    description: "Superficie completa del cuello",
    side: "both",
    surface: "full",
    category: "neck",
    supportedCoverages: COMPLETE_ONLY,
    preferredView: "front-right",
    focusSection: "head",
    memberIds: ["neck_front", "neck_back", "neck_left", "neck_right"],
  }),

  // —— Pelvis (alcance comercial vigente) ——
  entry({
    id: "right_hip",
    shortLabel: "Cadera derecha",
    description: "Región ilíaca / cadera lateral derecha",
    side: "right",
    surface: "full",
    category: "hip",
    supportedCoverages: COMPLETE_ONLY,
    preferredView: "right",
    focusSection: "torso",
    memberIds: ["right_hip"],
  }),
  entry({
    id: "left_hip",
    shortLabel: "Cadera izquierda",
    description: "Región ilíaca / cadera lateral izquierda",
    side: "left",
    surface: "full",
    category: "hip",
    supportedCoverages: COMPLETE_ONLY,
    preferredView: "left",
    focusSection: "torso",
    memberIds: ["left_hip"],
  }),
  entry({
    id: "right_glute",
    shortLabel: "Glúteo derecho",
    description: "Región glútea derecha",
    side: "right",
    surface: "posterior",
    category: "hip",
    supportedCoverages: COMPLETE_ONLY,
    preferredView: "back",
    focusSection: "torso",
    memberIds: ["right_glute"],
  }),
  entry({
    id: "left_glute",
    shortLabel: "Glúteo izquierdo",
    description: "Región glútea izquierda",
    side: "left",
    surface: "posterior",
    category: "hip",
    supportedCoverages: COMPLETE_ONLY,
    preferredView: "back",
    focusSection: "torso",
    memberIds: ["left_glute"],
  }),
  entry({
    id: "full_glutes",
    shortLabel: "Glúteos completos",
    description: "Región glútea bilateral",
    side: "both",
    surface: "posterior",
    category: "hip",
    supportedCoverages: COMPLETE_ONLY,
    preferredView: "back",
    focusSection: "torso",
    memberIds: ["left_glute", "right_glute"],
  }),

  // —— Internos / no públicos (migración, flags, lab) ——
  entry({
    id: "left_chest",
    shortLabel: "Pectoral izquierdo",
    description: "Región pectoral izquierda (interna)",
    side: "left",
    surface: "anterior",
    category: "torso",
    supportedCoverages: COMPLETE_ONLY,
    preferredView: "front",
    focusSection: "torso",
    memberIds: ["left_chest"],
    publicSelectable: false,
  }),
  entry({
    id: "right_chest",
    shortLabel: "Pectoral derecho",
    description: "Región pectoral derecha (interna)",
    side: "right",
    surface: "anterior",
    category: "torso",
    supportedCoverages: COMPLETE_ONLY,
    preferredView: "front",
    focusSection: "torso",
    memberIds: ["right_chest"],
    publicSelectable: false,
  }),
  entry({
    id: "full_face",
    shortLabel: "Rostro",
    description: "Región facial completa",
    side: "both",
    surface: "anterior",
    category: "head",
    supportedCoverages: COMPLETE_ONLY,
    preferredView: "front",
    focusSection: "head",
    memberIds: ["face_left", "face_right"],
    publicSelectable: false,
  }),
  entry({
    id: "full_head",
    shortLabel: "Cabeza completa",
    description: "Cuero cabelludo y rostro",
    side: "both",
    surface: "full",
    category: "head",
    supportedCoverages: COMPLETE_ONLY,
    preferredView: "front",
    focusSection: "head",
    memberIds: ["full_scalp", "full_face"],
    publicSelectable: false,
  }),
  // Half-sleeves: legacy comerciales, no taxonomía pública
  ...(["right", "left"] as const).flatMap((side) => [
    entry({
      id: `${side}_upper_half_sleeve`,
      shortLabel: `Media manga superior ${side === "left" ? "izquierda" : "derecha"}`,
      description: "Hombro a codo (legacy)",
      side,
      surface: "full",
      category: "arm",
      supportedCoverages: COMPLETE_ONLY,
      preferredView: side,
      focusSection: "arms",
      kind: "commercial",
      publicSelectable: false,
      memberIds: [
        `${side}_shoulder`,
        `${side}_upper_arm_front`,
        `${side}_upper_arm_back`,
        `${side}_upper_arm_inner`,
        `${side}_upper_arm_outer`,
        `${side}_elbow`,
      ],
    }),
    entry({
      id: `${side}_lower_half_sleeve`,
      shortLabel: `Media manga inferior ${side === "left" ? "izquierda" : "derecha"}`,
      description: "Codo a muñeca (legacy)",
      side,
      surface: "full",
      category: "arm",
      supportedCoverages: COMPLETE_ONLY,
      preferredView: side,
      focusSection: "arms",
      kind: "commercial",
      publicSelectable: false,
      memberIds: [
        `${side}_elbow`,
        `${side}_forearm_front`,
        `${side}_forearm_back`,
        `${side}_forearm_inner`,
        `${side}_forearm_outer`,
        `${side}_wrist`,
      ],
    }),
  ]),
];

export const BODY_PUBLIC_SELECTION_CATALOG_BY_ID: Readonly<
  Record<string, PublicBodyCatalogEntry>
> = Object.fromEntries(BODY_PUBLIC_SELECTION_CATALOG.map((e) => [e.id, e]));

export const PUBLIC_PRODUCT_FLAGS = {
  faceSelectable: false,
};

/** IDs públicos finales (sin microzonas ni legacy ocultos). */
export const PUBLIC_SELECTABLE_BODY_TARGET_IDS: ReadonlySet<string> = new Set(
  BODY_PUBLIC_SELECTION_CATALOG.filter((e) => e.publicSelectable).map(
    (e) => e.id,
  ),
);

export type PublicBodySelectionTargetId = string;

export function getPublicCatalogEntry(
  id: string,
): PublicBodyCatalogEntry | undefined {
  return BODY_PUBLIC_SELECTION_CATALOG_BY_ID[id];
}

export function isPublicSelectableBodyTarget(id: string): boolean {
  const bare = stripCoverageToken(id).regionId;
  if (bare === "full_face") return PUBLIC_PRODUCT_FLAGS.faceSelectable;
  return PUBLIC_SELECTABLE_BODY_TARGET_IDS.has(bare);
}

export function regionSupportsCoverage(regionId: string): boolean {
  const entry = getPublicCatalogEntry(regionId);
  if (!entry) return false;
  return entry.supportedCoverages.length > 1;
}

export function getSupportedCoverages(
  regionId: string,
): readonly BodyCoverage[] {
  return getPublicCatalogEntry(regionId)?.supportedCoverages ?? COMPLETE_ONLY;
}

export function normalizeCoverageForRegion(
  regionId: string,
  coverage?: BodyCoverage | null,
): BodyCoverage {
  const supported = getSupportedCoverages(regionId);
  if (coverage && supported.includes(coverage)) return coverage;
  return "complete";
}

/** Wire token: `regionId` o `regionId@inner` / `regionId@outer`. */
export const COVERAGE_TOKEN_SEP = "@";

export function serializeBodyPlacement(
  placement: BodyPlacementSelection,
): string {
  const coverage = normalizeCoverageForRegion(
    placement.regionId,
    placement.coverage,
  );
  if (coverage === "complete" || !regionSupportsCoverage(placement.regionId)) {
    return placement.regionId;
  }
  return `${placement.regionId}${COVERAGE_TOKEN_SEP}${coverage}`;
}

export function stripCoverageToken(token: string): BodyPlacementSelection {
  const sep = token.lastIndexOf(COVERAGE_TOKEN_SEP);
  if (sep <= 0) return { regionId: token };
  const regionId = token.slice(0, sep);
  const raw = token.slice(sep + 1);
  if (raw === "complete" || raw === "inner" || raw === "outer") {
    return { regionId, coverage: raw };
  }
  return { regionId: token };
}

export function parseBodyPlacementToken(
  token: string,
): BodyPlacementSelection | null {
  const { regionId, coverage } = stripCoverageToken(token);
  if (!regionId) return null;
  return {
    regionId,
    coverage: normalizeCoverageForRegion(regionId, coverage),
  };
}

/**
 * Migración de IDs legacy → región pública (+ cobertura cuando aplica).
 */
export const LEGACY_REGION_ID_MIGRATIONS: Readonly<Record<string, string>> = {
  left_chest: "full_chest",
  right_chest: "full_chest",
  left_pectoral: "full_chest",
  right_pectoral: "full_chest",
  left_pectoral_region: "full_chest",
  right_pectoral_region: "full_chest",
  upper_back_large: "upper_back",
  mid_back: "upper_back",
  lower_back_large: "lower_back",
  back_torso: "full_back",
  right_full_arm: "right_full_sleeve",
  left_full_arm: "left_full_sleeve",
  front_torso: "full_chest",
  full_torso: "full_chest",
  right_upper_half_sleeve: "right_upper_arm",
  left_upper_half_sleeve: "left_upper_arm",
  right_lower_half_sleeve: "right_forearm",
  left_lower_half_sleeve: "left_forearm",
  right_forearm_inner: "right_forearm_inner_region",
  left_forearm_inner: "left_forearm_inner_region",
  right_forearm_outer: "right_forearm_outer_region",
  left_forearm_outer: "left_forearm_outer_region",
  right_forearm_complete: "right_forearm",
  left_forearm_complete: "left_forearm",
  right_inner_forearm: "right_forearm_inner_region",
  left_inner_forearm: "left_forearm_inner_region",
  right_outer_forearm: "right_forearm_outer_region",
  left_outer_forearm: "left_forearm_outer_region",
  full_head: "full_scalp",
};

/** Atómicas de cobertura para filtrar resolución geométrica. */
export function resolveMemberIdsForCoverage(
  regionId: string,
  coverage: BodyCoverage = "complete",
): readonly string[] {
  const catalog = getPublicCatalogEntry(regionId);
  if (!catalog) return [];
  const members = catalog.memberIds;
  const normalized = normalizeCoverageForRegion(regionId, coverage);
  if (normalized === "complete") return members;

  if (
    regionId.endsWith("_full_sleeve") ||
    regionId.endsWith("_upper_arm") ||
    regionId.endsWith("_forearm")
  ) {
    if (normalized === "inner") {
      return members.filter(
        (id) => id.includes("_front") || id.includes("_inner"),
      );
    }
    return members.filter(
      (id) => id.includes("_back") || id.includes("_outer"),
    );
  }

  if (
    regionId.endsWith("_thigh") ||
    regionId.endsWith("_lower_leg") ||
    regionId.endsWith("_full_leg")
  ) {
    const face = normalized;
    const patterns =
      face === "inner"
        ? ["_inner", "_front"]
        : ["_outer", "_back"];
    const filtered = members.filter((id) =>
      patterns.some((p) => id.includes(p)),
    );
    return filtered.length > 0 ? filtered : members;
  }

  return members;
}

export function listPublicCatalogByCategory(
  category: PublicRegionCategory,
): PublicBodyCatalogEntry[] {
  return BODY_PUBLIC_SELECTION_CATALOG.filter(
    (e) => e.publicSelectable && e.category === category,
  );
}

export function assertNoPublicPectorals(): string[] {
  const banned = ["left_chest", "right_chest", "left_pectoral", "right_pectoral"];
  return banned.filter((id) => PUBLIC_SELECTABLE_BODY_TARGET_IDS.has(id));
}

export const COVERAGE_LABELS: Record<BodyCoverage, string> = {
  complete: "Completa",
  inner: "Interna",
  outer: "Externa",
};
