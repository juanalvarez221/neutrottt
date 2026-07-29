"use client";

import { AwardsGallery } from "@/widgets/home/AwardsGallery";
import { TattooProjectsGrid } from "@/widgets/home/TattooProjectsGrid";

/** Home portfolio: awards + real tattoo projects (replaces mock PORTFOLIO_PIECES). */
export function ProjectsCarousel() {
  return (
    <>
      <AwardsGallery />
      <TattooProjectsGrid />
    </>
  );
}
