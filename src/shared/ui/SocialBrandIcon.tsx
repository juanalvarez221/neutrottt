import Image from "next/image";
import { cn } from "@/shared/lib/cn";

const SOCIAL_ASSETS = {
  instagram: {
    src: "/brand/social-instagram.png",
    label: "Instagram",
  },
  whatsapp: {
    src: "/brand/social-whatsapp.png",
    label: "WhatsApp",
  },
} as const;

type SocialNetwork = keyof typeof SOCIAL_ASSETS;

type SocialBrandIconProps = {
  network: SocialNetwork;
  size?: number;
  className?: string;
};

export function SocialBrandIcon({
  network,
  size = 56,
  className,
}: SocialBrandIconProps) {
  const asset = SOCIAL_ASSETS[network];

  return (
    <Image
      src={asset.src}
      alt={asset.label}
      width={size}
      height={size}
      className={cn(
        "pointer-events-none select-none object-contain drop-shadow-[0_12px_28px_rgba(0,0,0,0.5)]",
        className,
      )}
      draggable={false}
    />
  );
}
