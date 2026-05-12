"use client";

import { useMemo, useState } from "react";
import {
  CalendarDays,
  CircleDollarSign,
  Clock3,
  FileSignature,
  ImagePlus,
  MessageSquareShare,
  Plus,
  Send,
  UserRound,
} from "lucide-react";
import { AppShell } from "@/widgets/layout/AppShell";
import { Card } from "@/shared/ui/Card";
import { cn } from "@/shared/lib/cn";

type QuoteStatus =
  | "Pendiente de Ajuste"
  | "Esperando Confirmacion"
  | "Enviada"
  | "Pagada/Agendada";

type QuoteRequest = {
  id: string;
  client: string;
  idea: string;
  proposedPrice: number;
  proposedHours: number;
  status: QuoteStatus;
};

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

const STATUS_STYLES: Record<QuoteStatus, string> = {
  "Pendiente de Ajuste": "border-amber-500/30 bg-amber-500/10 text-amber-200",
  "Esperando Confirmacion":
    "border-sky-500/30 bg-sky-500/10 text-sky-200",
  Enviada: "border-violet-500/30 bg-violet-600/15 text-violet-100",
  "Pagada/Agendada": "border-emerald-500/30 bg-emerald-500/10 text-emerald-200",
};

const INITIAL_QUOTES: QuoteRequest[] = [
  {
    id: "Q-301",
    client: "Sara O.",
    idea: "Rosa oscura en antebrazo",
    proposedPrice: 540000,
    proposedHours: 4,
    status: "Pendiente de Ajuste",
  },
  {
    id: "Q-302",
    client: "Daniel R.",
    idea: "Blackwork geométrico pecho",
    proposedPrice: 980000,
    proposedHours: 7,
    status: "Esperando Confirmacion",
  },
  {
    id: "Q-303",
    client: "Laura M.",
    idea: "Cover-up realista de hombro",
    proposedPrice: 1200000,
    proposedHours: 9,
    status: "Enviada",
  },
];

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

export function MalianteoAdminDashboard() {
  const [quotes, setQuotes] = useState<QuoteRequest[]>(INITIAL_QUOTES);
  const [adjustments, setAdjustments] = useState<
    Record<string, { price: number; hours: number }>
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
  const [remindersSent, setRemindersSent] = useState(0);

  const pendingQuotes = useMemo(
    () => quotes.filter((q) => q.status !== "Pagada/Agendada").length,
    [quotes],
  );

  const totalSupplies = inkCost + needleCost + otherSupplies;
  const netProfit = quoteValue - totalSupplies;
  const margin = quoteValue > 0 ? (netProfit / quoteValue) * 100 : 0;

  const updateAdjustment = (id: string, key: "price" | "hours", value: number) => {
    setAdjustments((prev) => ({
      ...prev,
      [id]: {
        price: prev[id]?.price ?? quotes.find((q) => q.id === id)?.proposedPrice ?? 0,
        hours: prev[id]?.hours ?? quotes.find((q) => q.id === id)?.proposedHours ?? 0,
        [key]: value,
      },
    }));
  };

  const adjustAndSend = (id: string) => {
    setQuotes((prev) =>
      prev.map((quote) => {
        if (quote.id !== id) return quote;
        const adjusted = adjustments[id];
        return {
          ...quote,
          proposedPrice: adjusted?.price ?? quote.proposedPrice,
          proposedHours: adjusted?.hours ?? quote.proposedHours,
          status: "Enviada",
        };
      }),
    );
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
    setQuotes((prev) => [
      {
        id: `Q-${400 + prev.length}`,
        client: "Cliente manual",
        idea: "Proyecto fuera de cotizador",
        proposedPrice: 650000,
        proposedHours: 5,
        status: "Pendiente de Ajuste",
      },
      ...prev,
    ]);
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

  const sendConsent = () => {
    const date = new Date().toLocaleString("es-CO", {
      dateStyle: "short",
      timeStyle: "short",
    });
    setLastConsentSent(`${selectedClient} - ${date}`);
  };

  return (
    <AppShell>
      <div className="space-y-4">
        <header className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-xs font-semibold tracking-[0.18em] text-violet-200/70 uppercase">
              Vista Admin
            </p>
            <h1 className="mt-1 text-2xl font-semibold text-zinc-50">
              Malianteo Dash
            </h1>
            <p className="mt-2 max-w-2xl text-sm text-zinc-300">
              Centro operativo para cotizaciones, agenda, activos creativos y
              seguimiento del cliente en una sola vista.
            </p>
          </div>
        </header>

        <Card>
          <div className="p-4">
            <p className="text-xs font-semibold tracking-[0.16em] text-zinc-400 uppercase">
              Quick actions
            </p>
            <div className="mt-3 grid gap-2 md:grid-cols-2 xl:grid-cols-4">
              <button
                onClick={addManualQuote}
                className="inline-flex items-center justify-center gap-2 rounded-xl border border-violet-500/30 bg-violet-600/15 px-3 py-2 text-sm font-semibold text-violet-100 transition hover:bg-violet-600/25"
              >
                <Plus className="h-4 w-4" /> Nueva Cotizacion Manual
              </button>
              <button
                onClick={addFlashFromQuickAction}
                className="inline-flex items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm font-semibold text-zinc-200 transition hover:bg-white/10"
              >
                <ImagePlus className="h-4 w-4" /> Subir Diseno Flash
              </button>
              <button
                onClick={() => setAgendaVisible((v) => !v)}
                className="inline-flex items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm font-semibold text-zinc-200 transition hover:bg-white/10"
              >
                <CalendarDays className="h-4 w-4" /> Ver Agenda del Dia
              </button>
              <button
                onClick={() => setRemindersSent((n) => n + 1)}
                className="inline-flex items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm font-semibold text-zinc-200 transition hover:bg-white/10"
              >
                <MessageSquareShare className="h-4 w-4" /> Enviar Recordatorio
              </button>
            </div>
            <div className="mt-2 text-xs text-zinc-400">
              Recordatorios enviados hoy: {remindersSent}
            </div>
          </div>
        </Card>

        <div className="grid gap-3 md:grid-cols-3">
          <Card>
            <div className="p-4">
              <p className="text-xs text-zinc-400">Solicitudes activas</p>
              <p className="mt-1 text-2xl font-semibold text-zinc-50">{pendingQuotes}</p>
            </div>
          </Card>
          <Card>
            <div className="p-4">
              <p className="text-xs text-zinc-400">Rentabilidad actual</p>
              <p className="mt-1 text-2xl font-semibold text-zinc-50">
                {margin.toFixed(1)}%
              </p>
            </div>
          </Card>
          <Card>
            <div className="p-4">
              <p className="text-xs text-zinc-400">Agenda del dia</p>
              <p className="mt-1 text-2xl font-semibold text-zinc-50">
                {agendaVisible ? "Visible" : "Oculta"}
              </p>
            </div>
          </Card>
        </div>

        {agendaVisible ? (
          <Card>
            <div className="p-4">
              <h2 className="text-sm font-semibold text-zinc-50">Agenda de hoy</h2>
              <div className="mt-3 space-y-2 text-sm text-zinc-300">
                <p>10:00 - Revision diseno Laura M.</p>
                <p>13:00 - Sesion 1 blackwork Daniel R.</p>
                <p>16:30 - Follow-up cicatrizacion Sara O.</p>
              </div>
            </div>
          </Card>
        ) : null}

        <Card>
          <div className="p-4">
            <div className="flex items-center gap-2">
              <CircleDollarSign className="h-4 w-4 text-violet-300" />
              <h2 className="text-sm font-semibold text-zinc-50">
                Gestion de Cotizaciones Inteligentes
              </h2>
            </div>
            <div className="mt-3 space-y-3">
              {quotes.map((quote) => (
                <div
                  key={quote.id}
                  className="rounded-xl border border-white/10 bg-white/[0.03] p-3"
                >
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <p className="text-sm font-semibold text-zinc-100">
                        {quote.client} - {quote.id}
                      </p>
                      <p className="text-xs text-zinc-400">{quote.idea}</p>
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

                  <div className="mt-3 grid gap-2 md:grid-cols-3">
                    <label className="rounded-lg border border-white/10 bg-black/30 px-2 py-2 text-xs text-zinc-300">
                      Precio (COP)
                      <input
                        type="number"
                        value={adjustments[quote.id]?.price ?? quote.proposedPrice}
                        onChange={(event) =>
                          updateAdjustment(quote.id, "price", Number(event.target.value))
                        }
                        className="mt-1 w-full bg-transparent text-sm font-semibold text-zinc-50 outline-none"
                      />
                    </label>
                    <label className="rounded-lg border border-white/10 bg-black/30 px-2 py-2 text-xs text-zinc-300">
                      Tiempo (horas)
                      <input
                        type="number"
                        value={adjustments[quote.id]?.hours ?? quote.proposedHours}
                        onChange={(event) =>
                          updateAdjustment(quote.id, "hours", Number(event.target.value))
                        }
                        className="mt-1 w-full bg-transparent text-sm font-semibold text-zinc-50 outline-none"
                      />
                    </label>
                    <label className="rounded-lg border border-white/10 bg-black/30 px-2 py-2 text-xs text-zinc-300">
                      Estado
                      <select
                        value={quote.status}
                        onChange={(event) =>
                          setQuotes((prev) =>
                            prev.map((item) =>
                              item.id === quote.id
                                ? {
                                    ...item,
                                    status: event.target.value as QuoteStatus,
                                  }
                                : item,
                            ),
                          )
                        }
                        className="mt-1 w-full bg-transparent text-sm font-semibold text-zinc-50 outline-none"
                      >
                        {Object.keys(STATUS_STYLES).map((status) => (
                          <option key={status} value={status} className="bg-zinc-900">
                            {status}
                          </option>
                        ))}
                      </select>
                    </label>
                  </div>

                  <div className="mt-3 flex justify-end">
                    <button
                      onClick={() => adjustAndSend(quote.id)}
                      className="inline-flex items-center gap-2 rounded-xl border border-violet-500/30 bg-violet-600/15 px-3 py-2 text-xs font-semibold text-violet-100 transition hover:bg-violet-600/25"
                    >
                      <Send className="h-3.5 w-3.5" /> Ajustar y Enviar
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </Card>

        <div className="grid gap-3 xl:grid-cols-2">
          <Card>
            <div className="p-4">
              <h2 className="text-sm font-semibold text-zinc-50">
                Fuera de Plataforma (Proyectos Externos)
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
                  className="inline-flex items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm font-semibold text-zinc-100 transition hover:bg-white/10"
                >
                  <Plus className="h-4 w-4" /> Crear Proyecto Externo
                </button>
              </div>

              <div className="mt-3 space-y-2">
                {externalProjects.map((project) => (
                  <div
                    key={project.id}
                    className="rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 text-sm"
                  >
                    <p className="font-semibold text-zinc-100">{project.project}</p>
                    <p className="text-xs text-zinc-400">
                      {project.client} - {project.sessionDate}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          </Card>

          <Card>
            <div className="p-4">
              <h2 className="text-sm font-semibold text-zinc-50">
                Integracion Creativa (iPad Workflow)
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

              <div className="mt-3 grid gap-2 md:grid-cols-[1fr_auto]">
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
              </div>
              <button
                onClick={linkLastAsset}
                className="mt-2 inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs font-semibold text-zinc-100 transition hover:bg-white/10"
              >
                Vincular ultimo asset
              </button>

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
        </div>

        <div className="grid gap-3 xl:grid-cols-2">
          <Card>
            <div className="p-4">
              <div className="flex items-center gap-2">
                <UserRound className="h-4 w-4 text-violet-300" />
                <h2 className="text-sm font-semibold text-zinc-50">CRM de Tatuajes</h2>
              </div>
              <div className="mt-3 space-y-2">
                {CLIENT_CRM.map((client) => (
                  <div
                    key={client.name}
                    className="rounded-lg border border-white/10 bg-white/[0.03] px-3 py-3 text-sm"
                  >
                    <p className="font-semibold text-zinc-100">{client.name}</p>
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
            <div className="p-4">
              <div className="flex items-center gap-2">
                <Clock3 className="h-4 w-4 text-violet-300" />
                <h2 className="text-sm font-semibold text-zinc-50">
                  Calculadora de Rentabilidad
                </h2>
              </div>
              <div className="mt-3 grid gap-2 md:grid-cols-2">
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
        </div>

        <Card>
          <div className="p-4">
            <div className="flex items-center gap-2">
              <FileSignature className="h-4 w-4 text-violet-300" />
              <h2 className="text-sm font-semibold text-zinc-50">
                Consentimiento Digital
              </h2>
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-2">
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
                className="inline-flex items-center gap-2 rounded-xl border border-violet-500/30 bg-violet-600/15 px-3 py-2 text-sm font-semibold text-violet-100 transition hover:bg-violet-600/25"
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
    </AppShell>
  );
}
