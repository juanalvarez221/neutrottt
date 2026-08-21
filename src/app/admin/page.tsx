import type { Metadata } from "next";
import { AdminHomeDashboard } from "@/widgets/admin/AdminHomeDashboard";

export const metadata: Metadata = {
  title: "Inicio",
  robots: { index: false, follow: false, nocache: true },
};

export default function AdminPage() {
  return <AdminHomeDashboard />;
}