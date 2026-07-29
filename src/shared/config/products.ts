export type ProductType = "course" | "book" | "merch";

/** Cómo se entrega el producto: digital no pide dirección de envío. */
export type ProductFulfillment = "digital" | "physical";

export type Product = {
  id: string;
  type: ProductType;
  fulfillment: ProductFulfillment;
  title: string;
  description: string;
  /**
   * Precio en COP. `null` = pendiente de confirmación (no inventar precio).
   * TODO: confirmar precio real antes de producción.
   */
  price: number | null;
  /** True when photo/price are placeholders until real merch assets arrive. */
  placeholder?: boolean;
  image?: string;
  images?: string[];
  video?: string;
};

export const PRODUCTS: Product[] = [
  {
    id: "seminario-lettering-online",
    type: "course",
    fulfillment: "digital",
    title: "Seminario Lettering Online",
    description: "Seminario 2026 · Reinvención Creativa.",
    price: 500_000,
    image: "/danniel/products/seminario/seminario-2026-reinvention.png",
    video: "/danniel/products/seminario/VideoPresentacion.mp4",
  },
  {
    id: "el-poder-de-las-letras",
    type: "book",
    fulfillment: "physical",
    title: "El Poder de las Letras (físico)",
    description: "Edición física. Guía de lettering.",
    price: 200_000,
    image: "/danniel/products/el-poder-de-las-letras/Portada.jpg",
    images: [
      "/danniel/products/el-poder-de-las-letras/Portada.jpg",
      "/danniel/products/el-poder-de-las-letras/1.jpg",
      "/danniel/products/el-poder-de-las-letras/2.jpg",
      "/danniel/products/el-poder-de-las-letras/3.jpg",
      "/danniel/products/el-poder-de-las-letras/4.jpg",
      "/danniel/products/el-poder-de-las-letras/5.jpg",
      "/danniel/products/el-poder-de-las-letras/6.jpg",
      "/danniel/products/el-poder-de-las-letras/7.jpg",
      "/danniel/products/el-poder-de-las-letras/8.jpg",
    ],
  },
  {
    id: "el-poder-de-las-letras-digital",
    type: "book",
    fulfillment: "digital",
    title: "El Poder de las Letras (digital)",
    description: "Edición digital. Misma guía, en cualquier dispositivo.",
    price: 150_000,
    image: "/danniel/products/el-poder-de-las-letras/Portada.jpg",
    images: [
      "/danniel/products/el-poder-de-las-letras/Portada.jpg",
      "/danniel/products/el-poder-de-las-letras/1.jpg",
      "/danniel/products/el-poder-de-las-letras/2.jpg",
      "/danniel/products/el-poder-de-las-letras/3.jpg",
      "/danniel/products/el-poder-de-las-letras/4.jpg",
      "/danniel/products/el-poder-de-las-letras/5.jpg",
      "/danniel/products/el-poder-de-las-letras/6.jpg",
      "/danniel/products/el-poder-de-las-letras/7.jpg",
      "/danniel/products/el-poder-de-las-letras/8.jpg",
    ],
  },
  {
    id: "camiseta-artista",
    type: "merch",
    fulfillment: "physical",
    title: "Camiseta Artista",
    description:
      "Colección Artista. Camiseta negra con lettering ARTISTA en estampado premium: gramaje alto, tela fresca y corte oversized. Llevar el oficio en alto, fuera de la piel.",
    price: 80_000,
    image: "/danniel/products/camiseta-artista/1.png",
    images: [
      "/danniel/products/camiseta-artista/1.png",
      "/danniel/products/camiseta-artista/2.png",
      "/danniel/products/camiseta-artista/5.png",
      "/danniel/products/camiseta-artista/4.png",
      "/danniel/products/camiseta-artista/7.png",
      "/danniel/products/camiseta-artista/6.png",
      "/danniel/products/camiseta-artista/3.png",
      "/danniel/products/camiseta-artista/8.png",
      "/danniel/products/camiseta-artista/9.png",
    ],
  },
];

export function getProductById(id: string): Product | undefined {
  return PRODUCTS.find((product) => product.id === id);
}

/** Catálogo público: solo piezas listas para comprar. */
export function getCatalogProducts(): Product[] {
  return PRODUCTS.filter((product) => !product.placeholder && product.price != null);
}

/** El libro es una sola obra: físico o digital, nunca ambos en el mismo pedido. */
export const BOOK_FORMAT_EXCLUSIONS: Record<string, string> = {
  "el-poder-de-las-letras": "el-poder-de-las-letras-digital",
  "el-poder-de-las-letras-digital": "el-poder-de-las-letras",
};

export function getExcludedCartProductId(productId: string): string | undefined {
  return BOOK_FORMAT_EXCLUSIONS[productId];
}

/** Productos listos para vender, no en el carrito — sugerencias de checkout/carrito. */
export function getCartUpsellCandidates(
  cartProductIds: string[],
  limit = 3,
): Product[] {
  const inCart = new Set(cartProductIds);
  const blocked = new Set<string>();
  for (const id of cartProductIds) {
    const excluded = getExcludedCartProductId(id);
    if (excluded) blocked.add(excluded);
  }

  const preferredOrder = [
    "camiseta-artista",
    "el-poder-de-las-letras",
    "el-poder-de-las-letras-digital",
    "seminario-lettering-online",
  ];

  const purchasable = PRODUCTS.filter(
    (product) =>
      !product.placeholder &&
      product.price != null &&
      !inCart.has(product.id) &&
      !blocked.has(product.id),
  );

  return [...purchasable]
    .sort((a, b) => {
      const ai = preferredOrder.indexOf(a.id);
      const bi = preferredOrder.indexOf(b.id);
      return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
    })
    .slice(0, limit);
}

export function productNeedsShipping(product: Product): boolean {
  return product.fulfillment === "physical";
}

export function formatCop(amount: number, locale = "es-CO"): string {
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency: "COP",
    maximumFractionDigits: 0,
  }).format(amount);
}

export function formatProductPrice(
  product: Product,
  locale = "es-CO",
  pendingLabel = "TODO: confirmar precio",
): string {
  if (product.price == null) return pendingLabel;
  return formatCop(product.price, locale);
}

export function productTypeLabel(type: ProductType, language: "es" | "en" = "es"): string {
  if (language === "en") {
    if (type === "course") return "Course";
    if (type === "book") return "Book";
    return "Collection";
  }
  if (type === "course") return "Curso";
  if (type === "book") return "Libro";
  return "Colección";
}
