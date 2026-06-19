import { QuoteLocationStep } from "@/widgets/quote/QuoteLocationStep";
import { resolveQuoteSizeParam } from "@/shared/lib/quoteDraft";

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

export default async function CotizacionUbicacionPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const params = await searchParams;
  return (
    <QuoteLocationStep size={resolveQuoteSizeParam(getParam(params, "size", "mediano"))} />
  );
}

