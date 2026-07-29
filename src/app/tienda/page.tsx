import Image from "next/image";
import Link from "next/link";
import { AppShell } from "@/widgets/layout/AppShell";
import { PRODUCTS, formatCop } from "@/shared/config/products";
import { ShopAddButton } from "@/widgets/shop/ShopAddButton";

export default function TiendaPage() {
  return (
    <AppShell>
      <header className="max-w-xl">
        <p className="typo-eyebrow typo-eyebrow-muted">Tienda</p>
        <h1
          className="mt-2 text-[clamp(2rem,5vw,3.2rem)] leading-none tracking-tight"
          style={{ fontFamily: "var(--font-stack-lettering)" }}
        >
          Danniel Cuervo
        </h1>
        <p className="mt-3 max-w-[55ch] text-sm leading-relaxed text-zinc-500">
          Cursos y merch. Checkout simulado para el prototipo.
        </p>
      </header>

      <div className="mt-10 grid grid-cols-1 gap-6 sm:grid-cols-2">
        {PRODUCTS.map((product) => (
          <article
            key={product.id}
            className="border border-white/10 bg-[#120e0b]"
          >
            <Link href={`/tienda/${product.id}`} className="block">
              <div className="relative aspect-[4/5] overflow-hidden">
                <Image
                  src={product.image}
                  alt={product.title}
                  fill
                  sizes="(max-width: 640px) 100vw, 50vw"
                  className="object-cover transition duration-300 hover:scale-[1.02]"
                />
              </div>
            </Link>
            <div className="p-5">
              <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-zinc-500">
                {product.type === "course" ? "Curso" : "Merch"}
              </p>
              <h2 className="mt-2 text-lg font-semibold tracking-tight text-zinc-50">
                <Link href={`/tienda/${product.id}`}>{product.title}</Link>
              </h2>
              <p className="mt-2 line-clamp-2 text-sm leading-relaxed text-zinc-500">
                {product.description}
              </p>
              <div className="mt-5 flex items-center justify-between gap-3">
                <p className="font-mono text-sm text-[rgba(var(--rgb-sand),0.9)]">
                  {formatCop(product.price)}
                </p>
                <ShopAddButton productId={product.id} />
              </div>
            </div>
          </article>
        ))}
      </div>
    </AppShell>
  );
}
