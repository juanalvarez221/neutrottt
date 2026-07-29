export type ProductType = "course" | "merch";

export type Product = {
  id: string;
  type: ProductType;
  title: string;
  description: string;
  /** TODO: confirmar precio real — placeholder COP for prototype */
  price: number;
  image: string;
  images?: string[];
  video?: string;
};

export const PRODUCTS: Product[] = [
  {
    id: "seminario-lettering-online",
    type: "course",
    title: "Seminario Lettering Online",
    description:
      "Curso online de lettering con Danniel Cuervo. Estructura, ritmo y contraste para piezas en piel.",
    // TODO: confirmar precio real
    price: 450_000,
    image: "/danniel/products/seminario/Portada.png",
    video: "/danniel/products/seminario/VideoPresentacion.mp4",
  },
  {
    id: "el-poder-de-las-letras",
    type: "merch",
    title: "El Poder de Las Letras",
    description:
      "Merch de la línea El Poder de Las Letras. Pieza de colección del estudio.",
    // TODO: confirmar precio real
    price: 120_000,
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
