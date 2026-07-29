import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Package } from "lucide-react";
import { AppShell } from "@/widgets/layout/AppShell";
import {
  formatProductPrice,
  getProductById,
  PRODUCTS,
  productTypeLabel,
} from "@/shared/config/products";
import { ShopAddButton } from "@/widgets/shop/ShopAddButton";

type PageProps = {
  params: Promise<{ id: string }>;
};

export function generateStaticParams() {
  return PRODUCTS.map((product) => ({ id: product.id }));
}

export default async function ProductDetailPage({ params }: PageProps) {
  const { id } = await params;
  const product = getProductById(id);
  if (!product) notFound();

  const gallery =
    product.images?.length ? product.images : product.image ? [product.image] : [];

  return (
    <AppShell>
      <Link
        href="/tienda"
        className="text-xs font-semibold uppercase tracking-[0.14em] text-zinc-500 hover:text-zinc-300"
      >
        Tienda
      </Link>

      <div className="mt-6 grid grid-cols-1 gap-8 lg:grid-cols-[1.15fr_0.85fr]">
        <div className="grid gap-3">
          <div className="relative aspect-[4/5] overflow-hidden border border-white/10 bg-[#0c0a08]">
            {gallery[0] ? (
              <Image
                src={gallery[0]}
                alt={product.title}
                fill
                priority
                sizes="(max-width: 1024px) 100vw, 55vw"
                className="object-cover"
              />
            ) : (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-zinc-500">
                <Package className="h-10 w-10" strokeWidth={1.5} />
                <span className="font-mono text-[10px] uppercase tracking-[0.16em]">
                  Foto pendiente
                </span>
              </div>
            )}
          </div>
          {gallery.length > 1 ? (
            <div className="grid grid-cols-4 gap-2 sm:grid-cols-5">
              {gallery.slice(1).map((src) => (
                <div key={src} className="relative aspect-square overflow-hidden bg-[#0c0a08]">
                  <Image src={src} alt="" fill sizes="120px" className="object-cover" />
                </div>
              ))}
            </div>
          ) : null}
          {product.video ? (
            <video
              className="w-full border border-white/10"
              controls
              playsInline
              preload="metadata"
              poster={product.image}
            >
              <source src={product.video} type="video/mp4" />
            </video>
          ) : null}
        </div>

        <div>
          <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-zinc-500">
            {productTypeLabel(product.type)}
          </p>
          <h1
            className="mt-3 text-[clamp(2rem,4vw,3rem)] leading-none tracking-tight text-zinc-50"
            style={{ fontFamily: "var(--font-stack-lettering)" }}
          >
            {product.title}
          </h1>
          <p className="mt-4 max-w-[55ch] text-sm leading-relaxed text-zinc-400">
            {product.description}
          </p>
          <p className="mt-6 font-mono text-lg text-[rgba(var(--rgb-sand),0.95)]">
            {formatProductPrice(product)}
          </p>
          {!product.placeholder ? (
            <div className="mt-6 flex flex-wrap gap-3">
              <ShopAddButton productId={product.id} />
              <Link
                href="/tienda/checkout"
                className="inline-flex min-h-11 items-center border border-[rgba(var(--rgb-camel),0.35)] bg-[rgba(var(--rgb-cacao),0.35)] px-4 text-xs font-semibold uppercase tracking-[0.12em] text-[rgba(243,230,215,0.96)] transition active:scale-[0.98]"
              >
                Comprar ahora
              </Link>
            </div>
          ) : (
            <p className="mt-6 text-sm text-zinc-500">Próximamente — foto y precio pendientes.</p>
          )}
          <p className="mt-4 text-xs leading-relaxed text-zinc-600">
            {/* SIMULADO: reemplazar con Stripe/MercadoPago antes de producción */}
            Checkout simulado en el prototipo. Sin cobro real.
          </p>
        </div>
      </div>
    </AppShell>
  );
}
