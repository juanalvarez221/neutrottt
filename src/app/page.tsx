"use client";

import { HeroSplash } from "@/widgets/home/HeroSplash";

export default function Home() {
  return (
    <HeroSplash
      artistName="MALIANTEO"
      subtitle="Portafolio y dirección artística"
      backgroundImageUrl="/brand/teo1.png"
      backgroundVideoUrl="/brand/malianteo_video.mp4"
      wordmarkSrc="/brand/wordmark-malianteo-clean.png"
    />
  );
}
