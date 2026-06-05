export type SmartQuoteStatus =
  | "Pendiente de Ajuste"
  | "Asesoría Agendada"
  | "Esperando Confirmacion"
  | "Enviada"
  | "Pagada/Agendada";

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
