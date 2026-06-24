"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  CalendarDays,
  CircleDollarSign,
  Clock3,
  FileSignature,
  ImagePlus,
  LogOut,
  Plus,
  Send,
  UserRound,
} from "lucide-react";
import { AppShell } from "@/widgets/layout/AppShell";
import { Card } from "@/shared/ui/Card";
import { cn } from "@/shared/lib/cn";
import {
  addSmartQuoteRequest,
  getSmartQuoteRequests,
  patchQuoteRequestStatusBackend,
  persistQuoteRequestToBackend,
  type SmartQuoteRequest,
  type SmartQuoteStatus,
  updateSmartQuoteRequest,
} from "@/shared/lib/smartQuotes";
import {
  addDesignHistoryEntries,
  getDesignHistoryEntries,
  type DesignHistoryEntry,
  type DesignHistoryKind,
  type DesignTargetType,
} from "@/shared/lib/designHistory";
import { AdvisoryAgendaPanel } from "@/widgets/admin/AdvisoryAgendaPanel";

type ExternalProject = {
  id: string;
  client: string;
  project: string;
  sessionDate: string;
};

type AssetItem = {
  id: string;
  name: string;
  linkedTo: string;
};

const STATUS_STYLES: Record<SmartQuoteStatus, string> = {
  "Pendiente de Ajuste": "border-amber-500/30 bg-amber-500/10 text-amber-200",
  "Asesoría Agendada": "border-sky-500/30 bg-sky-500/10 text-sky-200",
  "Esperando Confirmacion":
    "border-sky-500/30 bg-sky-500/10 text-sky-200",
  Enviada: "border-amber-500/30 bg-amber-600/15 text-amber-100",
  "Pagada/Agendada": "border-emerald-500/30 bg-emerald-500/10 text-emerald-200",
  Descartada: "border-zinc-500/30 bg-zinc-500/10 text-zinc-300",
};

type QuoteRequestRecordLite = {
  id: string;
  createdAt: string;
  clientName: string;
  whatsapp: string;
  email: string;
  projectSize: string;
  bodyPlacement: string;
  referenceNotes?: string;
  style?: string;
  connectionAnswers?: {
    referral?: string;
    values?: string;
    collaboration?: string;
    purpose?: string;
  };
  advisoryMode?: "presencial" | "virtual";
  advisoryScheduledAt?: string;
  advisoryBookingId?: string;
  estimateSessions?: string;
  estimatePerSession?: string;
  estimateTotal?: string;
  statusLabel: string;
};

/** Mapea un registro persistido del backend al shape que usa el admin. */
function backendToSmartQuote(record: QuoteRequestRecordLite): SmartQuoteRequest {
  return {
    id: record.id,
    createdAt: record.createdAt,
    clientName: record.clientName,
    phone: record.whatsapp,
    email: record.email,
    size: record.projectSize,
    zone: record.bodyPlacement,
    style: record.style ?? "",
    notes: record.referenceNotes ?? "",
    connectionValues: record.connectionAnswers?.values,
    connectionCollaboration: record.connectionAnswers?.collaboration,
    connectionPurpose: record.connectionAnswers?.purpose,
    connectionAftercare: record.connectionAnswers?.referral,
    requiresAdvisory: Boolean(record.advisoryMode),
    advisoryMode: record.advisoryMode,
    advisoryScheduledAt: record.advisoryScheduledAt,
    advisoryBookingId: record.advisoryBookingId,
    estimateSessions: record.estimateSessions ?? "",
    estimatePerSession: record.estimatePerSession ?? "",
    estimateTotal: record.estimateTotal ?? "",
    status: (record.statusLabel as SmartQuoteStatus) ?? "Pendiente de Ajuste",
  };
}

/** Backend como fuente prioritaria; conserva solicitudes solo-locales sin duplicar por id. */
function mergeQuotes(
  backend: SmartQuoteRequest[],
  local: SmartQuoteRequest[],
): SmartQuoteRequest[] {
  const localById = new Map(local.map((quote) => [quote.id, quote]));
  const merged = backend.map((quote) => {
    const localQuote = localById.get(quote.id);
    if (!localQuote) return quote;
    return {
      ...quote,
      adminSessionPrice: localQuote.adminSessionPrice ?? quote.adminSessionPrice,
      adminSessionCount: localQuote.adminSessionCount ?? quote.adminSessionCount,
    };
  });
  const backendIds = new Set(backend.map((quote) => quote.id));
  const localOnly = local.filter((quote) => !backendIds.has(quote.id));
  return [...merged, ...localOnly].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

const CLIENT_CRM = [
  {
    name: "Sara O.",
    skinType: "Mixta / sensible",
    allergies: "Latex",
    sessions: "2 sesiones previas",
    lastDesign: "Floral black & grey",
  },
  {
    name: "Daniel R.",
    skinType: "Normal",
    allergies: "Sin registro",
    sessions: "Cliente nuevo",
    lastDesign: "Pendiente de primera sesión",
  },
];

const money = new Intl.NumberFormat("es-CO", {
  style: "currency",
  currency: "COP",
  maximumFractionDigits: 0,
});

function sanitizePhone(rawPhone: string) {
  return rawPhone.replace(/[^\d]/g, "");
}

function extractClosestSessions(text: string) {
  const nums = text.match(/\d+/g)?.map(Number) ?? [];
  if (!nums.length) return 1;
  if (nums.length === 1) return nums[0];
  return Math.round((nums[0] + nums[1]) / 2);
}

function estimateImageCard(
  quote: SmartQuoteRequest,
  sessionPrice: number,
  sessionsCount: number,
  total: number,
) {
  const canvas = document.createElement("canvas");
  canvas.width = 1200;
  canvas.height = 1600;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;

  const gradient = ctx.createLinearGradient(0, 0, 0, canvas.height);
  gradient.addColorStop(0, "#09090b");
  gradient.addColorStop(1, "#12101a");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  ctx.fillStyle = "rgba(245,158,11,0.25)";
  ctx.beginPath();
  ctx.arc(980, 140, 260, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = "#ffffff";
  ctx.font = "700 58px Montserrat, sans-serif";
  ctx.fillText("NEUTROTTT", 70, 120);

  ctx.fillStyle = "#c4b5fd";
  ctx.font = "600 36px Montserrat, sans-serif";
  ctx.fillText("Cotizacion Profesional", 70, 180);

  ctx.strokeStyle = "rgba(255,255,255,0.16)";
  ctx.strokeRect(60, 240, 1080, 1260);

  const rows = [
    `Cliente: ${quote.clientName}`,
    `Telefono: ${quote.phone}`,
    `Tamano: ${quote.size}`,
    `Zona: ${quote.zone}`,
    `Estilo: ${quote.style}`,
    `Sesiones: ${sessionsCount} (estimacion cercana)`,
    `Valor por sesion: ${money.format(sessionPrice)}`,
    `Total proyectado: ${money.format(total)}`,
    `Notas: ${quote.notes || "Sin notas adicionales"}`,
  ];

  let y = 320;
  ctx.fillStyle = "#e5e7eb";
  rows.forEach((line, index) => {
    ctx.font = index === 7 ? "700 40px Montserrat, sans-serif" : "500 34px Montserrat, sans-serif";
    ctx.fillText(line, 95, y);
    y += 118;
  });

  ctx.fillStyle = "rgba(255,255,255,0.65)";
  ctx.font = "500 28px Montserrat, sans-serif";
  ctx.fillText(
    `Generada: ${new Date().toLocaleString("es-CO", {
      dateStyle: "short",
      timeStyle: "short",
    })}`,
    95,
    1460,
  );

  return canvas.toDataURL("image/png");
}

async function shareImageIfPossible(dataUrl: string, filename: string, text: string) {
  const response = await fetch(dataUrl);
  const blob = await response.blob();
  const file = new File([blob], filename, { type: "image/png" });

  if (
    typeof navigator !== "undefined" &&
    "share" in navigator &&
    "canShare" in navigator &&
    navigator.canShare?.({ files: [file] })
  ) {
    await navigator.share({
      title: "Cotizacion Neutrottt",
      text,
      files: [file],
    });
    return true;
  }

  const link = document.createElement("a");
  link.href = dataUrl;
  link.download = filename;
  link.click();
  return false;
}

export function NeutrotttAdminDashboard() {
  const router = useRouter();
  const [quotes, setQuotes] = useState<SmartQuoteRequest[]>(() =>
    getSmartQuoteRequests(),
  );
  const [loggingOut, setLoggingOut] = useState(false);

  const handleLogout = async () => {
    if (loggingOut) return;
    setLoggingOut(true);
    try {
      await fetch("/api/admin/auth/logout", { method: "POST" });
    } catch {
      // Aun si falla la red, llevamos al usuario al login.
    }
    router.replace("/admin/login");
    router.refresh();
  };
  const [adjustments, setAdjustments] = useState<
    Record<string, { sessionPrice: number; sessionsCount: number }>
  >({});
  const [externalProjects, setExternalProjects] = useState<ExternalProject[]>([
    {
      id: "X-1",
      client: "Juan C.",
      project: "Lettering cuello (referido)",
      sessionDate: "2026-05-18",
    },
  ]);
  const [externalForm, setExternalForm] = useState({
    client: "",
    project: "",
    sessionDate: "",
  });
  const [assets, setAssets] = useState<AssetItem[]>([
    { id: "A-1", name: "dragon_sketch_v3.png", linkedTo: "Cliente: Laura M." },
    { id: "A-2", name: "flash_dark_rose.procreate", linkedTo: "Flash disponible" },
  ]);
  const [assetLink, setAssetLink] = useState({ target: "", mode: "Cliente" });
  const [quoteValue, setQuoteValue] = useState(900000);
  const [inkCost, setInkCost] = useState(90000);
  const [needleCost, setNeedleCost] = useState(65000);
  const [otherSupplies, setOtherSupplies] = useState(55000);
  const [selectedClient, setSelectedClient] = useState(CLIENT_CRM[0].name);
  const [lastConsentSent, setLastConsentSent] = useState<string>("");
  const [agendaVisible, setAgendaVisible] = useState(false);
  const [designHistory, setDesignHistory] = useState<DesignHistoryEntry[]>(() =>
    getDesignHistoryEntries(),
  );
  const [designForm, setDesignForm] = useState<{
    targetType: DesignTargetType;
    targetId: string;
    targetLabel: string;
    kind: DesignHistoryKind;
    notes: string;
  }>({
    targetType: "Cliente",
    targetId: "",
    targetLabel: "",
    kind: "Foto base",
    notes: "",
  });

  const pendingQuotes = useMemo(
    () => quotes.filter((q) => q.status !== "Pagada/Agendada").length,
    [quotes],
  );
  const designTargets = useMemo(() => {
    const clientTargets = quotes.map((quote) => ({
      id: quote.id,
      label: `${quote.clientName} (${quote.id})`,
      type: "Cliente" as const,
    }));
    const projectTargets = externalProjects.map((project) => ({
      id: project.id,
      label: `${project.project} (${project.client})`,
      type: "Proyecto" as const,
    }));
    return [...clientTargets, ...projectTargets];
  }, [quotes, externalProjects]);

  const totalSupplies = inkCost + needleCost + otherSupplies;
  const netProfit = quoteValue - totalSupplies;
  const margin = quoteValue > 0 ? (netProfit / quoteValue) * 100 : 0;

  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const response = await fetch("/api/admin/quote-requests", { cache: "no-store" });
        if (!response.ok) return;
        const data = (await response.json()) as { requests?: QuoteRequestRecordLite[] };
        if (!active || !Array.isArray(data.requests)) return;
        const backendQuotes = data.requests.map(backendToSmartQuote);
        setQuotes((prev) => mergeQuotes(backendQuotes, prev));
      } catch {
        // Backend opcional: si falla, el admin mantiene lo que haya en localStorage.
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  const updateAdjustment = (
    id: string,
    key: "sessionPrice" | "sessionsCount",
    value: number,
  ) => {
    const quote = quotes.find((q) => q.id === id);
    if (!quote) return;
    const defaultSessions = extractClosestSessions(quote.estimateSessions);
    setAdjustments((prev) => ({
      ...prev,
      [id]: {
        sessionPrice: prev[id]?.sessionPrice ?? quote.adminSessionPrice ?? 1_500_000,
        sessionsCount: prev[id]?.sessionsCount ?? quote.adminSessionCount ?? defaultSessions,
        [key]: value,
      },
    }));
  };

  const updateQuoteStatus = (id: string, status: SmartQuoteStatus) => {
    setQuotes((prev) => prev.map((quote) => (quote.id === id ? { ...quote, status } : quote)));
    updateSmartQuoteRequest(id, { status });
    void patchQuoteRequestStatusBackend(id, status);
  };

  const adjustAndSendWhatsApp = async (quote: SmartQuoteRequest) => {
    const adjusted = adjustments[quote.id];
    const sessionPrice = adjusted?.sessionPrice ?? quote.adminSessionPrice ?? 1_500_000;
    const sessionsCount =
      adjusted?.sessionsCount ??
      quote.adminSessionCount ??
      extractClosestSessions(quote.estimateSessions);
    const total = sessionPrice * sessionsCount;

    setQuotes((prev) =>
      prev.map((item) =>
        item.id === quote.id
          ? {
              ...item,
              adminSessionPrice: sessionPrice,
              adminSessionCount: sessionsCount,
              status: "Enviada",
            }
          : item,
      ),
    );
    updateSmartQuoteRequest(quote.id, {
      adminSessionPrice: sessionPrice,
      adminSessionCount: sessionsCount,
      status: "Enviada",
    });
    void patchQuoteRequestStatusBackend(quote.id, "Enviada");

    const shortMessage = `Hola ${quote.clientName}, espero que estes muy bien. Te comparto tu cotizacion profesional de Neutrottt: ${sessionsCount} sesiones aprox con un valor de ${money.format(sessionPrice)} por sesion (total ${money.format(total)}). Quedo atento para agendarte con toda la energia.`;

    const card = estimateImageCard(quote, sessionPrice, sessionsCount, total);
    if (card) {
      await shareImageIfPossible(card, `cotizacion-${quote.id}.png`, shortMessage);
    }

    const waLink = `https://wa.me/${sanitizePhone(quote.phone)}?text=${encodeURIComponent(shortMessage)}`;
    window.open(waLink, "_blank", "noopener,noreferrer");
  };

  const addExternalProject = () => {
    if (!externalForm.client || !externalForm.project || !externalForm.sessionDate) return;
    setExternalProjects((prev) => [
      {
        id: `X-${prev.length + 1}`,
        client: externalForm.client,
        project: externalForm.project,
        sessionDate: externalForm.sessionDate,
      },
      ...prev,
    ]);
    setExternalForm({ client: "", project: "", sessionDate: "" });
  };

  const uploadAssets = (files: FileList | null) => {
    if (!files?.length) return;
    const next = Array.from(files).map((file, index) => ({
      id: `A-${Date.now()}-${index}`,
      name: file.name,
      linkedTo: "Sin asignar",
    }));
    setAssets((prev) => [...next, ...prev]);
  };

  const linkLastAsset = () => {
    if (!assets.length || !assetLink.target.trim()) return;
    setAssets((prev) =>
      prev.map((asset, index) =>
        index === 0
          ? {
              ...asset,
              linkedTo:
                assetLink.mode === "Flash"
                  ? "Flash disponible"
                  : `Cliente: ${assetLink.target.trim()}`,
            }
          : asset,
      ),
    );
    setAssetLink({ target: "", mode: "Cliente" });
  };

  const addManualQuote = () => {
    const manual: SmartQuoteRequest = {
      id: `SQ-${Date.now()}`,
      createdAt: new Date().toISOString(),
      clientName: "Cliente manual",
      phone: "573000000000",
      email: "manual@cliente.com",
      size: "Mediano",
      zone: "Brazo",
      style: "Realismo oscuro",
      notes: "Proyecto fuera de cotizador",
      estimateSessions: "2 a 3 sesiones",
      estimatePerSession: "$1,5M - $1,8M COP",
      estimateTotal: "$3M - $5,4M COP",
      status: "Pendiente de Ajuste",
    };
    addSmartQuoteRequest(manual);
    setQuotes((prev) => mergeQuotes([], [manual, ...prev]));
    void persistQuoteRequestToBackend(manual);
  };

  const addFlashFromQuickAction = () => {
    setAssets((prev) => [
      {
        id: `A-${Date.now()}`,
        name: "nuevo_flash_manual.png",
        linkedTo: "Flash disponible",
      },
      ...prev,
    ]);
  };

  const handleDesignUpload = (files: FileList | null) => {
    if (!files?.length || !designForm.targetId || !designForm.targetLabel) return;
    const now = new Date().toISOString();
    const entries: DesignHistoryEntry[] = Array.from(files).map((file, index) => ({
      id: `DH-${Date.now()}-${index}`,
      createdAt: now,
      targetType: designForm.targetType,
      targetId: designForm.targetId,
      targetLabel: designForm.targetLabel,
      kind: designForm.kind,
      fileName: file.name,
      notes: designForm.notes.trim(),
    }));
    addDesignHistoryEntries(entries);
    setDesignHistory(getDesignHistoryEntries());
    setDesignForm((prev) => ({ ...prev, notes: "" }));
  };

  const sendConsent = () => {
    const date = new Date().toLocaleString("es-CO", {
      dateStyle: "short",
      timeStyle: "short",
    });
    setLastConsentSent(`${selectedClient} - ${date}`);
  };

  const sentQuotes = quotes.filter((quote) => quote.status === "Enviada").length;
  const bookedQuotes = quotes.filter((quote) => quote.status === "Pagada/Agendada").length;

  return (
    <AppShell>
      <div className="space-y-4 pb-2">
        <Card>
          <div className="flex items-start justify-between gap-3 p-4 sm:p-5">
            <div>
              <p className="text-[11px] font-semibold tracking-[0.18em] text-amber-200/80 uppercase">
                Vista Admin
              </p>
              <h1 className="mt-1 text-2xl font-semibold text-zinc-50 sm:text-3xl">
                Neutrottt Dash
              </h1>
              <p className="mt-2 text-sm text-zinc-300">
                Gestiona cotizaciones, flujo creativo del iPad y operación diaria
                desde una vista unificada y profesional.
              </p>
            </div>
            <button
              type="button"
              onClick={() => void handleLogout()}
              disabled={loggingOut}
              className="inline-flex shrink-0 items-center gap-1.5 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs font-semibold text-zinc-200 transition hover:bg-white/10 active:scale-[0.98] disabled:opacity-50"
            >
              <LogOut className="h-3.5 w-3.5" strokeWidth={1.5} />
              Cerrar sesión
            </button>
          </div>
        </Card>

        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <Card>
            <div className="p-3">
              <p className="text-[11px] text-zinc-400">Solicitudes</p>
              <p className="mt-1 text-xl font-semibold text-zinc-50">{pendingQuotes}</p>
            </div>
          </Card>
          <Card>
            <div className="p-3">
              <p className="text-[11px] text-zinc-400">Enviadas</p>
              <p className="mt-1 text-xl font-semibold text-zinc-50">{sentQuotes}</p>
            </div>
          </Card>
          <Card>
            <div className="p-3">
              <p className="text-[11px] text-zinc-400">Agendadas</p>
              <p className="mt-1 text-xl font-semibold text-zinc-50">{bookedQuotes}</p>
            </div>
          </Card>
          <Card>
            <div className="p-3">
              <p className="text-[11px] text-zinc-400">Margen actual</p>
              <p className="mt-1 text-xl font-semibold text-zinc-50">
                {margin.toFixed(1)}%
              </p>
            </div>
          </Card>
        </div>

        <Card>
          <div className="p-4 sm:p-5">
            <p className="text-xs font-semibold tracking-[0.14em] text-zinc-400 uppercase">
              Quick Actions
            </p>
            <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-4">
              <button
                onClick={addManualQuote}
                className="inline-flex items-center justify-center gap-2 rounded-xl border border-amber-500/30 bg-amber-600/15 px-3 py-2.5 text-sm font-semibold text-amber-100 transition hover:bg-amber-600/25"
              >
                <Plus className="h-4 w-4" /> Nueva Cotizacion
              </button>
              <button
                onClick={addFlashFromQuickAction}
                className="inline-flex items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3 py-2.5 text-sm font-semibold text-zinc-200 transition hover:bg-white/10"
              >
                <ImagePlus className="h-4 w-4" /> Subir Flash
              </button>
              <button
                onClick={() => setAgendaVisible((v) => !v)}
                className="inline-flex items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3 py-2.5 text-sm font-semibold text-zinc-200 transition hover:bg-white/10"
              >
                <CalendarDays className="h-4 w-4" /> Asesorías
              </button>
            </div>
          </div>
        </Card>

        {agendaVisible ? <AdvisoryAgendaPanel /> : null}

        <div className="grid gap-3 xl:grid-cols-[1.35fr_.95fr]">
          <div className="space-y-3">
            <Card>
              <div className="p-4 sm:p-5">
                <div className="flex items-center gap-2">
                  <CircleDollarSign className="h-4 w-4 text-amber-300" />
                  <h2 className="text-sm font-semibold text-zinc-50">
                    Cotizaciones Inteligentes
                  </h2>
                </div>
                <p className="mt-1 text-xs text-zinc-400">
                  Ajusta precio fijo por sesion, numero de sesiones y enviala por
                  WhatsApp en un clic.
                </p>

                <div className="mt-3 space-y-3">
                  {quotes.length ? (
                    quotes.map((quote) => {
                      const sessionsDefault =
                        quote.adminSessionCount ??
                        adjustments[quote.id]?.sessionsCount ??
                        extractClosestSessions(quote.estimateSessions);
                      const priceDefault =
                        quote.adminSessionPrice ??
                        adjustments[quote.id]?.sessionPrice ??
                        1_500_000;

                      return (
                        <div
                          key={quote.id}
                          className="rounded-xl border border-white/10 bg-white/[0.03] p-3"
                        >
                          <div className="flex flex-wrap items-start justify-between gap-2">
                            <div>
                              <p className="text-sm font-semibold text-zinc-100">
                                {quote.clientName} - {quote.id}
                              </p>
                              <p className="text-xs text-zinc-400">
                                {quote.phone} - {quote.email}
                              </p>
                            </div>
                            <span
                              className={cn(
                                "rounded-full border px-2 py-1 text-xs font-semibold",
                                STATUS_STYLES[quote.status],
                              )}
                            >
                              {quote.status}
                            </span>
                          </div>

                          <div className="mt-3 grid gap-2 rounded-lg border border-white/10 bg-black/30 p-3 text-xs text-zinc-300 sm:grid-cols-2">
                            <p>
                              Tamano: <span className="text-zinc-100">{quote.size}</span>
                            </p>
                            <p>
                              Zona: <span className="text-zinc-100">{quote.zone}</span>
                            </p>
                            <p>
                              Estilo: <span className="text-zinc-100">{quote.style}</span>
                            </p>
                            <p>
                              Estimado inicial:{" "}
                              <span className="text-zinc-100">{quote.estimateTotal}</span>
                            </p>
                            <p className="sm:col-span-2">
                              Notas:{" "}
                              <span className="text-zinc-100">
                                {quote.notes || "Sin notas"}
                              </span>
                            </p>
                            {quote.connectionAftercare ? (
                              <p>
                                Origen:{" "}
                                <span className="text-zinc-100">{quote.connectionAftercare}</span>
                              </p>
                            ) : null}
                            {quote.connectionValues ? (
                              <p className="sm:col-span-2">
                                Valores:{" "}
                                <span className="text-zinc-100">{quote.connectionValues}</span>
                              </p>
                            ) : null}
                            {quote.connectionCollaboration ? (
                              <p className="sm:col-span-2">
                                Ajustes:{" "}
                                <span className="text-zinc-100">
                                  {quote.connectionCollaboration}
                                </span>
                              </p>
                            ) : null}
                            {quote.connectionPurpose ? (
                              <p className="sm:col-span-2">
                                Nota de match:{" "}
                                <span className="text-zinc-100">{quote.connectionPurpose}</span>
                              </p>
                            ) : null}
                          </div>

                          <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                            <label className="rounded-lg border border-white/10 bg-black/30 px-2 py-2 text-xs text-zinc-300">
                              Precio fijo por sesion (COP)
                              <input
                                type="number"
                                value={priceDefault}
                                onChange={(event) =>
                                  updateAdjustment(
                                    quote.id,
                                    "sessionPrice",
                                    Number(event.target.value),
                                  )
                                }
                                className="mt-1 w-full bg-transparent text-sm font-semibold text-zinc-50 outline-none"
                              />
                            </label>
                            <label className="rounded-lg border border-white/10 bg-black/30 px-2 py-2 text-xs text-zinc-300">
                              Numero de sesiones
                              <input
                                type="number"
                                value={sessionsDefault}
                                onChange={(event) =>
                                  updateAdjustment(
                                    quote.id,
                                    "sessionsCount",
                                    Number(event.target.value),
                                  )
                                }
                                className="mt-1 w-full bg-transparent text-sm font-semibold text-zinc-50 outline-none"
                              />
                            </label>
                            <label className="rounded-lg border border-white/10 bg-black/30 px-2 py-2 text-xs text-zinc-300 sm:col-span-2 lg:col-span-1">
                              Estado
                              <select
                                value={quote.status}
                                onChange={(event) =>
                                  updateQuoteStatus(
                                    quote.id,
                                    event.target.value as SmartQuoteStatus,
                                  )
                                }
                                className="mt-1 w-full bg-transparent text-sm font-semibold text-zinc-50 outline-none"
                              >
                                {Object.keys(STATUS_STYLES).map((status) => (
                                  <option
                                    key={status}
                                    value={status}
                                    className="bg-zinc-900"
                                  >
                                    {status}
                                  </option>
                                ))}
                              </select>
                            </label>
                          </div>

                          <button
                            onClick={() => adjustAndSendWhatsApp(quote)}
                            className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-xl border border-amber-500/30 bg-amber-600/15 px-3 py-2.5 text-xs font-semibold text-amber-100 transition hover:bg-amber-600/25 sm:w-auto"
                          >
                            <Send className="h-3.5 w-3.5" /> Ajustar y enviar por
                            WhatsApp
                          </button>
                        </div>
                      );
                    })
                  ) : (
                    <p className="rounded-xl border border-white/10 bg-white/[0.03] p-4 text-sm text-zinc-400">
                      Aun no hay cotizaciones registradas. Completa una
                      cotizacion publica para verla aqui.
                    </p>
                  )}
                </div>
              </div>
            </Card>

            <Card>
              <div className="p-4 sm:p-5">
                <h2 className="text-sm font-semibold text-zinc-50">
                  Historial Creativo por Cliente/Proyecto
                </h2>
                <p className="mt-1 text-xs text-zinc-400">
                  Centraliza foto base, boceto iPad, propuestas y diseno final.
                </p>

                <div className="mt-3 grid gap-2 sm:grid-cols-2">
                  <label className="text-xs text-zinc-400">
                    Vincular a
                    <select
                      value={designForm.targetId}
                      onChange={(event) => {
                        const selected = designTargets.find(
                          (target) => target.id === event.target.value,
                        );
                        setDesignForm((prev) => ({
                          ...prev,
                          targetId: selected?.id ?? "",
                          targetLabel: selected?.label ?? "",
                          targetType: selected?.type ?? "Cliente",
                        }));
                      }}
                      className="mt-1 w-full rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm text-zinc-100 outline-none"
                    >
                      <option value="">Selecciona cliente o proyecto</option>
                      {designTargets.map((target) => (
                        <option key={target.id} value={target.id}>
                          {target.type}: {target.label}
                        </option>
                      ))}
                    </select>
                  </label>

                  <label className="text-xs text-zinc-400">
                    Tipo de archivo
                    <select
                      value={designForm.kind}
                      onChange={(event) =>
                        setDesignForm((prev) => ({
                          ...prev,
                          kind: event.target.value as DesignHistoryKind,
                        }))
                      }
                      className="mt-1 w-full rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm text-zinc-100 outline-none"
                    >
                      <option value="Foto base">Foto base</option>
                      <option value="Boceto iPad">Boceto iPad</option>
                      <option value="Propuesta">Propuesta</option>
                      <option value="Diseno final">Diseno final</option>
                    </select>
                  </label>
                </div>

                <textarea
                  value={designForm.notes}
                  onChange={(event) =>
                    setDesignForm((prev) => ({ ...prev, notes: event.target.value }))
                  }
                  placeholder="Notas del diseno, observaciones o cambios solicitados"
                  className="mt-2 w-full resize-none rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm text-zinc-100 outline-none placeholder:text-zinc-500"
                  rows={3}
                />

                <div className="mt-2 grid gap-2 sm:grid-cols-2">
                  <label className="inline-flex cursor-pointer items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3 py-2.5 text-sm font-semibold text-zinc-200 transition hover:bg-white/10">
                    <ImagePlus className="h-4 w-4" />
                    Subir desde iPad/galeria
                    <input
                      type="file"
                      accept="image/*"
                      multiple
                      className="hidden"
                      onChange={(event) => handleDesignUpload(event.target.files)}
                    />
                  </label>
                  <label className="inline-flex cursor-pointer items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3 py-2.5 text-sm font-semibold text-zinc-200 transition hover:bg-white/10">
                    <CalendarDays className="h-4 w-4" />
                    Tomar foto directa
                    <input
                      type="file"
                      accept="image/*"
                      capture="environment"
                      className="hidden"
                      onChange={(event) => handleDesignUpload(event.target.files)}
                    />
                  </label>
                </div>

                <div className="mt-3 space-y-2">
                  {designHistory.length ? (
                    designHistory.map((entry) => (
                      <div
                        key={entry.id}
                        className="rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2"
                      >
                        <p className="text-sm font-semibold text-zinc-100">
                          {entry.kind} - {entry.fileName}
                        </p>
                        <p className="text-xs text-zinc-400">
                          {entry.targetType}: {entry.targetLabel}
                        </p>
                        <p className="text-xs text-zinc-500">
                          {new Date(entry.createdAt).toLocaleString("es-CO")}
                        </p>
                        {entry.notes ? (
                          <p className="mt-1 text-xs text-zinc-300">{entry.notes}</p>
                        ) : null}
                      </div>
                    ))
                  ) : (
                    <p className="rounded-lg border border-white/10 bg-white/[0.03] px-3 py-3 text-sm text-zinc-400">
                      Todavia no hay disenos en historial.
                    </p>
                  )}
                </div>
              </div>
            </Card>
          </div>

          <div className="space-y-3">
            <Card>
              <div className="p-4 sm:p-5">
                <h2 className="text-sm font-semibold text-zinc-50">
                  Proyectos Externos
                </h2>
                <div className="mt-3 grid gap-2">
                  <input
                    placeholder="Cliente"
                    value={externalForm.client}
                    onChange={(event) =>
                      setExternalForm((prev) => ({ ...prev, client: event.target.value }))
                    }
                    className="rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm text-zinc-100 outline-none placeholder:text-zinc-500"
                  />
                  <input
                    placeholder="Proyecto"
                    value={externalForm.project}
                    onChange={(event) =>
                      setExternalForm((prev) => ({ ...prev, project: event.target.value }))
                    }
                    className="rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm text-zinc-100 outline-none placeholder:text-zinc-500"
                  />
                  <input
                    type="date"
                    value={externalForm.sessionDate}
                    onChange={(event) =>
                      setExternalForm((prev) => ({
                        ...prev,
                        sessionDate: event.target.value,
                      }))
                    }
                    className="rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm text-zinc-100 outline-none"
                  />
                  <button
                    onClick={addExternalProject}
                    className="inline-flex items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3 py-2.5 text-sm font-semibold text-zinc-100 transition hover:bg-white/10"
                  >
                    <Plus className="h-4 w-4" /> Crear Proyecto
                  </button>
                </div>

                <div className="mt-3 space-y-2">
                  {externalProjects.map((project) => (
                    <div
                      key={project.id}
                      className="rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2"
                    >
                      <p className="text-sm font-semibold text-zinc-100">{project.project}</p>
                      <p className="text-xs text-zinc-400">
                        {project.client} - {project.sessionDate}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            </Card>

            <Card>
              <div className="p-4 sm:p-5">
                <h2 className="text-sm font-semibold text-zinc-50">
                  Gestor de Assets (iPad)
                </h2>
                <label className="mt-3 flex cursor-pointer items-center justify-center gap-2 rounded-xl border border-dashed border-white/20 bg-white/[0.03] px-3 py-4 text-sm text-zinc-300 hover:bg-white/[0.06]">
                  <ImagePlus className="h-4 w-4" />
                  Cargar sketches, referencias o diseno final
                  <input
                    type="file"
                    multiple
                    className="hidden"
                    onChange={(event) => uploadAssets(event.target.files)}
                  />
                </label>
                <div className="mt-3 grid gap-2">
                  <input
                    placeholder="Nombre cliente o coleccion Flash"
                    value={assetLink.target}
                    onChange={(event) =>
                      setAssetLink((prev) => ({ ...prev, target: event.target.value }))
                    }
                    className="rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm text-zinc-100 outline-none placeholder:text-zinc-500"
                  />
                  <select
                    value={assetLink.mode}
                    onChange={(event) =>
                      setAssetLink((prev) => ({ ...prev, mode: event.target.value }))
                    }
                    className="rounded-lg border border-white/10 bg-black/40 px-3 py-2 text-sm text-zinc-100 outline-none"
                  >
                    <option value="Cliente">Cliente</option>
                    <option value="Flash">Flash</option>
                  </select>
                  <button
                    onClick={linkLastAsset}
                    className="inline-flex items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3 py-2.5 text-sm font-semibold text-zinc-100 transition hover:bg-white/10"
                  >
                    Vincular ultimo asset
                  </button>
                </div>

                <div className="mt-3 space-y-2">
                  {assets.map((asset) => (
                    <div
                      key={asset.id}
                      className="rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2"
                    >
                      <p className="text-sm font-medium text-zinc-100">{asset.name}</p>
                      <p className="text-xs text-zinc-400">{asset.linkedTo}</p>
                    </div>
                  ))}
                </div>
              </div>
            </Card>

            <Card>
              <div className="p-4 sm:p-5">
                <div className="flex items-center gap-2">
                  <UserRound className="h-4 w-4 text-amber-300" />
                  <h2 className="text-sm font-semibold text-zinc-50">CRM de Tatuajes</h2>
                </div>
                <div className="mt-3 space-y-2">
                  {CLIENT_CRM.map((client) => (
                    <div
                      key={client.name}
                      className="rounded-lg border border-white/10 bg-white/[0.03] px-3 py-3"
                    >
                      <p className="text-sm font-semibold text-zinc-100">{client.name}</p>
                      <p className="text-xs text-zinc-400">
                        Piel: {client.skinType} - Alergias: {client.allergies}
                      </p>
                      <p className="text-xs text-zinc-500">
                        {client.sessions} - Ultimo diseno: {client.lastDesign}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            </Card>

            <Card>
              <div className="p-4 sm:p-5">
                <div className="flex items-center gap-2">
                  <Clock3 className="h-4 w-4 text-amber-300" />
                  <h2 className="text-sm font-semibold text-zinc-50">
                    Calculadora de Rentabilidad
                  </h2>
                </div>
                <div className="mt-3 grid gap-2 sm:grid-cols-2">
                  <label className="text-xs text-zinc-400">
                    Valor cotizado
                    <input
                      type="number"
                      value={quoteValue}
                      onChange={(event) => setQuoteValue(Number(event.target.value))}
                      className="mt-1 w-full rounded-lg border border-white/10 bg-black/30 px-2 py-2 text-sm text-zinc-100 outline-none"
                    />
                  </label>
                  <label className="text-xs text-zinc-400">
                    Costo tintas
                    <input
                      type="number"
                      value={inkCost}
                      onChange={(event) => setInkCost(Number(event.target.value))}
                      className="mt-1 w-full rounded-lg border border-white/10 bg-black/30 px-2 py-2 text-sm text-zinc-100 outline-none"
                    />
                  </label>
                  <label className="text-xs text-zinc-400">
                    Costo agujas
                    <input
                      type="number"
                      value={needleCost}
                      onChange={(event) => setNeedleCost(Number(event.target.value))}
                      className="mt-1 w-full rounded-lg border border-white/10 bg-black/30 px-2 py-2 text-sm text-zinc-100 outline-none"
                    />
                  </label>
                  <label className="text-xs text-zinc-400">
                    Otros insumos
                    <input
                      type="number"
                      value={otherSupplies}
                      onChange={(event) => setOtherSupplies(Number(event.target.value))}
                      className="mt-1 w-full rounded-lg border border-white/10 bg-black/30 px-2 py-2 text-sm text-zinc-100 outline-none"
                    />
                  </label>
                </div>
                <div className="mt-3 rounded-xl border border-emerald-500/20 bg-emerald-500/10 p-3">
                  <p className="text-xs text-emerald-100/80">
                    Ganancia neta estimada: {money.format(netProfit)}
                  </p>
                  <p className="text-sm font-semibold text-emerald-100">
                    Margen: {margin.toFixed(1)}%
                  </p>
                </div>
              </div>
            </Card>

            <Card>
              <div className="p-4 sm:p-5">
                <div className="flex items-center gap-2">
                  <FileSignature className="h-4 w-4 text-amber-300" />
                  <h2 className="text-sm font-semibold text-zinc-50">
                    Consentimiento Digital
                  </h2>
                </div>
                <div className="mt-3 grid gap-2">
                  <select
                    value={selectedClient}
                    onChange={(event) => setSelectedClient(event.target.value)}
                    className="rounded-lg border border-white/10 bg-black/40 px-3 py-2 text-sm text-zinc-100 outline-none"
                  >
                    {CLIENT_CRM.map((client) => (
                      <option key={client.name} value={client.name}>
                        {client.name}
                      </option>
                    ))}
                  </select>
                  <button
                    onClick={sendConsent}
                    className="inline-flex items-center justify-center gap-2 rounded-xl border border-amber-500/30 bg-amber-600/15 px-3 py-2.5 text-sm font-semibold text-amber-100 transition hover:bg-amber-600/25"
                  >
                    <Send className="h-4 w-4" /> Enviar formulario legal
                  </button>
                </div>
                {lastConsentSent ? (
                  <p className="mt-2 text-xs text-zinc-400">
                    Ultimo consentimiento enviado: {lastConsentSent}
                  </p>
                ) : null}
              </div>
            </Card>
          </div>
        </div>
      </div>
    </AppShell>
  );
}
