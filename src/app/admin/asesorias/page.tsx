import type { Metadata } from "next";
import { AdvisoryAgendaPanel } from "@/widgets/admin/AdvisoryAgendaPanel";
import { AdminPageHeader } from "@/widgets/admin/AdminPrimitives";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Asesorías",
  robots: { index: false, follow: false, nocache: true },
};

export default function AdminAsesoriasPage() {
  return (
    <div className="space-y-6">
      <AdminPageHeader
        kicker="Agenda"
        title="Asesorías"
        description="Reservas vivas, confirmación de asistencia e integraciones. Lo pendiente de confirmar aparece primero en Inicio."
      />
      <AdvisoryAgendaPanel />
    </div>
  );
}
