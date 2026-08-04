export type ProjectTag = "Realismo" | "Blackwork" | "Surrealismo" | "FineLine";

type Project = {
  id: string;
  title: string;
  subtitle: string;
  tag: ProjectTag;
};

export const PROJECT_TAGS: Array<{ id: "all" | ProjectTag; label: string }> = [
  { id: "all", label: "Todas" },
  { id: "Realismo", label: "Realismo" },
  { id: "Blackwork", label: "Blackwork" },
  { id: "Surrealismo", label: "Surrealismo" },
  { id: "FineLine", label: "Fineline" },
];

export const PROJECTS: Project[] = [
  {
    id: "p1",
    title: "Retrato oscuro",
    subtitle: "Sombras profundas, detalle fino",
    tag: "Realismo",
  },
  {
    id: "p2",
    title: "Bestia & tinta",
    subtitle: "Texturas densas en blackwork",
    tag: "Blackwork",
  },
  {
    id: "p3",
    title: "Sueño de humo",
    subtitle: "Surrealismo con contraste",
    tag: "Surrealismo",
  },
  {
    id: "p4",
    title: "Línea eterna",
    subtitle: "Fineline minimalista",
    tag: "FineLine",
  },
  {
    id: "p5",
    title: "Ojos de acero",
    subtitle: "Realismo con alta definición",
    tag: "Realismo",
  },
  {
    id: "p6",
    title: "Cráneo ritual",
    subtitle: "Blackwork con capas",
    tag: "Blackwork",
  },
];

