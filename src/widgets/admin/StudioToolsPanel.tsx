"use client";

import { useEffect, useMemo, useState } from "react";
import {
  CalendarDays,
  Clock3,
  FileSignature,
  ImagePlus,
  Plus,
  Send,
} from "lucide-react";
import { Card } from "@/shared/ui/Card";
import {
  addDesignHistoryEntries,
  getDesignHistoryEntries,
  type DesignHistoryEntry,
  type DesignHistoryKind,
  type DesignTargetType,
} from "@/shared/lib/designHistory";
import { getSmartQuoteRequests, type SmartQuoteRequest } from "@/shared/lib/smartQuotes";
import { CrmPersonasPanel } from "@/widgets/admin/CrmPersonasPanel";
import { AdminPageHeader } from "@/widgets/admin/AdminPrimitives";
import {
  backendToSmartQuote,
  mergeQuotes,
  type QuoteRequestRecordLite,
} from "@/widgets/admin/adminQuotes";

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

const money = new Intl.NumberFormat("es-CO", {
  style: "currency",
  currency: "COP",
  maximumFractionDigits: 0,
});

export function StudioToolsPanel() {
  const [quotes, setQuotes] = useState<SmartQuoteRequest[]>(() => getSmartQuoteRequests());
  const [externalProjects, setExternalProjects] = useState<ExternalProject[]>([]);
  const [externalForm, setExternalForm] = useState({
    client: "",
    project: "",
    sessionDate: "",
  });
  const [assets, setAssets] = useState<AssetItem[]>([]);
  const [assetLink, setAssetLink] = useState({ target: "", mode: "Cliente" });
  const [quoteValue, setQuoteValue] = useState(900000);
  const [inkCost, setInkCost] = useState(90000);
  const [needleCost, setNeedleCost] = useState(65000);
  const [otherSupplies, setOtherSupplies] = useState(55000);
  const [selectedClient, setSelectedClient] = useState("");
  const [lastConsentSent, setLastConsentSent] = useState("");
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
        setQuotes((prev) => mergeQuotes(data.requests!.map(backendToSmartQuote), prev));
      } catch {
        // El taller sigue con lo que haya en local.
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!selectedClient && quotes[0]?.clientName) {
      setSelectedClient(quotes[0].clientName);
    }
  }, [quotes, selectedClient]);

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

  return (
    <div className="space-y-6">
      <AdminPageHeader
        kicker="Taller"
        title="Estudio"
        description="Herramientas de operación interna: historial creativo, personas, insumos y consentimiento. Lo comercial vive en Cotizaciones y Asesorías."
      />

      <div className="grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
        <div className="space-y-4">
          <Card>
            <div className="p-4 sm:p-5">
              <h2 className="text-sm font-semibold text-zinc-50">Historial creativo</h2>
              <p className="mt-1 text-xs text-zinc-400">
                Foto base, boceto, propuesta y diseño final por cliente o proyecto.
              </p>
              <div className="mt-3 grid gap-2 sm:grid-cols-2">
                <label className="flex flex-col gap-2 text-xs text-zinc-400">
                  Vincular a
                  <select
                    value={designForm.targetId}
                    onChange={(event) => {
                      const selected = designTargets.find((target) => target.id === event.target.value);
                      setDesignForm((prev) => ({
                        ...prev,
                        targetId: selected?.id ?? "",
                        targetLabel: selected?.label ?? "",
                        targetType: selected?.type ?? "Cliente",
                      }));
                    }}
                    className="rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm text-zinc-100 outline-none"
                  >
                    <option value="">Selecciona cliente o proyecto</option>
                    {designTargets.map((target) => (
                      <option key={target.id} value={target.id}>
                        {target.type}: {target.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="flex flex-col gap-2 text-xs text-zinc-400">
                  Tipo de archivo
                  <select
                    value={designForm.kind}
                    onChange={(event) =>
                      setDesignForm((prev) => ({
                        ...prev,
                        kind: event.target.value as DesignHistoryKind,
                      }))
                    }
                    className="rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm text-zinc-100 outline-none"
                  >
                    <option value="Foto base">Foto base</option>
                    <option value="Boceto iPad">Boceto iPad</option>
                    <option value="Propuesta">Propuesta</option>
                    <option value="Diseno final">Diseño final</option>
                  </select>
                </label>
              </div>
              <textarea
                value={designForm.notes}
                onChange={(event) =>
                  setDesignForm((prev) => ({ ...prev, notes: event.target.value }))
                }
                placeholder="Notas del diseño, observaciones o cambios"
                className="mt-2 w-full resize-none rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm text-zinc-100 outline-none placeholder:text-zinc-500"
                rows={3}
              />
              <div className="mt-2 grid gap-2 sm:grid-cols-2">
                <label className="inline-flex cursor-pointer items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3 py-2.5 text-sm font-semibold text-zinc-200 transition hover:bg-white/10 active:scale-[0.98]">
                  <ImagePlus className="h-4 w-4" />
                  Subir desde galería
                  <input
                    type="file"
                    accept="image/*"
                    multiple
                    className="hidden"
                    onChange={(event) => handleDesignUpload(event.target.files)}
                  />
                </label>
                <label className="inline-flex cursor-pointer items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3 py-2.5 text-sm font-semibold text-zinc-200 transition hover:bg-white/10 active:scale-[0.98]">
                  <CalendarDays className="h-4 w-4" />
                  Tomar foto
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
                    <div key={entry.id} className="rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2">
                      <p className="text-sm font-semibold text-zinc-100">
                        {entry.kind} · {entry.fileName}
                      </p>
                      <p className="text-xs text-zinc-400">
                        {entry.targetType}: {entry.targetLabel}
                      </p>
                      {entry.notes ? <p className="mt-1 text-xs text-zinc-300">{entry.notes}</p> : null}
                    </div>
                  ))
                ) : (
                  <p className="text-sm text-zinc-500">Todavía no hay diseños en historial.</p>
                )}
              </div>
            </div>
          </Card>

          <CrmPersonasPanel />
        </div>

        <div className="space-y-4">
          <Card>
            <div className="p-4 sm:p-5">
              <h2 className="text-sm font-semibold text-zinc-50">Proyectos externos</h2>
              <div className="mt-3 grid gap-2">
                <label className="flex flex-col gap-2 text-xs text-zinc-400">
                  Cliente
                  <input
                    value={externalForm.client}
                    onChange={(event) =>
                      setExternalForm((prev) => ({ ...prev, client: event.target.value }))
                    }
                    className="rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm text-zinc-100 outline-none"
                  />
                </label>
                <label className="flex flex-col gap-2 text-xs text-zinc-400">
                  Proyecto
                  <input
                    value={externalForm.project}
                    onChange={(event) =>
                      setExternalForm((prev) => ({ ...prev, project: event.target.value }))
                    }
                    className="rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm text-zinc-100 outline-none"
                  />
                </label>
                <label className="flex flex-col gap-2 text-xs text-zinc-400">
                  Fecha de sesión
                  <input
                    type="date"
                    value={externalForm.sessionDate}
                    onChange={(event) =>
                      setExternalForm((prev) => ({ ...prev, sessionDate: event.target.value }))
                    }
                    className="rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm text-zinc-100 outline-none"
                  />
                </label>
                <button
                  type="button"
                  onClick={addExternalProject}
                  className="inline-flex items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3 py-2.5 text-sm font-semibold text-zinc-100 transition hover:bg-white/10 active:scale-[0.98]"
                >
                  <Plus className="h-4 w-4" /> Crear proyecto
                </button>
              </div>
              <div className="mt-3 space-y-2">
                {externalProjects.map((project) => (
                  <div key={project.id} className="rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2">
                    <p className="text-sm font-semibold text-zinc-100">{project.project}</p>
                    <p className="text-xs text-zinc-400">
                      {project.client} · {project.sessionDate}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          </Card>

          <Card>
            <div className="p-4 sm:p-5">
              <h2 className="text-sm font-semibold text-zinc-50">Archivos</h2>
              <label className="mt-3 flex cursor-pointer items-center justify-center gap-2 rounded-xl border border-dashed border-white/20 bg-white/[0.03] px-3 py-4 text-sm text-zinc-300 hover:bg-white/[0.06]">
                <ImagePlus className="h-4 w-4" />
                Cargar sketches, referencias o diseño final
                <input
                  type="file"
                  multiple
                  className="hidden"
                  onChange={(event) => uploadAssets(event.target.files)}
                />
              </label>
              <div className="mt-3 grid gap-2">
                <label className="flex flex-col gap-2 text-xs text-zinc-400">
                  Nombre de cliente o colección Flash
                  <input
                    value={assetLink.target}
                    onChange={(event) =>
                      setAssetLink((prev) => ({ ...prev, target: event.target.value }))
                    }
                    className="rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm text-zinc-100 outline-none"
                  />
                </label>
                <label className="flex flex-col gap-2 text-xs text-zinc-400">
                  Vincular como
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
                </label>
                <button
                  type="button"
                  onClick={linkLastAsset}
                  className="inline-flex items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3 py-2.5 text-sm font-semibold text-zinc-100 transition hover:bg-white/10 active:scale-[0.98]"
                >
                  Vincular último archivo
                </button>
              </div>
              <div className="mt-3 space-y-2">
                {assets.map((asset) => (
                  <div key={asset.id} className="rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2">
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
                <Clock3 className="h-4 w-4 text-amber-300" />
                <h2 className="text-sm font-semibold text-zinc-50">Rentabilidad</h2>
              </div>
              <div className="mt-3 grid gap-2 sm:grid-cols-2">
                <label className="flex flex-col gap-2 text-xs text-zinc-400">
                  Valor cotizado
                  <input
                    type="number"
                    value={quoteValue}
                    onChange={(event) => setQuoteValue(Number(event.target.value))}
                    className="rounded-lg border border-white/10 bg-black/30 px-2 py-2 text-sm text-zinc-100 outline-none"
                  />
                </label>
                <label className="flex flex-col gap-2 text-xs text-zinc-400">
                  Costo tintas
                  <input
                    type="number"
                    value={inkCost}
                    onChange={(event) => setInkCost(Number(event.target.value))}
                    className="rounded-lg border border-white/10 bg-black/30 px-2 py-2 text-sm text-zinc-100 outline-none"
                  />
                </label>
                <label className="flex flex-col gap-2 text-xs text-zinc-400">
                  Costo agujas
                  <input
                    type="number"
                    value={needleCost}
                    onChange={(event) => setNeedleCost(Number(event.target.value))}
                    className="rounded-lg border border-white/10 bg-black/30 px-2 py-2 text-sm text-zinc-100 outline-none"
                  />
                </label>
                <label className="flex flex-col gap-2 text-xs text-zinc-400">
                  Otros insumos
                  <input
                    type="number"
                    value={otherSupplies}
                    onChange={(event) => setOtherSupplies(Number(event.target.value))}
                    className="rounded-lg border border-white/10 bg-black/30 px-2 py-2 text-sm text-zinc-100 outline-none"
                  />
                </label>
              </div>
              <div className="mt-3 rounded-xl border border-emerald-500/20 bg-emerald-500/10 p-3">
                <p className="text-xs text-emerald-100/80">
                  Ganancia neta estimada: {money.format(netProfit)}
                </p>
                <p className="text-sm font-semibold text-emerald-100">Margen: {margin.toFixed(1)}%</p>
              </div>
            </div>
          </Card>

          <Card>
            <div className="p-4 sm:p-5">
              <div className="flex items-center gap-2">
                <FileSignature className="h-4 w-4 text-amber-300" />
                <h2 className="text-sm font-semibold text-zinc-50">Consentimiento digital</h2>
              </div>
              <div className="mt-3 grid gap-2">
                <label className="flex flex-col gap-2 text-xs text-zinc-400">
                  Cliente
                  <select
                    value={selectedClient}
                    onChange={(event) => setSelectedClient(event.target.value)}
                    className="rounded-lg border border-white/10 bg-black/40 px-3 py-2 text-sm text-zinc-100 outline-none"
                  >
                    {quotes.length === 0 ? (
                      <option value="">Sin contactos aún</option>
                    ) : (
                      quotes.map((quote) => (
                        <option key={quote.id} value={quote.clientName}>
                          {quote.clientName}
                        </option>
                      ))
                    )}
                  </select>
                </label>
                <button
                  type="button"
                  onClick={sendConsent}
                  className="inline-flex items-center justify-center gap-2 rounded-xl border border-amber-500/30 bg-amber-600/15 px-3 py-2.5 text-sm font-semibold text-amber-100 transition hover:bg-amber-600/25 active:scale-[0.98]"
                >
                  <Send className="h-4 w-4" /> Enviar formulario legal
                </button>
              </div>
              {lastConsentSent ? (
                <p className="mt-2 text-xs text-zinc-400">Último envío: {lastConsentSent}</p>
              ) : null}
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
