import type { Metadata } from "next";
import { QuoteJourneysPanel } from "@/widgets/admin/QuoteJourneysPanel";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Recorridos",
  robots: { index: false, follow: false, nocache: true },
};

export default function AdminRecorridosPage() {
  return <QuoteJourneysPanel />;
}
