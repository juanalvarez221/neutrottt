import { Suspense } from "react";
import type { Metadata } from "next";
import { QuotesInboxPanel } from "@/widgets/admin/QuotesInboxPanel";
import { AdminSkeleton } from "@/widgets/admin/AdminPrimitives";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Cotizaciones",
  robots: { index: false, follow: false, nocache: true },
};

export default function AdminCotizacionesPage() {
  return (
    <Suspense fallback={<AdminSkeleton rows={5} />}>
      <QuotesInboxPanel />
    </Suspense>
  );
}
