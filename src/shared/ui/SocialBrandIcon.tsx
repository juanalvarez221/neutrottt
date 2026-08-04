import { MessageCircle } from "lucide-react";
import { cn } from "@/shared/lib/cn";

/** Redes usadas en contacto / gracias. */
const NETWORK_LABELS = {
  instagram: "Instagram",
  whatsapp: "WhatsApp",
} as const;

export type SocialNetwork = keyof typeof NETWORK_LABELS;

type SocialBrandIconProps = {
  network: SocialNetwork;
  className?: string;
};

function InstagramMark({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <rect width="14" height="14" x="5" y="5" rx="4" />
      <circle cx="12" cy="12" r="3.2" />
      <circle cx="16.2" cy="7.8" r="0.55" fill="currentColor" stroke="none" />
    </svg>
  );
}

function NetworkGlyph({
  network,
  className,
}: {
  network: SocialNetwork;
  className?: string;
}) {
  if (network === "instagram") {
    return <InstagramMark className={className} />;
  }
  return <MessageCircle className={className} strokeWidth={1.75} />;
}

/** Ícono de red social con marco de marca. */
export function SocialBrandIcon({ network, className }: SocialBrandIconProps) {
  const label = NETWORK_LABELS[network];

  return (
    <span
      className={cn(
        "social-brand-icon inline-flex shrink-0 items-center justify-center rounded-xl border border-white/10 bg-cacao/45 text-sand shadow-[inset_0_1px_0_rgba(243,230,215,0.06)]",
        className,
      )}
      aria-hidden
    >
      <span className="sr-only">{label}</span>
      <NetworkGlyph network={network} className="h-[1.05rem] w-[1.05rem] shrink-0" />
    </span>
  );
}
