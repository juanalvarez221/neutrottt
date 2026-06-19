import { QuoteReferenceStep } from "@/widgets/quote/QuoteReferenceStep";

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

export default async function CotizacionReferenciaPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const params = await searchParams;
  return (
    <QuoteReferenceStep
      size={getParam(params, "size", "mediano")}
      zone={getParam(params, "zone", "")}
      zoneOther={getParam(params, "zoneOther", "")}
    />
  );
}
