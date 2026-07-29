import type { Product } from "@/shared/config/products";
import { productNeedsShipping } from "@/shared/config/products";

export type CheckoutProfile = "digital" | "physical" | "mixed";

export type CheckoutRequirements = {
  profile: CheckoutProfile;
  needsShipping: boolean;
  hasCourse: boolean;
  hasDigitalBook: boolean;
  hasPhysicalBook: boolean;
  hasMerch: boolean;
};

export function resolveCheckoutRequirements(
  products: Product[],
): CheckoutRequirements {
  const hasCourse = products.some((p) => p.type === "course");
  const hasDigitalBook = products.some(
    (p) => p.type === "book" && p.fulfillment === "digital",
  );
  const hasPhysicalBook = products.some(
    (p) => p.type === "book" && p.fulfillment === "physical",
  );
  const hasMerch = products.some((p) => p.type === "merch");
  const needsShipping = products.some(productNeedsShipping);
  const hasDigital = products.some((p) => p.fulfillment === "digital");

  let profile: CheckoutProfile = "digital";
  if (needsShipping && hasDigital) profile = "mixed";
  else if (needsShipping) profile = "physical";

  return {
    profile,
    needsShipping,
    hasCourse,
    hasDigitalBook,
    hasPhysicalBook,
    hasMerch,
  };
}
