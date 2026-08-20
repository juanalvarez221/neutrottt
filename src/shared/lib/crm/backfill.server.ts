import { listAllAdvisoryBookings } from "@/shared/lib/advisoryStore.server";
import { registrarHechoCrm } from "@/shared/lib/crm/personas.server";
import { getCrmSql } from "@/shared/lib/crm/postgres.server";
import type { EventoCrm } from "@/shared/lib/crm/tipos";
import { listQuoteRequests } from "@/shared/lib/storage/quoteRequestStore.server";

/**
 * Una sola vez: pasa cotizaciones y asesorías ya guardadas en Redis a personas.
 */
export async function backfillCrmDesdeOperacion(): Promise<number> {
  const sql = await getCrmSql();
  if (!sql) return 0;

  const meta = await sql<{ valor: string }[]>`
    SELECT valor FROM crm_meta WHERE clave = 'backfill_v1' LIMIT 1
  `;
  if (meta[0]?.valor === "ok") return 0;

  let count = 0;
  const quotes = await listQuoteRequests();
  for (const quote of quotes) {
    const evento: EventoCrm =
      quote.statusSlug === "paid_scheduled"
        ? "cotizacion_aceptada"
        : quote.advisoryBookingId
          ? "asesoria_agendada"
          : "cotizacion_enviada";
    const persona = await registrarHechoCrm({
      nombre: quote.clientName,
      whatsapp: quote.whatsapp,
      email: quote.email,
      evento,
      origen: quote.advisoryBookingId ? "asesoria" : "cotizacion",
      referencia_id: quote.id,
    });
    if (persona) count += 1;
  }

  const bookings = await listAllAdvisoryBookings();
  for (const booking of bookings) {
    const persona = await registrarHechoCrm({
      nombre: booking.clientName,
      whatsapp: booking.phone,
      email: booking.email,
      evento: "asesoria_agendada",
      origen: "asesoria",
      referencia_id: booking.id,
    });
    if (persona) count += 1;
  }

  await sql`
    INSERT INTO crm_meta (clave, valor) VALUES ('backfill_v1', 'ok')
    ON CONFLICT (clave) DO UPDATE SET valor = 'ok'
  `;
  return count;
}
