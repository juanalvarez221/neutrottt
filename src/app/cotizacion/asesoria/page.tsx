import { QuoteAdvisoryStep } from "@/widgets/quote/QuoteAdvisoryStep";

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

export default async function CotizacionAsesoriaPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const params = await searchParams;
  return <QuoteAdvisoryStep size={getParam(params, "size", "grande")} />;
}
