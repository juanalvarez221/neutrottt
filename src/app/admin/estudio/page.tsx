import type { Metadata } from "next";
import { StudioToolsPanel } from "@/widgets/admin/StudioToolsPanel";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Estudio",
  robots: { index: false, follow: false, nocache: true },
};

export default function AdminEstudioPage() {
  return <StudioToolsPanel />;
}
