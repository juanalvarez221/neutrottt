export function formatAdminDate(iso: string) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "Fecha desconocida";
  return date.toLocaleString("es-CO", {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

export function formatAdminDay(iso: string) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString("es-CO", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });
}

export function formatRelative(iso: string, now = Date.now()) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  const diff = now - date.getTime();
  const min = Math.round(diff / 60_000);
  if (min < 1) return "Hace un momento";
  if (min < 60) return `Hace ${min} min`;
  const hours = Math.round(min / 60);
  if (hours < 24) return `Hace ${hours} h`;
  const days = Math.round(hours / 24);
  if (days === 1) return "Ayer";
  if (days < 14) return `Hace ${days} días`;
  return formatAdminDate(iso);
}

export function visitorLabel(nombre: string | null | undefined, id: string) {
  const trimmed = nombre?.trim();
  if (trimmed) return trimmed;
  return `Visitante ${id.slice(0, 8)}`;
}
