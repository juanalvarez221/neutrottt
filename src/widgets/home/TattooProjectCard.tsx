"use client";

import Image from "next/image";
import { useRef, useState } from "react";
import gsap from "gsap";
import { useGSAP } from "@gsap/react";
import { useReducedMotion } from "framer-motion";
import type { TattooProject } from "@/shared/config/tattooProjects";

gsap.registerPlugin(useGSAP);

const CROSSFADE_MS = 4000;

type TattooProjectCardProps = {
  project: TattooProject;
};

export function TattooProjectCard({ project }: TattooProjectCardProps) {
  const reduceMotion = useReducedMotion();
  const rootRef = useRef<HTMLElement>(null);
  const [activeIndex, setActiveIndex] = useState(0);
  const images = project.images;

  useGSAP(
    () => {
      const root = rootRef.current;
      if (!root || images.length < 2) return;

      if (reduceMotion) {
        gsap.set(root.querySelectorAll("[data-slide]"), { opacity: 0 });
        gsap.set(root.querySelector('[data-slide="0"]'), { opacity: 1 });
        setActiveIndex(0);
        return;
      }

      const slides = Array.from(root.querySelectorAll<HTMLElement>("[data-slide]"));
      gsap.set(slides, { opacity: 0 });
      gsap.set(slides[0], { opacity: 1 });

      let index = 0;
      const timer = window.setInterval(() => {
        const next = (index + 1) % slides.length;
        gsap.to(slides[index], { opacity: 0, duration: 0.7, ease: "power2.inOut" });
        gsap.to(slides[next], { opacity: 1, duration: 0.7, ease: "power2.inOut" });
        index = next;
        setActiveIndex(next);
      }, CROSSFADE_MS);

      return () => {
        window.clearInterval(timer);
      };
    },
    { scope: rootRef, dependencies: [images.length, reduceMotion] },
  );

  return (
    <article
      ref={rootRef}
      className="group relative overflow-hidden border border-white/8 bg-[#0c0a08]"
    >
      <div className="relative aspect-[4/5] w-full">
        {images.map((src, index) => (
          <div
            key={src}
            data-slide={String(index)}
            className="absolute inset-0"
            style={{ opacity: index === 0 ? 1 : 0 }}
          >
            <Image
              src={src}
              alt={`${project.title} · ${index + 1}`}
              fill
              sizes="(max-width: 768px) 100vw, 33vw"
              className="object-cover"
              priority={index === 0}
            />
          </div>
        ))}
      </div>
      <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/75 via-black/35 to-transparent px-4 pb-4 pt-12">
        <h3 className="text-lg font-semibold tracking-tight text-[rgba(243,230,215,0.96)]">
          {project.title}
        </h3>
        <p className="mt-1 font-mono text-[10px] uppercase tracking-[0.16em] text-zinc-400">
          {activeIndex + 1} / {images.length}
        </p>
      </div>
    </article>
  );
}
