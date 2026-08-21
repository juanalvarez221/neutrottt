import type { Metadata } from "next";
import { Suspense } from "react";
import { AdminLoginForm } from "@/widgets/admin/AdminLoginForm";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Neutrottt",
  robots: { index: false, follow: false, nocache: true },
};

export default function StudioGatePage() {
  return (
    <Suspense fallback={null}>
      <AdminLoginForm />
    </Suspense>
  );
}
