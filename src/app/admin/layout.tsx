import type { Metadata } from "next";
import { AdminChrome } from "@/widgets/admin/AdminChrome";

export const metadata: Metadata = {
  robots: { index: false, follow: false, nocache: true },
};

export default function AdminLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return <AdminChrome>{children}</AdminChrome>;
}
