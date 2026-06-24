export type BodyMapViewSide = "front" | "back";

export function getBodyMapViewLabel(side: BodyMapViewSide, language: string) {
  if (language === "en") {
    return side === "front" ? "Front view · anterior side" : "Back view · posterior side";
  }

  return side === "front" ? "Vista frontal · cara anterior" : "Vista posterior · cara posterior";
}
