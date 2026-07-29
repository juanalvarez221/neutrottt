import type { Metadata } from "next";
import { SiteFooter } from "@/widgets/layout/SiteFooter";
import { AwardsWallGallery } from "@/widgets/awards/AwardsWallGallery";

export const metadata: Metadata = {
  title: "Reconocimientos",
  description:
    "Salón de la fama de Danniel Cuervo: premios y reconocimientos nacionales e internacionales.",
};

export default function PremiosPage() {
  return (
    <div className="min-h-[100dvh] bg-[#0a0708] pt-14 sm:pt-16">
      <AwardsWallGallery />
      <SiteFooter />
    </div>
  );
}
