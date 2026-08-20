import type { QuoteProfile } from "@/shared/lib/quoteProfile";
import { leerIdVisitante } from "@/shared/lib/analitica/visitanteCliente";

/** Primer contacto: entra como crudo. No bloquea el flujo si falla. */
export function emitirCapturaCrm(profile: QuoteProfile) {
  if (typeof window === "undefined") return;
  void fetch("/api/crm/captura", {
    method: "POST",
    credentials: "same-origin",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      nombre: profile.name,
      whatsapp: profile.phone,
      email: profile.email,
      id_visitante: leerIdVisitante(),
    }),
    keepalive: true,
  }).catch(() => {
    /* el flujo de cotización no depende de esto */
  });
}
