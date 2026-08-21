"use client";

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import { isStaffUiPath } from "@/shared/config/adminGate";
import { ANALITICA_EVENTO_DOM, type HechoAnaliticaCliente } from "@/shared/lib/analitica/emitirCliente";
import { leerIdVisitante } from "@/shared/lib/analitica/visitanteCliente";
import type { EventoCliente, TipoEvento } from "@/shared/lib/analitica/tipos";

const SESION_KEY = "neutrott.analitica.sesion";
const ACTIVIDAD_KEY = "neutrott.analitica.actividad";
const TIMEOUT_MS = 30 * 60_000;
const HEARTBEAT_MS = 15_000;
const FLUSH_MS = 8_000;
const MAX_COLA = 24;

function uuid(): string {
  if (typeof crypto !== "undefined" && crypto.randomUUID) return crypto.randomUUID();
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

function leer(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function escribir(key: string, value: string, session = false) {
  try {
    (session ? sessionStorage : localStorage).setItem(key, value);
  } catch {
    /* private mode */
  }
}

function leerSesion(): string | null {
  try {
    return sessionStorage.getItem(SESION_KEY);
  } catch {
    return null;
  }
}

function ids(): { id_sesion: string; id_visitante: string } {
  const visitante = leerIdVisitante();
  const now = Date.now();
  const last = Number(leer(ACTIVIDAD_KEY) ?? "0");
  let sesion = leerSesion();
  if (!sesion || (last && now - last > TIMEOUT_MS)) {
    sesion = uuid();
    escribir(SESION_KEY, sesion, true);
  }
  escribir(ACTIVIDAD_KEY, String(now));
  return { id_sesion: sesion, id_visitante: visitante };
}

function dispositivo() {
  const w = window.innerWidth;
  if (w < 768) return "movil" as const;
  if (w < 1024) return "tablet" as const;
  return "escritorio" as const;
}

function utm() {
  const p = new URLSearchParams(window.location.search);
  return {
    utm_fuente: p.get("utm_source") ?? undefined,
    utm_medio: p.get("utm_medium") ?? undefined,
    utm_campana: p.get("utm_campaign") ?? undefined,
  };
}

function enviar(lote: EventoCliente[], urgente = false) {
  if (lote.length === 0) return;
  const body = JSON.stringify({ eventos: lote });
  if (urgente && typeof navigator.sendBeacon === "function") {
    const blob = new Blob([body], { type: "application/json" });
    if (navigator.sendBeacon("/api/analitica/eventos", blob)) return;
  }
  void fetch("/api/analitica/eventos", {
    method: "POST",
    credentials: "same-origin",
    headers: { "Content-Type": "application/json" },
    body,
    keepalive: true,
  }).catch(() => {
    /* never block UX */
  });
}

export function AnaliticaWebCollector() {
  const pathname = usePathname();
  const cola = useRef<EventoCliente[]>([]);
  const vistoSeccion = useRef(new Set<string>());
  const rutaRef = useRef(pathname);

  function emitir(
    tipo: TipoEvento,
    extra: Partial<EventoCliente> = {},
    flush = false,
  ) {
    if (isStaffUiPath(pathname)) return;
    const { id_sesion, id_visitante } = ids();
    if (!id_visitante || !id_sesion) return;
    const evento: EventoCliente = {
      id_evento: uuid(),
      id_sesion,
      id_visitante,
      ocurrido_en: new Date().toISOString(),
      tipo_evento: tipo,
      ruta: `${pathname}${window.location.search}`.slice(0, 180),
      idioma: document.documentElement.lang || undefined,
      dispositivo: dispositivo(),
      ancho_viewport: window.innerWidth,
      alto_viewport: window.innerHeight,
      referente: document.referrer || undefined,
      ...utm(),
      ...extra,
    };
    cola.current.push(evento);
    if (cola.current.length > MAX_COLA) {
      cola.current = cola.current.slice(-MAX_COLA);
    }
    if (flush) {
      const lote = cola.current;
      cola.current = [];
      enviar(lote, true);
    }
  }

  const emitirRef = useRef(emitir);
  emitirRef.current = emitir;

  useEffect(() => {
    if (isStaffUiPath(pathname)) return;
    rutaRef.current = pathname;
    emitir("vista_pagina", {}, true);
    if (pathname.startsWith("/cotizacion")) {
      emitir("paso_cotizacion", { etiqueta: pathname }, true);
    }

    const onClick = (event: MouseEvent) => {
      const target = event.target;
      if (!(target instanceof Element)) return;
      const node = target.closest<HTMLElement>("[data-analitica]");
      if (!node) return;
      emitirRef.current("interaccion", {
        etiqueta: node.getAttribute("data-analitica") ?? "clic",
        valor: node.getAttribute("href") ?? undefined,
      });
    };

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          const el = entry.target as HTMLElement;
          const seccion = el.getAttribute("data-analitica-seccion");
          if (!seccion || vistoSeccion.current.has(seccion)) continue;
          vistoSeccion.current.add(seccion);
          emitirRef.current("seccion_visible", { seccion, etiqueta: seccion });
        }
      },
      { threshold: 0.45 },
    );
    document.querySelectorAll("[data-analitica-seccion]").forEach((el) => {
      observer.observe(el);
    });

    const beat = window.setInterval(() => {
      if (document.visibilityState !== "visible") return;
      emitirRef.current("permanencia", {
        duracion_ms: HEARTBEAT_MS,
        ruta: rutaRef.current,
      });
    }, HEARTBEAT_MS);

    const flushTimer = window.setInterval(() => {
      if (cola.current.length === 0) return;
      const lote = cola.current;
      cola.current = [];
      enviar(lote);
    }, FLUSH_MS);

    const onHide = () => {
      emitirRef.current(
        "salida_pagina",
        { duracion_ms: HEARTBEAT_MS, ruta: rutaRef.current },
        true,
      );
    };
    const onVisibility = () => {
      if (document.visibilityState === "hidden") onHide();
    };
    const onCustom = (event: Event) => {
      const detail = (event as CustomEvent<HechoAnaliticaCliente>).detail;
      if (!detail?.tipo_evento) return;
      emitirRef.current(detail.tipo_evento, detail);
    };

    document.addEventListener("click", onClick, true);
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("pagehide", onHide);
    window.addEventListener(ANALITICA_EVENTO_DOM, onCustom);

    return () => {
      observer.disconnect();
      window.clearInterval(beat);
      window.clearInterval(flushTimer);
      document.removeEventListener("click", onClick, true);
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("pagehide", onHide);
      window.removeEventListener(ANALITICA_EVENTO_DOM, onCustom);
    };
    // Collector rebinds on route change to stamp the current path.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname]);

  return null;
}
