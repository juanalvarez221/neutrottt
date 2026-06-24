import { NextResponse } from "next/server";
import { createConfirmationToken } from "@/shared/lib/advisoryBookingLifecycle";
import { sendAdvisoryBookingConfirmationEmail } from "@/shared/lib/advisoryNotifications.server";
import { sendNewAdvisoryInternalEmail } from "@/shared/lib/notifications/internalArtistNotifications.server";
import { syncOnReserved } from "@/shared/lib/googleCalendar/advisoryCalendarSync.server";
import {
  addAdvisoryBooking,
  loadAdvisoryStore,
  updateAdvisoryBooking,
} from "@/shared/lib/advisoryStore.server";
import { formatSlotLabel, isSlotTaken } from "@/shared/lib/advisorySlots";
import type { AdvisoryBooking, AdvisoryClientBrief, AdvisoryMode } from "@/shared/lib/advisoryTypes";

export const dynamic = "force-dynamic";

type BookBody = {
  mode?: AdvisoryMode;
  startsAt?: string;
  clientName?: string;
  phone?: string;
  email?: string;
  projectNotes?: string;
  size?: string;
  brief?: AdvisoryClientBrief;
};

function sanitizeBrief(brief?: AdvisoryClientBrief): AdvisoryClientBrief | undefined {
  if (!brief) return undefined;
  const clean: AdvisoryClientBrief = {};
  if (brief.bodyZone?.trim()) clean.bodyZone = brief.bodyZone.trim();
  if (brief.referral?.trim()) clean.referral = brief.referral.trim();
  if (brief.personalValues?.trim()) clean.personalValues = brief.personalValues.trim();
  if (brief.collaborationMode?.trim()) clean.collaborationMode = brief.collaborationMode.trim();
  if (brief.openNote?.trim()) clean.openNote = brief.openNote.trim();
  return Object.keys(clean).length ? clean : undefined;
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as BookBody;
    const mode = body.mode;
    const startsAt = body.startsAt?.trim();
    const clientName = body.clientName?.trim();
    const phone = body.phone?.trim();
    const email = body.email?.trim();

    if (mode !== "presencial" && mode !== "virtual") {
      return NextResponse.json({ error: "Modo inválido." }, { status: 400 });
    }
    if (!startsAt || !clientName || !phone || !email) {
      return NextResponse.json({ error: "Faltan datos para reservar." }, { status: 400 });
    }

    const store = await loadAdvisoryStore();
    const durationMin = store[mode].durationMin;

    if (isSlotTaken(store, startsAt, durationMin)) {
      return NextResponse.json(
        { error: "Ese horario ya no está disponible. Elige otro." },
        { status: 409 },
      );
    }

    const booking: AdvisoryBooking = {
      id: `AS-${Date.now()}`,
      mode,
      startsAt,
      durationMin,
      clientName,
      phone,
      email,
      projectNotes: body.projectNotes?.trim() || undefined,
      size: body.size?.trim() || undefined,
      brief: sanitizeBrief(body.brief),
      createdAt: new Date().toISOString(),
      status: "reserved",
      confirmationToken: createConfirmationToken(),
    };

    await addAdvisoryBooking(booking);

    const googleSync = await syncOnReserved(booking);
    if (googleSync) {
      booking.googleCalendarEventId = googleSync.eventId;
      booking.meetingLink = googleSync.meetingLink;
      await updateAdvisoryBooking(booking.id, {
        googleCalendarEventId: googleSync.eventId,
        ...(googleSync.meetingLink ? { meetingLink: googleSync.meetingLink } : {}),
      });
    }

    await sendNewAdvisoryInternalEmail(booking);

    const emailResult = await sendAdvisoryBookingConfirmationEmail(booking);
    if (emailResult.ok) {
      await updateAdvisoryBooking(booking.id, {
        bookingEmailSentAt: new Date().toISOString(),
      });
    }

    return NextResponse.json({
      ok: true,
      booking: {
        ...booking,
        label: formatSlotLabel(booking.startsAt, "es-CO"),
        meetingLink: booking.meetingLink,
      },
    });
  } catch (error) {
    console.error("[advisory:book]", error instanceof Error ? error.message : error);
    return NextResponse.json({ error: "No se pudo completar la reserva." }, { status: 500 });
  }
}
