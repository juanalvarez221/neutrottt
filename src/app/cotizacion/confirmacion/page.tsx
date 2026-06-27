import { redirect } from "next/navigation";
import { QuoteConfirmationStep } from "@/widgets/quote/QuoteConfirmationStep";
import { receivesOnlinePricing } from "@/shared/lib/quoteDraft";

type SearchParams = Promise<{ [key: string]: string | string[] | undefined }>;

function getParam(
  source: { [key: string]: string | string[] | undefined },
  key: string,
  fallback: string,
) {
  const value = source[key];
  if (Array.isArray(value)) return value[0] ?? fallback;
  return value ?? fallback;
}

function titleCase(text: string) {
  return text
    .split(" ")
    .filter(Boolean)
    .map((chunk) => chunk[0].toUpperCase() + chunk.slice(1).toLowerCase())
    .join(" ");
}

export default async function CotizacionConfirmacionPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const params = await searchParams;
  const rawSize = getParam(params, "size", "mediano");
  const rawZone = getParam(params, "zone", "brazo_completo");
  const rawZoneOther = getParam(params, "zoneOther", "");

  if (!receivesOnlinePricing(rawSize)) {
    redirect(`/cotizacion/asesoria?size=${encodeURIComponent(rawSize)}`);
  }

  const size = titleCase(rawSize);

  return (
    <QuoteConfirmationStep
      size={size}
      sizeRaw={rawSize}
      zone={rawZone}
      zoneOther={rawZoneOther}
    />
  );
}

