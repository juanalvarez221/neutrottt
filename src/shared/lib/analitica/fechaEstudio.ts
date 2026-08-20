import { ZONA_HORARIA_ESTUDIO } from "@/shared/lib/analitica/tipos";

const fechaFmt = new Intl.DateTimeFormat("en-CA", {
  timeZone: ZONA_HORARIA_ESTUDIO,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

export function fechaEstudio(iso: string | Date): string {
  const date = iso instanceof Date ? iso : new Date(iso);
  if (Number.isNaN(date.getTime())) return fechaEstudio(new Date());
  return fechaFmt.format(date);
}

export function fechasVentana(hastaIso: string, dias: number): string[] {
  const end = fechaEstudio(hastaIso);
  const [y, m, d] = end.split("-").map(Number);
  const cursor = new Date(Date.UTC(y!, m! - 1, d!));
  const out: string[] = [];
  for (let i = 0; i < dias; i += 1) {
    const day = new Date(cursor.getTime() - i * 86_400_000);
    out.push(day.toISOString().slice(0, 10));
  }
  return out.reverse();
}

export function formatDuracion(ms: number): string {
  if (!Number.isFinite(ms) || ms <= 0) return "0 s";
  const totalSec = Math.round(ms / 1000);
  const min = Math.floor(totalSec / 60);
  const sec = totalSec % 60;
  if (min === 0) return `${sec} s`;
  if (min < 60) return sec === 0 ? `${min} min` : `${min} min ${sec} s`;
  const h = Math.floor(min / 60);
  const rm = min % 60;
  return rm === 0 ? `${h} h` : `${h} h ${rm} min`;
}

export function formatPorcentaje(value: number): string {
  if (!Number.isFinite(value)) return "0%";
  return `${(value * 100).toFixed(1)}%`;
}
