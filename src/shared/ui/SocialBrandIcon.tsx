import { MessageCircle, Sparkles } from "lucide-react";
import { cn } from "@/shared/lib/cn";

const NETWORK_LABELS = {
  instagram: "Instagram",
  whatsapp: "WhatsApp",
  tiktok: "TikTok",
  quote: "Cotizar",
} as const;

export type SocialNetwork = keyof typeof NETWORK_LABELS;

type SocialBrandIconProps = {
  network: SocialNetwork;
  className?: string;
  /** Tamaño del contenedor (clases Tailwind). */
  framed?: boolean;
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

function TikTokMark({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden
      className={className}
      fill="currentColor"
    >
      <path d="M16.6 5.82s.51.5 0 0A4.28 4.28 0 0 1 15.54 3h-3.09v12.4a2.59 2.59 0 0 1-2.59 2.5c-1.42 0-2.6-1.16-2.6-2.6 0-1.72 1.66-3.01 3.37-2.48V9.66c-3.45-.46-6.47 2.2-6.47 5.64 0 3.33 2.76 5.7 5.69 5.7 3.14 0 5.69-2.55 5.69-5.7V9.01a7.35 7.35 0 0 0 4.3 1.38V7.3a4.1 4.1 0 0 1-1-.48z" />
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
  const strokeProps = { className, strokeWidth: 1.75 as const };

  switch (network) {
    case "instagram":
      return <InstagramMark className={className} />;
    case "whatsapp":
      return <MessageCircle {...strokeProps} />;
    case "quote":
      return <Sparkles {...strokeProps} />;
    case "tiktok":
      return <TikTokMark className={className} />;
  }
}

export function SocialBrandIcon({
  network,
  className,
  framed = true,
}: SocialBrandIconProps) {
  const label = NETWORK_LABELS[network];
  const glyphClass = framed
    ? "h-[1.05rem] w-[1.05rem] shrink-0"
    : "h-[1.15rem] w-[1.15rem] shrink-0";

  const glyph = <NetworkGlyph network={network} className={glyphClass} />;

  if (!framed) {
    return (
      <span
        className={cn("inline-flex items-center justify-center text-sand", className)}
        aria-hidden
      >
        {glyph}
      </span>
    );
  }

  return (
    <span
      className={cn(
        "social-brand-icon inline-flex shrink-0 items-center justify-center rounded-xl border border-white/10 bg-cacao/45 text-sand shadow-[inset_0_1px_0_rgba(243,230,215,0.06)]",
        className,
      )}
      aria-hidden
    >
      <span className="sr-only">{label}</span>
      {glyph}
    </span>
  );
}
