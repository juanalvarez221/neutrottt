export type TattooProject = {
  id: string;
  title: string;
  images: string[];
};

function projectImages(folder: string, indices: number[]): string[] {
  return indices.map((n) => `/danniel/tattoo/${folder}/${n}.jpg`);
}

export const TATTOO_PROJECTS: TattooProject[] = [
  {
    id: "cabeza",
    title: "Cabeza",
    images: projectImages("cabeza", [0, 1, 2, 3, 4, 5, 6]),
  },
  {
    id: "ghetto-money",
    title: "Ghetto Money",
    images: projectImages("ghetto-money", [0, 1, 2, 3]),
  },
  {
    id: "love",
    title: "Love",
    images: projectImages("love", [1, 2, 3, 4, 5]),
  },
  {
    id: "querencia",
    title: "Querencia",
    images: projectImages("querencia", [1, 2, 3, 4]),
  },
  {
    id: "sabiduria",
    title: "Sabiduria",
    images: projectImages("sabiduria", [0, 1, 2]),
  },
  {
    id: "street",
    title: "Street",
    images: projectImages("street", [0, 1, 2]),
  },
];
