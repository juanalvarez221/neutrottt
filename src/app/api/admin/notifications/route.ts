import { NextResponse } from "next/server";
import {
  listSimulatedNotifications,
  pushSimulatedNotification,
} from "@/shared/lib/notifications/simulatedNotificationStore.server";

export async function GET() {
  return NextResponse.json({ items: listSimulatedNotifications() });
}

/** Demo helper: crea una notificación de prueba desde el admin. */
export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as {
    subject?: string;
    title?: string;
    body?: string;
  };
  const entry = pushSimulatedNotification({
    kind: "other",
    subject: body.subject?.trim() || "Notificación de prueba",
    title: body.title?.trim() || "Demo admin",
    body: body.body?.trim() || "Notificación simulada creada desde el panel.",
  });
  return NextResponse.json({ item: entry });
}
