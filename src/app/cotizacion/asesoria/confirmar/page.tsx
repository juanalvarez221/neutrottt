import { QuoteAdvisoryConfirmStep } from "@/widgets/quote/QuoteAdvisoryConfirmStep";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

function getParam(params: Record<string, string | string[] | undefined>, key: string) {
  const value = params[key];
  return Array.isArray(value) ? value[0] : value;
}

export default async function CotizacionAsesoriaConfirmarPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const params = await searchParams;
  const token = getParam(params, "token")?.trim() ?? "";

  return <QuoteAdvisoryConfirmStep token={token} />;
}
