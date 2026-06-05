import { QuoteAdvisoryBookingStep } from "@/widgets/quote/QuoteAdvisoryBookingStep";
import type { AdvisoryMode } from "@/shared/lib/advisoryTypes";

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

export default async function CotizacionAsesoriaAgendarPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const params = await searchParams;
  const rawMode = getParam(params, "mode", "presencial");
  const mode: AdvisoryMode = rawMode === "virtual" ? "virtual" : "presencial";
  const size = getParam(params, "size", "grande");

  return <QuoteAdvisoryBookingStep mode={mode} size={size} />;
}
