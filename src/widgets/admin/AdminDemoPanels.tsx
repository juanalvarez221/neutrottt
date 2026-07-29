"use client";

import { useCallback, useEffect, useState } from "react";
import { Bell, RefreshCw, ShoppingBag } from "lucide-react";
import { Card } from "@/shared/ui/Card";
import type { SmartQuoteStatus } from "@/shared/lib/smartQuotes";

type SimulatedNotification = {
  id: string;
  createdAt: string;
  kind: string;
  subject: string;
  title: string;
  body: string;
};

type ShopOrder = {
  id: string;
  createdAt: string;
  name: string;
  email: string;
  phone: string;
  city: string;
  total: number;
  status: string;
  items: Array<{ productId: string; quantity: number; title: string }>;
};

const SHOP_STATUSES = [
  "Pendiente de Ajuste",
  "Enviada",
  "Pagada/Agendada",
  "Descartada",
] as const;

export function AdminDemoPanels() {
  const [tab, setTab] = useState<"notifications" | "orders">("notifications");
  const [notifications, setNotifications] = useState<SimulatedNotification[]>([]);
  const [orders, setOrders] = useState<ShopOrder[]>([]);
  const [loading, setLoading] = useState(false);

  const loadNotifications = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/notifications", { credentials: "include" });
      if (!res.ok) return;
      const data = (await res.json()) as { items?: SimulatedNotification[] };
      setNotifications(Array.isArray(data.items) ? data.items : []);
    } finally {
      setLoading(false);
    }
  }, []);

  const loadOrders = useCallback(() => {
    try {
      const raw = window.sessionStorage.getItem("danniel_shop_orders");
      const parsed = raw ? (JSON.parse(raw) as ShopOrder[]) : [];
      setOrders(Array.isArray(parsed) ? parsed : []);
    } catch {
      setOrders([]);
    }
  }, []);

  useEffect(() => {
    void loadNotifications();
    loadOrders();
  }, [loadNotifications, loadOrders]);

  const seedNotification = async () => {
    await fetch("/api/admin/notifications", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        subject: "Demo · notificación interna",
        title: "Prueba de flujo",
        body: "Notificación simulada para demos del admin.",
      }),
    });
    await loadNotifications();
  };

  const updateOrderStatus = (id: string, status: string) => {
    const next = orders.map((order) => (order.id === id ? { ...order, status } : order));
    setOrders(next);
    window.sessionStorage.setItem("danniel_shop_orders", JSON.stringify(next));
  };

  return (
    <Card>
      <div className="p-4 sm:p-5">
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setTab("notifications")}
            className={`inline-flex items-center gap-2 border px-3 py-2 text-xs font-semibold ${
              tab === "notifications"
                ? "border-amber-500/30 bg-amber-600/15 text-amber-100"
                : "border-white/10 bg-white/5 text-zinc-300"
            }`}
          >
            <Bell className="h-3.5 w-3.5" strokeWidth={1.75} />
            Notificaciones
          </button>
          <button
            type="button"
            onClick={() => {
              setTab("orders");
              loadOrders();
            }}
            className={`inline-flex items-center gap-2 border px-3 py-2 text-xs font-semibold ${
              tab === "orders"
                ? "border-amber-500/30 bg-amber-600/15 text-amber-100"
                : "border-white/10 bg-white/5 text-zinc-300"
            }`}
          >
            <ShoppingBag className="h-3.5 w-3.5" strokeWidth={1.75} />
            Órdenes tienda
          </button>
          <button
            type="button"
            onClick={() => {
              void loadNotifications();
              loadOrders();
            }}
            className="ml-auto inline-flex items-center gap-2 border border-white/10 px-3 py-2 text-xs text-zinc-400"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} strokeWidth={1.75} />
            Actualizar
          </button>
        </div>

        {tab === "notifications" ? (
          <div className="mt-4 space-y-3">
            <button
              type="button"
              onClick={() => void seedNotification()}
              className="text-xs font-semibold text-amber-200 underline-offset-2 hover:underline"
            >
              Crear notificación de prueba
            </button>
            {notifications.length === 0 ? (
              <p className="text-sm text-zinc-500">
                Sin notificaciones simuladas todavía. Llegan al cotizar/agendar, o crea una de prueba.
              </p>
            ) : (
              <ul className="max-h-[28rem] space-y-3 overflow-y-auto">
                {notifications.map((item) => (
                  <li key={item.id} className="border border-white/10 bg-black/20 p-3">
                    <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-zinc-500">
                      {item.kind} · {new Date(item.createdAt).toLocaleString("es-CO")}
                    </p>
                    <p className="mt-1 text-sm font-semibold text-zinc-100">{item.subject}</p>
                    <pre className="mt-2 whitespace-pre-wrap font-sans text-xs leading-relaxed text-zinc-400">
                      {item.body}
                    </pre>
                  </li>
                ))}
              </ul>
            )}
          </div>
        ) : (
          <div className="mt-4 space-y-3">
            <p className="text-xs text-zinc-500">
              Órdenes del checkout simulado (sessionStorage). Cambia el estado para demos.
            </p>
            {orders.length === 0 ? (
              <p className="text-sm text-zinc-500">
                No hay órdenes en esta sesión. Completa un checkout en /tienda.
              </p>
            ) : (
              <ul className="space-y-3">
                {orders.map((order) => (
                  <li key={order.id} className="border border-white/10 bg-black/20 p-3">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <p className="font-mono text-xs text-amber-200">{order.id}</p>
                        <p className="mt-1 text-sm font-semibold text-zinc-100">{order.name}</p>
                        <p className="text-xs text-zinc-500">
                          {order.email} · {order.city}
                        </p>
                        <p className="mt-2 text-xs text-zinc-400">
                          {order.items.map((item) => `${item.title} ×${item.quantity}`).join(" · ")}
                        </p>
                      </div>
                      <label className="grid gap-1 text-[11px] text-zinc-400">
                        Estado
                        <select
                          value={order.status}
                          onChange={(event) =>
                            updateOrderStatus(order.id, event.target.value as SmartQuoteStatus)
                          }
                          className="min-h-9 border border-white/10 bg-[#0c0a08] px-2 text-xs text-zinc-100"
                        >
                          {SHOP_STATUSES.map((status) => (
                            <option key={status} value={status}>
                              {status}
                            </option>
                          ))}
                        </select>
                      </label>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>
    </Card>
  );
}
