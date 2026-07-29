import { TATTOO_PROJECTS, type TattooProject } from "@/shared/config/tattooProjects";
import { AWARDS, type Award } from "@/shared/config/awards";

export type ProjectTag = "tattoo" | "award";

export type Project = {
  id: string;
  title: string;
  subtitle: string;
  tag: ProjectTag;
  image: string;
  images?: string[];
};

export const PROJECT_TAGS: Array<{ id: "all" | ProjectTag; label: string }> = [
  { id: "all", label: "Todas" },
  { id: "tattoo", label: "Tatuajes" },
  { id: "award", label: "Premios" },
];

function fromTattoo(project: TattooProject): Project {
  return {
    id: project.id,
    title: project.title,
    subtitle: `${project.images.length} variantes`,
    tag: "tattoo",
    image: project.images[0],
    images: project.images,
  };
}

function fromAward(award: Award): Project {
  return {
    id: award.id,
    title: award.title,
    subtitle: award.detail,
    tag: "award",
    image: award.image,
  };
}

export const PROJECTS: Project[] = [
  ...TATTOO_PROJECTS.map(fromTattoo),
  ...AWARDS.map(fromAward),
];
