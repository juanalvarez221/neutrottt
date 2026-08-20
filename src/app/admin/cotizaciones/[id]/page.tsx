import { QuoteAdjustPanel } from "@/widgets/admin/QuoteAdjustPanel";

export const dynamic = "force-dynamic";

export default async function AdminQuoteAdjustPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <QuoteAdjustPanel quoteId={id} />;
}
