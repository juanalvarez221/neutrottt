"use client";

import Image from "next/image";
import type { ReactNode } from "react";
import {
  getBodyImageAspectRatio,
  getBodyImageIntrinsic,
} from "@/shared/lib/bodyImageMeta";
import { BODY_REFERENCE_IMAGE_FRAME } from "@/widgets/quote/quoteRefinementUi";

type BodyImageFrameProps = {
  src: string;
  alt: string;
  children?: ReactNode;
  /** Clases del shell externo (centrado, max-width, etc.). */
  className?: string;
  /** Clases del canvas (borde, fondo). Default: marco de referencia. */
  canvasClassName?: string;
  sizes?: string;
  priority?: boolean;
  quality?: number;
  /**
   * `contain` — llena el ancho disponible respetando aspect.
   * `fit` — se adapta al alto/ancho del padre (popup de refinamiento).
   */
  fit?: "contain" | "fit";
};

/**
 * Marco donde la imagen y los hotspots comparten el mismo sistema de coordenadas.
 * Evita el desfase de object-contain + % sobre un contenedor de otro aspect.
 */
export function BodyImageFrame({
  src,
  alt,
  children,
  className = "",
  canvasClassName = BODY_REFERENCE_IMAGE_FRAME,
  sizes = "(max-width: 640px) 100vw, 420px",
  priority = false,
  quality = 95,
  fit = "contain",
}: BodyImageFrameProps) {
  const intrinsic = getBodyImageIntrinsic(src);
  const aspectRatio = getBodyImageAspectRatio(src);

  const canvasFitClass =
    fit === "fit"
      ? "body-image-frame__canvas body-image-frame__canvas--fit"
      : "body-image-frame__canvas body-image-frame__canvas--contain";

  return (
    <div
      className={[
        "body-image-frame",
        fit === "fit" ? "body-image-frame--fit" : "body-image-frame--contain",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
    >
      <div
        className={[canvasFitClass, canvasClassName].filter(Boolean).join(" ")}
        style={{
          aspectRatio,
          ["--body-ar" as string]: `${intrinsic.width / intrinsic.height}`,
        }}
      >
        <Image
          src={src}
          alt={alt}
          fill
          quality={quality}
          sizes={sizes}
          priority={priority}
          className="object-cover object-center"
        />
        <div className="body-image-frame__hotspots">{children}</div>
      </div>
    </div>
  );
}
