"use client";

import Image from "next/image";
import { motion } from "framer-motion";

const PHOTOS = [
  {
    src: "/brand/teo1.png",
    alt: "Malianteo retrato 1",
    title: "Identidad real",
    caption: "Malianteo fusiona calle, arte oscuro y narrativa visual.",
  },
  {
    src: "/brand/teo2.png",
    alt: "Malianteo retrato 2",
    title: "Diseño con dirección",
    caption: "Cada pieza se plantea con concepto, estructura y carácter.",
  },
  {
    src: "/brand/teo3.png",
    alt: "Malianteo retrato 3",
    title: "Técnica y presencia",
    caption: "No es solo tatuar: es crear una obra que impone estilo.",
  },
];

export function TeoIntroCarousel() {
  const track = [...PHOTOS, ...PHOTOS];

  return (
    <div className="mt-6">
      <div className="relative overflow-hidden rounded-3xl border border-white/10 bg-black/40 p-3">
        <div className="pointer-events-none absolute inset-y-0 left-0 z-20 w-16 bg-gradient-to-r from-black/90 to-transparent" />
        <div className="pointer-events-none absolute inset-y-0 right-0 z-20 w-16 bg-gradient-to-l from-black/90 to-transparent" />
        <motion.div
          className="flex w-max gap-3"
          animate={{ x: ["0%", "-50%"] }}
          transition={{ duration: 34, ease: "linear", repeat: Infinity }}
        >
          {track.map((item, i) => (
            <article
              key={`${item.src}-${i}`}
              className="group relative h-72 w-52 overflow-hidden rounded-2xl border border-white/10 bg-black/40 sm:h-80 sm:w-60 md:h-[26rem] md:w-72"
            >
              <Image
                src={item.src}
                alt={item.alt}
                fill
                quality={100}
                sizes="(max-width: 768px) 220px, 288px"
                className="object-cover object-center transition duration-500 group-hover:scale-105"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/20 to-transparent" />
              <div className="absolute inset-x-0 bottom-0 z-10 p-4">
                <p className="typo-subtitle text-base text-zinc-50">{item.title}</p>
                <p className="typo-body mt-1 text-sm text-zinc-200/90">{item.caption}</p>
              </div>
            </article>
          ))}
        </motion.div>
      </div>
    </div>
  );
}

