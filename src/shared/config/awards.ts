export type Award = {
  id: string;
  image: string;
  title: string;
  detail: string;
};

/** Public claim used in marketing copy (photos below are a selection). */
export const AWARDS_CLAIM_COUNT = 50;

/** Titles/details derived from filenames — text is already in the photos. */
export const AWARDS: Award[] = Array.from({ length: 28 }, (_, index) => {
  const n = String(index + 1).padStart(2, "0");
  const id = `premio-${n}`;
  return {
    id,
    image: `/danniel/premios/${id}.jpg`,
    title: `Premio ${n}`,
    detail: `premio-${n}.jpg`,
  };
});
