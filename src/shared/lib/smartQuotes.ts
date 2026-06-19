export type SmartQuoteStatus =
  | "Pendiente de Ajuste"
  | "Asesoría Agendada"
  | "Esperando Confirmacion"
  | "Enviada"
  | "Pagada/Agendada"
  | "Descartada";

export type AdvisoryMode = "presencial" | "virtual";

export type SmartQuoteRequest = {
  id: string;
  createdAt: string;
  clientName: string;
  phone: string;
  email: string;
  size: string;
  zone: string;
  style: string;
  notes: string;
  connectionValues?: string;
  connectionCollaboration?: string;
  connectionPurpose?: string;
  connectionAftercare?: string;
  requiresAdvisory?: boolean;
  advisoryMode?: AdvisoryMode;
  advisoryScheduledAt?: string;
  advisoryBookingId?: string;
  estimateSessions: string;
  estimatePerSession: string;
  estimateTotal: string;
  status: SmartQuoteStatus;
  adminSessionPrice?: number;
  adminSessionCount?: number;
};

const SMART_QUOTES_KEY = "smart_quote_requests";

export function getSmartQuoteRequests(): SmartQuoteRequest[] {
  if (typeof window === "undefined") return [];
  const raw = window.localStorage.getItem(SMART_QUOTES_KEY);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as SmartQuoteRequest[];
    if (!Array.isArray(parsed)) return [];
    return parsed;
  } catch {
    return [];
  }
}

export function saveSmartQuoteRequests(requests: SmartQuoteRequest[]) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(SMART_QUOTES_KEY, JSON.stringify(requests));
}

export function addSmartQuoteRequest(request: SmartQuoteRequest) {
  const current = getSmartQuoteRequests();
  saveSmartQuoteRequests([request, ...current]);
}

export function updateSmartQuoteRequest(
  id: string,
  patch: Partial<SmartQuoteRequest>,
) {
  const current = getSmartQuoteRequests();
  const next = current.map((item) => (item.id === id ? { ...item, ...patch } : item));
  saveSmartQuoteRequests(next);
  return next;
}

function toBackendPayload(request: SmartQuoteRequest) {
  return {
    id: request.id,
    clientName: request.clientName,
    whatsapp: request.phone,
    email: request.email,
    projectSize: request.size,
    bodyPlacement: request.zone,
    referenceNotes: request.notes,
    connectionAnswers: {
      referral: request.connectionAftercare,
      values: request.connectionValues,
      collaboration: request.connectionCollaboration,
      purpose: request.connectionPurpose,
    },
    collaborationMode: request.connectionCollaboration,
    advisoryMode: request.advisoryMode,
    advisoryScheduledAt: request.advisoryScheduledAt,
    advisoryBookingId: request.advisoryBookingId,
    style: request.style,
    estimateSessions: request.estimateSessions,
    estimatePerSession: request.estimatePerSession,
    estimateTotal: request.estimateTotal,
    statusLabel: request.status,
    createdAt: request.createdAt,
  };
}

/**
 * Persiste la solicitud en backend además del localStorage.
 * Si el backend falla, NO rompe la experiencia: el borrador queda en localStorage.
 */
export async function persistQuoteRequestToBackend(
  request: SmartQuoteRequest,
): Promise<boolean> {
  if (typeof window === "undefined") return false;
  try {
    const response = await fetch("/api/quote-requests", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(toBackendPayload(request)),
    });
    return response.ok;
  } catch {
    return false;
  }
}

/** Sincroniza un cambio de estado del admin con el backend (best-effort). */
export async function patchQuoteRequestStatusBackend(
  id: string,
  statusLabel: string,
): Promise<boolean> {
  if (typeof window === "undefined") return false;
  try {
    const response = await fetch(`/api/admin/quote-requests/${encodeURIComponent(id)}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: statusLabel }),
    });
    return response.ok;
  } catch {
    return false;
  }
}
