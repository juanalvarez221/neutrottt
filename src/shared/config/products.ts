export type ProductType = "course" | "book" | "merch";

export type Product = {
  id: string;
  type: ProductType;
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
    title: "Seminario Lettering Online",
    description:
      "Seminario online de lettering con Danniel Cuervo. Ritmo, estructura y contraste para letras que se leen en piel.",
    // TODO: confirmar precio
    price: null,
    image: "/danniel/products/seminario/Portada.png",
    video: "/danniel/products/seminario/VideoPresentacion.mp4",
  },
  {
    id: "el-poder-de-las-letras",
    type: "book",
    title: "El Poder de las Letras",
    description:
      "Guía teórico-práctica de lettering para tatuadores, ilustradores y diseñadores gráficos. Publicada en Amazon Kindle.",
    // TODO: confirmar precio
    price: null,
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
    id: "merch-hoodie-placeholder",
    type: "merch",
    title: "Hoodie Emerald (próximamente)",
    description:
      "Merch del estudio. Foto y precio pendientes — placeholder hasta tener assets reales.",
    // TODO: confirmar precio
    price: null,
    placeholder: true,
  },
  {
    id: "merch-tee-placeholder",
    type: "merch",
    title: "Camiseta Lettering (próximamente)",
    description:
      "Merch de la línea lettering. Foto y precio pendientes — placeholder hasta tener assets reales.",
    // TODO: confirmar precio
    price: null,
    placeholder: true,
  },
];

export function getProductById(id: string): Product | undefined {
  return PRODUCTS.find((product) => product.id === id);
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
    return "Merch";
  }
  if (type === "course") return "Curso";
  if (type === "book") return "Libro";
  return "Merch";
}
