import { unlink } from "node:fs/promises";
import path from "node:path";
import {
  confirmationMatches,
  type PurgeCategory,
} from "@/shared/lib/admin/purgeCategories";
import {
  listarParticionesBronceLocal,
  vaciarBronceLocalYRedis,
} from "@/shared/lib/analitica/almacenBronce.server";
import { vaciarCapaOroLegacy } from "@/shared/lib/analitica/almacenOro.server";
import { vaciarAnaliticaPostgres } from "@/shared/lib/analitica/postgresAnalitica.server";
import { fechasVentana } from "@/shared/lib/analitica/fechaEstudio";
import { resolveAdvisoryStorage } from "@/shared/lib/storage/resolveAdvisoryStorage.server";
import { deleteAllQuoteRequests } from "@/shared/lib/storage/quoteRequestStore.server";

async function vaciarAnaliticaCompleta() {
  await vaciarAnaliticaPostgres();
  const locales = await listarParticionesBronceLocal();
  const ventana = fechasVentana(new Date().toISOString(), 120);
  const fechas = [...new Set([...locales, ...ventana])];
  await vaciarBronceLocalYRedis(fechas);
  await vaciarCapaOroLegacy();
  try {
    await unlink(path.join(process.cwd(), "data", "analitica", "oro.json"));
  } catch {
    // ausente
  }
}

async function vaciarAsesorias() {
  const storage = resolveAdvisoryStorage();
  const actual = await storage.read();
  if (!actual) return;
  await storage.write({ ...actual, bookings: [] });
}

export async function vaciarCategoria(
  categoria: PurgeCategory,
  confirmacion: string,
): Promise<{ ok: true } | { ok: false; error: string; status: number }> {
  if (!confirmationMatches(categoria, confirmacion)) {
    return {
      ok: false,
      status: 400,
      error: "La frase de confirmación no coincide.",
    };
  }

  if (categoria === "analitica" || categoria === "recorridos") {
    await vaciarAnaliticaCompleta();
    return { ok: true };
  }
  if (categoria === "cotizaciones") {
    await deleteAllQuoteRequests();
    return { ok: true };
  }
  await vaciarAsesorias();
  return { ok: true };
}
