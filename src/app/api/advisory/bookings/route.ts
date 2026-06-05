import { NextResponse } from "next/server";
import { listAdvisoryBookings, loadAdvisoryStore } from "@/shared/lib/advisoryStore.server";
import { formatSlotLabel } from "@/shared/lib/advisorySlots";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const [bookings, store] = await Promise.all([listAdvisoryBookings(), loadAdvisoryStore()]);
    return NextResponse.json({
      bookings: bookings.map((booking) => ({
        ...booking,
        label: formatSlotLabel(booking.startsAt, "es-CO"),
      })),
      blockedDates: store.blockedDates,
    });
  } catch {
    return NextResponse.json({ error: "No se pudo cargar las reservas." }, { status: 500 });
  }
}
