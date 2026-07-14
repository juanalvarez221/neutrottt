import type { ComponentType } from "react";
import {
  ArrowDown,
  ArrowDownLeft,
  ArrowDownRight,
  ArrowLeft,
  ArrowLeftRight,
  ArrowRight,
  ArrowUp,
  ArrowUpRight,
  Brain,
  Circle,
  CircleDashed,
  CircleDot,
  Crosshair,
  Disc,
  Dot,
  Dumbbell,
  Ear,
  Eye,
  Fingerprint,
  Footprints,
  Hand,
  Heart,
  Layers,
  MapPin,
  MoveLeft,
  MoveRight,
  Ruler,
  Square,
} from "lucide-react";
import {
  expandRegions,
  REGION_TO_ZONE,
  ZONE_REGIONS,
} from "./svgRegionsMap";

/**
 * Config-driven body zone tree. Adding a new zone here is enough for it to
 * appear in the full progressive flow without touching any component.
 */

export type IconType = ComponentType<{ className?: string; strokeWidth?: number }>;

export type Side = "left" | "right" | "both";

export interface ZoneOption {
  id: string;
  label: string;
  description?: string;
  icon: IconType;
  /** SVG region templates. May contain the `{side}` token. */
  regions?: string[];
  /** Step id this option branches into (single-select branching only). */
  next?: string;
  /** Stable slug emitted in the output payload (defaults to `id`). */
  value?: string;
  /** Renders full width at the end of the grid ("Todo / Ambas"). */
  wide?: boolean;
  /** Coverage descriptor emitted in the output payload. */
  coverage?: string;
}

export interface ZoneStep {
  id: string;
  title: string;
  /** Allows multiple options to be toggled (terminal steps only). */
  multiple?: boolean;
  options: ZoneOption[];
}

export interface ZoneConfig {
  /** Stable slug emitted as `zone` in the output payload. */
  id: string;
  label: string;
  icon: IconType;
  description: string;
  /** Ask the side before the first question step. */
  askSide?: boolean;
  /** Grammatical gender for side wording (m: Izquierdo / f: Izquierda). */
  sideGender?: "m" | "f";
  rootStep: string;
  steps: Record<string, ZoneStep>;
}

export interface Answer {
  stepId: string;
  optionIds: string[];
}

export interface FlowState {
  zoneId: string | null;
  side: Side | null;
  answers: Answer[];
}

export interface ZoneSelection {
  zone: string;
  side: Side | null;
  subzones: string[];
  coverage: string | null;
  svgRegions: string[];
  summaryLabel: string;
}

export interface BodyZoneResult {
  selections: ZoneSelection[];
  totalZones: number;
  fullSummary: string;
}

const NO_REGION_NOTE = "Sin cara trasera registrada, se resalta la cara visible.";

export const ZONES: ZoneConfig[] = [
  {
    id: "head",
    label: "Cabeza",
    icon: Brain,
    description: "Rostro, cuero cabelludo y nuca",
    rootStep: "part",
    steps: {
      part: {
        id: "part",
        title: "¿En qué parte de la cabeza?",
        options: [
          {
            id: "scalp",
            label: "Cuero cabelludo",
            description: "La parte de arriba de la cabeza",
            icon: Brain,
            regions: ["zone-head-front", "zone-head-back"],
          },
          {
            id: "forehead",
            label: "Frente",
            description: "Desde la línea del cabello hasta las cejas",
            icon: Eye,
            regions: ["zone-head-front"],
          },
          {
            id: "temple",
            label: "Sien",
            description: "A los lados de la frente",
            icon: Square,
            regions: ["zone-head-front"],
          },
          {
            id: "behind_ear",
            label: "Detrás de la oreja",
            description: "Área pequeña detrás del lóbulo",
            icon: Ear,
            regions: ["zone-head-back"],
          },
          {
            id: "nape",
            label: "Nuca",
            description: "Parte trasera baja de la cabeza",
            icon: ArrowDown,
            regions: ["zone-head-back"],
          },
        ],
      },
    },
  },
  {
    id: "neck",
    label: "Cuello",
    icon: ArrowUp,
    description: "Frente, laterales y cervical",
    rootStep: "part",
    steps: {
      part: {
        id: "part",
        title: "¿Dónde en el cuello?",
        options: [
          {
            id: "front",
            label: "Frente del cuello",
            description: "La parte visible de frente",
            icon: ArrowUp,
            regions: ["zone-neck-front"],
          },
          {
            id: "side_right",
            label: "Lateral derecho",
            description: "Costado derecho",
            icon: MoveRight,
            regions: ["zone-neck-front"],
          },
          {
            id: "side_left",
            label: "Lateral izquierdo",
            description: "Costado izquierdo",
            icon: MoveLeft,
            regions: ["zone-neck-front"],
          },
          {
            id: "nape",
            label: "Nuca / cervical",
            description: "Parte trasera del cuello",
            icon: ArrowDown,
            regions: ["zone-neck-back"],
          },
          {
            id: "full",
            label: "Todo el cuello",
            description: "Que rodee el cuello completo",
            icon: Circle,
            regions: ["zone-neck-front", "zone-neck-back"],
            next: "coverage",
            wide: true,
          },
        ],
      },
      coverage: {
        id: "coverage",
        title: "¿La cobertura es completa?",
        options: [
          {
            id: "front_sides",
            label: "Solo frente y lados",
            description: "Sin tocar la nuca",
            icon: CircleDashed,
            regions: ["zone-neck-front"],
            coverage: "front_sides",
          },
          {
            id: "around",
            label: "360° Cuello completo",
            description: "Rodea todo",
            icon: Disc,
            regions: ["zone-neck-front", "zone-neck-back"],
            coverage: "360",
            wide: true,
          },
        ],
      },
    },
  },
  {
    id: "shoulder",
    label: "Hombro",
    icon: Disc,
    description: "Deltoides, cara delantera y trasera",
    askSide: true,
    sideGender: "m",
    rootStep: "part",
    steps: {
      part: {
        id: "part",
        title: "¿Qué parte del hombro?",
        options: [
          {
            id: "top",
            label: "Parte de arriba",
            description: "La cima del hombro (deltoides superior)",
            icon: ArrowUp,
            regions: ["zone-shoulder-{side}"],
          },
          {
            id: "front",
            label: "Parte delantera",
            description: "Hombro visto de frente",
            icon: ArrowUpRight,
            regions: ["zone-shoulder-{side}"],
            coverage: "front",
          },
          {
            id: "back",
            label: "Parte trasera",
            description: "Hombro visto de espalda",
            icon: ArrowDownRight,
            regions: ["zone-trap-{side}"],
            coverage: "back",
          },
          {
            id: "full",
            label: "Hombro completo",
            description: "Las tres caras del hombro",
            icon: Disc,
            regions: ["zone-shoulder-{side}", "zone-trap-{side}"],
            coverage: "360",
            wide: true,
          },
        ],
      },
    },
  },
  {
    id: "chest",
    label: "Pecho",
    icon: Heart,
    description: "Pectorales, esternón y clavícula",
    rootStep: "part",
    steps: {
      part: {
        id: "part",
        title: "¿Qué zona del pecho?",
        options: [
          {
            id: "left",
            label: "Pecho izquierdo",
            description: "Lado del corazón",
            icon: Heart,
            regions: ["zone-chest-left"],
          },
          {
            id: "right",
            label: "Pecho derecho",
            description: "Lado derecho",
            icon: MoveRight,
            regions: ["zone-chest-right"],
          },
          {
            id: "sternum",
            label: "Centro / esternón",
            description: "La línea del medio",
            icon: Crosshair,
            regions: ["zone-sternum"],
          },
          {
            id: "clavicle",
            label: "Clavícula",
            description: "La parte alta, bajo el cuello",
            icon: Ruler,
            regions: ["zone-sternum", "zone-shoulder-left", "zone-shoulder-right"],
          },
          {
            id: "full",
            label: "Pecho completo",
            description: "Todo el frente del torso superior",
            icon: Disc,
            regions: ["zone-chest-left", "zone-chest-right", "zone-sternum"],
            next: "ribs",
            wide: true,
          },
        ],
      },
      ribs: {
        id: "ribs",
        title: "¿Incluye las costillas laterales?",
        options: [
          {
            id: "front_only",
            label: "No, solo el frente",
            description: "El pecho sin tocar los costados",
            icon: Square,
            regions: ["zone-chest-left", "zone-chest-right", "zone-sternum"],
            coverage: "front",
          },
          {
            id: "with_ribs",
            label: "Sí, que baje por los costados",
            description: "Pecho más los flancos laterales",
            icon: ArrowLeftRight,
            regions: [
              "zone-chest-left",
              "zone-chest-right",
              "zone-sternum",
              "zone-ribs-left",
              "zone-ribs-right",
            ],
            coverage: "sides",
            wide: true,
          },
        ],
      },
    },
  },
  {
    id: "abdomen",
    label: "Abdomen",
    icon: Square,
    description: "Vientre superior, inferior y flancos",
    rootStep: "part",
    steps: {
      part: {
        id: "part",
        title: "¿Qué zona del abdomen?",
        options: [
          {
            id: "upper",
            label: "Abdomen superior",
            description: "Por encima del ombligo",
            icon: ArrowUp,
            regions: ["zone-abdomen-upper"],
          },
          {
            id: "lower",
            label: "Abdomen inferior",
            description: "Por debajo del ombligo",
            icon: ArrowDown,
            regions: ["zone-abdomen-lower"],
          },
          {
            id: "side_right",
            label: "Costado derecho",
            description: "Flanco / costilla lateral derecha",
            icon: MoveRight,
            regions: ["zone-ribs-right"],
          },
          {
            id: "side_left",
            label: "Costado izquierdo",
            description: "Flanco / costilla lateral izquierda",
            icon: MoveLeft,
            regions: ["zone-ribs-left"],
          },
          {
            id: "full",
            label: "Abdomen completo",
            description: "Todo el frente del vientre",
            icon: Disc,
            regions: ["zone-abdomen-upper", "zone-abdomen-lower"],
            wide: true,
          },
        ],
      },
    },
  },
  {
    id: "back",
    label: "Espalda",
    icon: Layers,
    description: "Alta, media, lumbar y columna",
    rootStep: "part",
    steps: {
      part: {
        id: "part",
        title: "¿Qué zona de la espalda?",
        options: [
          {
            id: "upper",
            label: "Espalda alta",
            description: "Entre los hombros y omóplatos",
            icon: ArrowUp,
            regions: ["zone-upper-back"],
          },
          {
            id: "mid",
            label: "Espalda media",
            description: "Centro de la espalda",
            icon: ArrowRight,
            regions: ["zone-mid-back"],
          },
          {
            id: "lower",
            label: "Espalda baja / lumbar",
            description: "Zona lumbar, justo sobre los glúteos",
            icon: ArrowDown,
            regions: ["zone-lower-back"],
          },
          {
            id: "side_right",
            label: "Costado derecho",
            description: "Flanco lateral derecho",
            icon: MoveRight,
            regions: ["zone-ribs-right"],
          },
          {
            id: "side_left",
            label: "Costado izquierdo",
            description: "Flanco lateral izquierdo",
            icon: MoveLeft,
            regions: ["zone-ribs-left"],
          },
          {
            id: "spine",
            label: "Columna vertebral",
            description: "La línea central de la espalda",
            icon: MapPin,
            regions: ["zone-upper-back", "zone-mid-back", "zone-lower-back"],
          },
          {
            id: "full",
            label: "Espalda completa",
            description: "Toda la espalda",
            icon: Disc,
            regions: ["zone-upper-back", "zone-mid-back", "zone-lower-back"],
            next: "coverage",
            wide: true,
          },
        ],
      },
      coverage: {
        id: "coverage",
        title: "¿Qué incluye?",
        options: [
          {
            id: "central",
            label: "Solo la espalda central",
            description: "Sin los costados",
            icon: Square,
            regions: ["zone-upper-back", "zone-mid-back", "zone-lower-back"],
            coverage: "central",
          },
          {
            id: "with_sides",
            label: "Espalda + costados",
            description: "Que baje por los flancos",
            icon: ArrowLeftRight,
            regions: [
              "zone-upper-back",
              "zone-mid-back",
              "zone-lower-back",
              "zone-ribs-left",
              "zone-ribs-right",
            ],
            coverage: "sides",
          },
          {
            id: "full_torso",
            label: "Todo el torso posterior",
            description: "Máxima cobertura",
            icon: Disc,
            regions: [
              "zone-upper-back",
              "zone-mid-back",
              "zone-lower-back",
              "zone-ribs-left",
              "zone-ribs-right",
              "zone-trap-left",
              "zone-trap-right",
            ],
            coverage: "360",
            wide: true,
          },
        ],
      },
    },
  },
  {
    id: "arm",
    label: "Brazo",
    icon: Dumbbell,
    description: "Bícep, trícep, antebrazo y manga",
    askSide: true,
    sideGender: "m",
    rootStep: "part",
    steps: {
      part: {
        id: "part",
        title: "¿Qué parte del brazo?",
        options: [
          {
            id: "bicep",
            label: "Bícep",
            description: "La parte delantera del brazo superior",
            icon: Dumbbell,
            regions: ["zone-bicep-{side}"],
          },
          {
            id: "tricep",
            label: "Trícep",
            description: "La parte trasera del brazo superior",
            icon: ArrowDownLeft,
            regions: ["zone-tricep-{side}"],
          },
          {
            id: "upper_arm",
            label: "Brazo superior",
            description: "Bícep + trícep juntos",
            icon: CircleDot,
            regions: ["zone-bicep-{side}", "zone-tricep-{side}"],
            next: "upper_face",
          },
          {
            id: "forearm",
            label: "Antebrazo",
            description: "La parte del codo a la muñeca",
            icon: Ruler,
            regions: ["zone-forearm-int-{side}", "zone-forearm-ext-{side}"],
            next: "forearm_face",
          },
          {
            id: "sleeve",
            label: "Manga completa",
            description: "Todo el brazo de hombro a muñeca",
            icon: Ruler,
            regions: [
              "zone-shoulder-{side}",
              "zone-bicep-{side}",
              "zone-tricep-{side}",
              "zone-forearm-int-{side}",
              "zone-forearm-ext-{side}",
            ],
            next: "sleeve_length",
            wide: true,
          },
        ],
      },
      upper_face: {
        id: "upper_face",
        title: "¿Qué cara del brazo superior?",
        options: [
          {
            id: "front",
            label: "Solo delantera (bícep)",
            description: "Lo que se ve de frente",
            icon: ArrowUpRight,
            regions: ["zone-bicep-{side}"],
            coverage: "front",
          },
          {
            id: "back",
            label: "Solo trasera (trícep)",
            description: "Lo que se ve de atrás",
            icon: ArrowDownRight,
            regions: ["zone-tricep-{side}"],
            coverage: "back",
          },
          {
            id: "around",
            label: "Las dos caras",
            description: "Rodea todo el brazo superior",
            icon: Disc,
            regions: ["zone-bicep-{side}", "zone-tricep-{side}"],
            coverage: "360",
            wide: true,
          },
        ],
      },
      forearm_face: {
        id: "forearm_face",
        title: "¿Qué cara del antebrazo?",
        options: [
          {
            id: "internal",
            label: "Parte de adentro",
            description: "Cara interna (lado del pulgar)",
            icon: ArrowLeftRight,
            regions: ["zone-forearm-int-{side}"],
            coverage: "front",
          },
          {
            id: "external",
            label: "Parte de afuera",
            description: "Cara externa (dorso)",
            icon: ArrowLeftRight,
            regions: ["zone-forearm-ext-{side}"],
            coverage: "back",
          },
          {
            id: "around",
            label: "Las dos caras",
            description: "Rodea todo el antebrazo",
            icon: Disc,
            regions: ["zone-forearm-int-{side}", "zone-forearm-ext-{side}"],
            coverage: "360",
            wide: true,
          },
        ],
      },
      sleeve_length: {
        id: "sleeve_length",
        title: "¿Hasta dónde llega la manga?",
        options: [
          {
            id: "quarter",
            label: "Cuarto de manga",
            description: "Del hombro al comienzo del bícep",
            icon: MapPin,
            regions: ["zone-shoulder-{side}", "zone-bicep-{side}"],
            next: "sleeve_coverage",
          },
          {
            id: "half",
            label: "Media manga",
            description: "Del hombro al codo",
            icon: MapPin,
            regions: ["zone-shoulder-{side}", "zone-bicep-{side}", "zone-tricep-{side}"],
            next: "sleeve_coverage",
          },
          {
            id: "three_quarter",
            label: "Tres cuartos",
            description: "Del hombro casi a la muñeca",
            icon: MapPin,
            regions: [
              "zone-shoulder-{side}",
              "zone-bicep-{side}",
              "zone-tricep-{side}",
              "zone-forearm-int-{side}",
              "zone-forearm-ext-{side}",
            ],
            next: "sleeve_coverage",
          },
          {
            id: "full",
            label: "Manga entera",
            description: "Del hombro a la muñeca",
            icon: MapPin,
            regions: [
              "zone-shoulder-{side}",
              "zone-bicep-{side}",
              "zone-tricep-{side}",
              "zone-forearm-int-{side}",
              "zone-forearm-ext-{side}",
            ],
            next: "sleeve_coverage",
          },
        ],
      },
      sleeve_coverage: {
        id: "sleeve_coverage",
        title: "¿Cómo cubre el brazo?",
        options: [
          {
            id: "front",
            label: "Solo la parte delantera",
            description: "La cara que se ve de frente",
            icon: ArrowUpRight,
            regions: ["zone-shoulder-{side}", "zone-bicep-{side}", "zone-forearm-int-{side}"],
            coverage: "front",
          },
          {
            id: "back",
            label: "Solo la parte trasera",
            description: "La cara que se ve de atrás",
            icon: ArrowDownRight,
            regions: ["zone-tricep-{side}", "zone-forearm-ext-{side}"],
            coverage: "back",
          },
          {
            id: "around",
            label: "Todo alrededor",
            description: "Cobertura 360°",
            icon: Disc,
            regions: [
              "zone-shoulder-{side}",
              "zone-bicep-{side}",
              "zone-tricep-{side}",
              "zone-forearm-int-{side}",
              "zone-forearm-ext-{side}",
            ],
            coverage: "360",
            wide: true,
          },
        ],
      },
    },
  },
  {
    id: "hand",
    label: "Mano",
    icon: Hand,
    description: "Dorso, palma y dedos",
    askSide: true,
    sideGender: "f",
    rootStep: "part",
    steps: {
      part: {
        id: "part",
        title: "¿Qué parte de la mano?",
        options: [
          {
            id: "back_hand",
            label: "Dorso",
            description: "La parte de arriba de la mano",
            icon: ArrowUp,
            regions: ["zone-hand-{side}"],
            coverage: "back",
          },
          {
            id: "palm",
            label: "Palma",
            description: "La parte de adentro",
            icon: ArrowDown,
            regions: ["zone-hand-{side}"],
            coverage: "front",
          },
          {
            id: "fingers",
            label: "Dedos",
            description: "Uno o varios dedos",
            icon: Fingerprint,
            regions: ["zone-hand-{side}"],
            next: "finger_part",
          },
          {
            id: "full",
            label: "Mano completa",
            description: "Dorso + palma",
            icon: Disc,
            regions: ["zone-hand-{side}"],
            coverage: "360",
            wide: true,
          },
        ],
      },
      finger_part: {
        id: "finger_part",
        title: "¿Qué parte del dedo?",
        options: [
          {
            id: "knuckle",
            label: "Falange (nudo)",
            description: "La parte que marca las coyunturas",
            icon: Dot,
            regions: ["zone-hand-{side}"],
          },
          {
            id: "side",
            label: "Lateral del dedo",
            description: "El costado del dedo",
            icon: ArrowLeftRight,
            regions: ["zone-hand-{side}"],
          },
          {
            id: "around",
            label: "Todo el dedo",
            description: "Que rodee todo",
            icon: Disc,
            regions: ["zone-hand-{side}"],
            coverage: "360",
            wide: true,
          },
        ],
      },
    },
  },
  {
    id: "leg",
    label: "Pierna",
    icon: Dumbbell,
    description: "Muslo, rodilla y pierna baja",
    askSide: true,
    sideGender: "f",
    rootStep: "part",
    steps: {
      part: {
        id: "part",
        title: "¿Qué parte de la pierna?",
        options: [
          {
            id: "thigh",
            label: "Muslo",
            description: "La parte alta (de la cadera a la rodilla)",
            icon: Dumbbell,
            regions: ["zone-quad-{side}", "zone-hamstring-{side}"],
            next: "thigh_face",
          },
          {
            id: "knee",
            label: "Rodilla",
            description: "El área de la rodilla",
            icon: Disc,
            regions: ["zone-knee-{side}"],
          },
          {
            id: "lower_leg",
            label: "Pierna baja",
            description: "De la rodilla al tobillo",
            icon: Ruler,
            regions: ["zone-shin-{side}", "zone-calf-{side}"],
            next: "lower_face",
          },
          {
            id: "full",
            label: "Pierna completa",
            description: "Del muslo al tobillo",
            icon: Ruler,
            regions: [
              "zone-quad-{side}",
              "zone-knee-{side}",
              "zone-shin-{side}",
              "zone-hamstring-{side}",
              "zone-calf-{side}",
            ],
            next: "full_coverage",
            wide: true,
          },
        ],
      },
      thigh_face: {
        id: "thigh_face",
        title: "¿Qué cara del muslo?",
        options: [
          {
            id: "quad",
            label: "Frente del muslo",
            description: "Cuádriceps, lo que se ve de frente",
            icon: ArrowUpRight,
            regions: ["zone-quad-{side}"],
            coverage: "front",
          },
          {
            id: "hamstring",
            label: "Atrás del muslo",
            description: "Isquiotibiales, lo que se ve de atrás",
            icon: ArrowDownRight,
            regions: ["zone-hamstring-{side}"],
            coverage: "back",
          },
          {
            id: "outer",
            label: "Lateral externo",
            description: "El costado afuera del muslo",
            icon: MoveRight,
            regions: ["zone-quad-{side}"],
            coverage: "outer",
          },
          {
            id: "inner",
            label: "Lateral interno",
            description: "El costado adentro del muslo",
            icon: MoveLeft,
            regions: ["zone-quad-{side}"],
            coverage: "inner",
          },
          {
            id: "around",
            label: "Todo el muslo",
            description: "Cobertura 360° alrededor",
            icon: Disc,
            regions: ["zone-quad-{side}", "zone-hamstring-{side}"],
            coverage: "360",
            wide: true,
          },
        ],
      },
      lower_face: {
        id: "lower_face",
        title: "¿Qué cara de la pierna baja?",
        options: [
          {
            id: "shin",
            label: "Frente",
            description: "Espinilla / tibia",
            icon: ArrowUpRight,
            regions: ["zone-shin-{side}"],
            coverage: "front",
          },
          {
            id: "calf",
            label: "Atrás",
            description: "Pantorrilla",
            icon: ArrowDownRight,
            regions: ["zone-calf-{side}"],
            coverage: "back",
          },
          {
            id: "outer",
            label: "Lateral externo",
            description: "Costado exterior",
            icon: ArrowLeftRight,
            regions: ["zone-shin-{side}"],
            coverage: "outer",
          },
          {
            id: "around",
            label: "Todo alrededor",
            description: "Cobertura 360°",
            icon: Disc,
            regions: ["zone-shin-{side}", "zone-calf-{side}"],
            coverage: "360",
            wide: true,
          },
        ],
      },
      full_coverage: {
        id: "full_coverage",
        title: "¿Cómo cubre la pierna?",
        options: [
          {
            id: "front",
            label: "Solo la parte delantera",
            description: "Cuádriceps + espinilla",
            icon: ArrowUpRight,
            regions: ["zone-quad-{side}", "zone-shin-{side}"],
            coverage: "front",
          },
          {
            id: "back",
            label: "Solo la parte trasera",
            description: "Isquiotibiales + pantorrilla",
            icon: ArrowDownRight,
            regions: ["zone-hamstring-{side}", "zone-calf-{side}"],
            coverage: "back",
          },
          {
            id: "sides",
            label: "Solo laterales",
            description: "Los costados de la pierna",
            icon: ArrowLeftRight,
            regions: ["zone-quad-{side}", "zone-shin-{side}"],
            coverage: "sides",
          },
          {
            id: "around",
            label: "Todo alrededor",
            description: "Cobertura 360° completa",
            icon: Disc,
            regions: [
              "zone-quad-{side}",
              "zone-knee-{side}",
              "zone-shin-{side}",
              "zone-hamstring-{side}",
              "zone-calf-{side}",
            ],
            coverage: "360",
            wide: true,
          },
        ],
      },
    },
  },
  {
    id: "foot",
    label: "Pie",
    icon: Footprints,
    description: "Empeine, tobillo, talón y dedos",
    askSide: true,
    sideGender: "m",
    rootStep: "part",
    steps: {
      part: {
        id: "part",
        title: "¿Qué parte del pie?",
        options: [
          {
            id: "instep",
            label: "Empeine",
            description: "La parte de arriba del pie",
            icon: ArrowUp,
            regions: ["zone-foot-{side}"],
          },
          {
            id: "sole",
            label: "Planta",
            description: "La parte de abajo (poco común)",
            icon: ArrowDown,
            regions: ["zone-foot-{side}"],
          },
          {
            id: "ankle",
            label: "Tobillo",
            description: "El área del tobillo",
            icon: Circle,
            regions: ["zone-foot-{side}"],
          },
          {
            id: "heel",
            label: "Talón",
            description: "La parte trasera del pie",
            icon: ArrowDownRight,
            regions: ["zone-foot-back-{side}"],
          },
          {
            id: "toes",
            label: "Dedos del pie",
            description: "Uno o varios dedos",
            icon: Fingerprint,
            regions: ["zone-foot-{side}"],
          },
          {
            id: "full",
            label: "Pie completo",
            description: "Empeine + tobillo",
            icon: Disc,
            regions: ["zone-foot-{side}", "zone-foot-back-{side}"],
            coverage: "360",
            wide: true,
          },
        ],
      },
    },
  },
];

const ZONE_INDEX: Record<string, ZoneConfig> = ZONES.reduce(
  (acc, zone) => {
    acc[zone.id] = zone;
    return acc;
  },
  {} as Record<string, ZoneConfig>,
);

export function getZone(zoneId: string | null | undefined): ZoneConfig | undefined {
  if (!zoneId) return undefined;
  return ZONE_INDEX[zoneId];
}

export function getZoneForRegion(regionId: string): string | undefined {
  return REGION_TO_ZONE[regionId];
}

/** Ordered list of step ids reached so far given current answers. */
export function getOrderedSteps(zone: ZoneConfig, answers: Answer[]): string[] {
  const order: string[] = [];
  const guard = new Set<string>();
  let stepId: string | undefined = zone.rootStep;

  while (stepId && !guard.has(stepId)) {
    guard.add(stepId);
    order.push(stepId);
    const answer = answers.find((a) => a.stepId === stepId);
    if (!answer) break;
    const step: ZoneStep | undefined = zone.steps[stepId];
    if (!step || step.multiple) break;
    const selected: ZoneOption | undefined = step.options.find((o: ZoneOption) =>
      answer.optionIds.includes(o.id),
    );
    stepId = selected?.next;
  }

  return order;
}

/** The next step that still needs an answer, or null when the flow is done. */
export function getCurrentStepId(zone: ZoneConfig, answers: Answer[]): string | null {
  const order = getOrderedSteps(zone, answers);
  for (const stepId of order) {
    if (!answers.some((a) => a.stepId === stepId && a.optionIds.length > 0)) {
      return stepId;
    }
  }
  return null;
}

export function isFlowComplete(state: FlowState): boolean {
  const zone = getZone(state.zoneId);
  if (!zone) return false;
  if (zone.askSide && !state.side) return false;
  return getCurrentStepId(zone, state.answers) === null && state.answers.length > 0;
}

function uniqueList(values: string[]): string[] {
  return Array.from(new Set(values));
}

/** Regions to render in the ACTIVE state for the current selection. */
export function computeActiveRegions(state: FlowState): string[] {
  const zone = getZone(state.zoneId);
  if (!zone) return [];
  const order = getOrderedSteps(zone, state.answers);

  for (let i = order.length - 1; i >= 0; i -= 1) {
    const stepId = order[i];
    const answer = state.answers.find((a) => a.stepId === stepId);
    if (!answer || answer.optionIds.length === 0) continue;
    const step = zone.steps[stepId];
    const options = step.options.filter((o) => answer.optionIds.includes(o.id));
    const regions = options.flatMap((o) => o.regions ?? []);
    if (regions.length > 0) {
      return uniqueList(expandRegions(regions, state.side));
    }
  }

  return [];
}

/** Regions to render in the PARTIAL state (the broader zone context). */
export function computePartialRegions(state: FlowState, active: string[]): string[] {
  const zone = getZone(state.zoneId);
  if (!zone) return [];
  const activeSet = new Set(active);
  const zoneTemplates = ZONE_REGIONS[zone.id] ?? [];
  return expandRegions(zoneTemplates, state.side).filter((r) => !activeSet.has(r));
}

export function sideWord(zone: ZoneConfig | undefined, side: Side | null): string {
  if (!zone || !side) return "";
  const feminine = zone.sideGender === "f";
  if (side === "left") return feminine ? "Izquierda" : "Izquierdo";
  if (side === "right") return feminine ? "Derecha" : "Derecho";
  return feminine ? "Ambas" : "Ambos";
}

export function sideOptions(zone: ZoneConfig): { id: Side; label: string; icon: IconType }[] {
  const feminine = zone.sideGender === "f";
  return [
    { id: "left", label: feminine ? "Izquierda" : "Izquierdo", icon: ArrowLeft },
    { id: "right", label: feminine ? "Derecha" : "Derecho", icon: ArrowRight },
    { id: "both", label: feminine ? "Ambas" : "Ambos", icon: ArrowLeftRight },
  ];
}

/** Builds the per-zone summary label, e.g. "Brazo derecho · Manga 3/4 · 360°". */
export function buildSummaryLabel(state: FlowState): string {
  const zone = getZone(state.zoneId);
  if (!zone) return "";
  const parts: string[] = [zone.label];
  const side = sideWord(zone, state.side);
  if (side) parts[0] = `${zone.label} ${side.toLowerCase()}`;

  const order = getOrderedSteps(zone, state.answers);
  for (const stepId of order) {
    const answer = state.answers.find((a) => a.stepId === stepId);
    if (!answer || answer.optionIds.length === 0) continue;
    const step = zone.steps[stepId];
    const labels = step.options
      .filter((o) => answer.optionIds.includes(o.id))
      .map((o) => o.label);
    if (labels.length > 0) parts.push(labels.join(" + "));
  }

  return parts.join(" · ");
}

/** Builds the structured selection payload for a completed flow. */
export function buildSelection(state: FlowState): ZoneSelection | null {
  const zone = getZone(state.zoneId);
  if (!zone) return null;

  const order = getOrderedSteps(zone, state.answers);
  const subzones: string[] = [];
  let coverage: string | null = null;

  for (const stepId of order) {
    const answer = state.answers.find((a) => a.stepId === stepId);
    if (!answer) continue;
    const step = zone.steps[stepId];
    for (const optionId of answer.optionIds) {
      const option = step.options.find((o) => o.id === optionId);
      if (!option) continue;
      subzones.push(option.value ?? option.id);
      if (option.coverage) coverage = option.coverage;
    }
  }

  return {
    zone: zone.id,
    side: state.side,
    subzones: uniqueList(subzones),
    coverage,
    svgRegions: computeActiveRegions(state),
    summaryLabel: buildSummaryLabel(state),
  };
}

export function buildResult(committed: ZoneSelection[], current: FlowState): BodyZoneResult {
  const selections = [...committed];
  if (isFlowComplete(current)) {
    const selection = buildSelection(current);
    if (selection) selections.push(selection);
  }
  return {
    selections,
    totalZones: selections.length,
    fullSummary: selections.map((s) => s.summaryLabel).join("  +  "),
  };
}

export { NO_REGION_NOTE };
