import Image from "next/image";
import { notFound } from "next/navigation";
import { Package } from "lucide-react";
import { AppShell } from "@/widgets/layout/AppShell";
import {
  formatProductPrice,
  getProductById,
  PRODUCTS,
} from "@/shared/config/products";
import { BookDetailHighlights } from "@/widgets/shop/BookDetailHighlights";
import { CourseCoverVideo } from "@/widgets/shop/CourseCoverVideo";
import { CourseDetailCurriculum } from "@/widgets/shop/CourseDetailCurriculum";
import { ProductDetailBuyPanel } from "@/widgets/shop/ProductDetailBuyPanel";
import { ProductTestimonials } from "@/widgets/shop/ProductTestimonials";

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
  const isCourse = product.type === "course";
  const isBook = product.type === "book";
  const courseWithVideo = isCourse && product.image && product.video;

  return (
    <AppShell>
      <div className="grid grid-cols-1 gap-10 lg:grid-cols-[1.2fr_0.8fr] lg:gap-14 lg:items-start">
        <div className="grid gap-3">
          {courseWithVideo ? (
            <CourseCoverVideo
              title={product.title}
              coverSrc={product.image!}
              videoSrc={product.video!}
            />
          ) : (
            <div
              className={`relative overflow-hidden border border-[rgba(var(--rgb-sand),0.14)] bg-[#0c0a08] ${
                isCourse ? "aspect-[16/10]" : "aspect-[4/5]"
              }`}
            >
              {gallery[0] ? (
                <Image
                  src={gallery[0]}
                  alt={product.title}
                  fill
                  priority
                  sizes="(max-width: 1024px) 100vw, 55vw"
                  className={isCourse ? "object-contain" : "object-cover"}
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
          )}

          {!courseWithVideo && gallery.length > 1 ? (
            <div className="grid grid-cols-4 gap-2 sm:grid-cols-5">
              {gallery.slice(1, 6).map((src) => (
                <div
                  key={src}
                  className="relative aspect-square overflow-hidden border border-[rgba(var(--rgb-sand),0.1)] bg-[#0c0a08]"
                >
                  <Image src={src} alt="" fill sizes="120px" className="object-cover" />
                </div>
              ))}
            </div>
          ) : null}

          {!courseWithVideo && product.video ? (
            <video
              className="w-full border border-[rgba(var(--rgb-sand),0.14)]"
              controls
              playsInline
              preload="metadata"
              poster={product.image}
            >
              <source src={product.video} type="video/mp4" />
            </video>
          ) : null}
        </div>

        <ProductDetailBuyPanel
          productId={product.id}
          productType={product.type}
          title={product.title}
          priceLabel={formatProductPrice(product)}
          placeholder={Boolean(product.placeholder)}
        />
      </div>

      {isCourse ? <CourseDetailCurriculum /> : null}
      {isBook ? <BookDetailHighlights /> : null}
      {isCourse ? <ProductTestimonials productType="course" /> : null}
      {isBook ? <ProductTestimonials productType="book" /> : null}
    </AppShell>
  );
}
