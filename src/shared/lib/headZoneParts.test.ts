import { describe, expect, it } from "vitest";
import { getHeadReferenceImage } from "./headZoneParts";

describe("getHeadReferenceImage", () => {
  it("usa la imagen de perfil correcta para la vista lateral derecha", () => {
    expect(getHeadReferenceImage("lateral_derecho")).toBe("/body/head-right-profile.png");
  });

  it("usa la imagen superior correcta para la vista de la parte superior de la cabeza", () => {
    expect(getHeadReferenceImage("cuero_cabelludo")).toBe("/body/head-top-profile.png");
  });
});
