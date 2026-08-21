import { appendFile, mkdir, readFile, readdir, unlink } from "node:fs/promises";
import path from "node:path";
import type { EventoBronce } from "@/shared/lib/analitica/tipos";
import { fechaEstudio } from "@/shared/lib/analitica/fechaEstudio";
import {
  appendEventosPostgres,
  leerEventosPostgres,
} from "@/shared/lib/analitica/postgresAnalitica.server";
import { hasDatabaseConfig } from "@/shared/lib/crm/postgres.server";
import {
  hasUpstashConfig,
  isProductionRuntime,
  upstashCommand,
  upstashPipeline,
} from "@/shared/lib/storage/upstashRest.server";

const MAX_EVENTOS_DIA = 8_000;
const TTL_BRONCE_S = 90 * 24 * 60 * 60;
const DIR = path.join(process.cwd(), "data", "analitica", "bronce");

function redisKey(fecha: string) {
  return `neutrott:analitica:bronce:${fecha}`;
}

function filePath(fecha: string) {
  return path.join(DIR, `eventos-${fecha}.jsonl`);
}

function parseLine(line: string): EventoBronce | null {
  if (!line.trim()) return null;
  try {
    return JSON.parse(line) as EventoBronce;
  } catch {
    return null;
  }
}

async function appendFileDay(fecha: string, eventos: EventoBronce[]) {
  await mkdir(DIR, { recursive: true });
  const payload = eventos.map((e) => JSON.stringify(e)).join("\n") + "\n";
  await appendFile(filePath(fecha), payload, "utf8");
}

async function readFileDay(fecha: string): Promise<EventoBronce[]> {
  try {
    const raw = await readFile(filePath(fecha), "utf8");
    return raw.split("\n").map(parseLine).filter((e): e is EventoBronce => Boolean(e));
  } catch {
    return [];
  }
}

async function appendRedis(byDay: Map<string, EventoBronce[]>) {
  const commands: (string | number)[][] = [];
  for (const [fecha, list] of byDay) {
    const key = redisKey(fecha);
    for (const e of list) commands.push(["RPUSH", key, JSON.stringify(e)]);
    commands.push(["EXPIRE", key, TTL_BRONCE_S]);
  }
  await upstashPipeline(commands);
}

async function leerRedis(fechas: readonly string[]): Promise<EventoBronce[]> {
  const out: EventoBronce[] = [];
  for (const fecha of fechas) {
    const rows = await upstashCommand<string[]>([
      "LRANGE",
      redisKey(fecha),
      0,
      MAX_EVENTOS_DIA - 1,
    ]);
    for (const row of rows ?? []) {
      const e = parseLine(row);
      if (e) out.push(e);
    }
  }
  return out;
}

function groupByDay(eventos: EventoBronce[]): Map<string, EventoBronce[]> {
  const byDay = new Map<string, EventoBronce[]>();
  for (const e of eventos) {
    const fecha = fechaEstudio(e.ocurrido_en);
    const list = byDay.get(fecha) ?? [];
    if (list.length < MAX_EVENTOS_DIA) list.push(e);
    byDay.set(fecha, list);
  }
  return byDay;
}

export async function appendEventosBronce(eventos: EventoBronce[]): Promise<number> {
  if (eventos.length === 0) return 0;
  const byDay = groupByDay(eventos);

  if (hasDatabaseConfig()) {
    await appendEventosPostgres(eventos);
    return eventos.length;
  }

  if (hasUpstashConfig()) {
    await appendRedis(byDay);
    return eventos.length;
  }

  if (isProductionRuntime()) {
    throw new Error(
      "La analítica requiere DATABASE_URL (Postgres) o Upstash Redis en producción (capa bronce).",
    );
  }

  for (const [fecha, list] of byDay) {
    await appendFileDay(fecha, list);
  }
  return eventos.length;
}

async function leerLegacy(fechas: readonly string[]): Promise<EventoBronce[]> {
  if (hasUpstashConfig()) {
    try {
      return await leerRedis(fechas);
    } catch (error) {
      console.error("[analitica:bronce:redis]", error);
    }
  }

  if (isProductionRuntime()) return [];

  const out: EventoBronce[] = [];
  for (const fecha of fechas) {
    out.push(...(await readFileDay(fecha)));
  }
  return out;
}

export async function leerEventosBronce(
  fechas: readonly string[],
): Promise<EventoBronce[]> {
  if (hasDatabaseConfig()) {
    try {
      const fromPg = await leerEventosPostgres(fechas);
      if (fromPg && fromPg.length > 0) return fromPg;
      const legacy = await leerLegacy(fechas);
      if (legacy.length > 0) {
        try {
          await appendEventosPostgres(legacy);
        } catch (error) {
          console.error("[analitica:bronce:import]", error);
        }
        return legacy;
      }
      return fromPg ?? [];
    } catch (error) {
      console.error("[analitica:bronce:postgres]", error);
    }
  }

  const legacy = await leerLegacy(fechas);
  if (legacy.length > 0) return legacy;

  if (isProductionRuntime() && !hasDatabaseConfig() && !hasUpstashConfig()) {
    throw new Error(
      "La analítica requiere DATABASE_URL (Postgres) o Upstash Redis en producción (capa bronce).",
    );
  }

  return [];
}

export async function listarParticionesBronceLocal(): Promise<string[]> {
  try {
    const names = await readdir(DIR);
    return names
      .map((n) => n.match(/^eventos-(\d{4}-\d{2}-\d{2})\.jsonl$/)?.[1])
      .filter((d): d is string => Boolean(d))
      .sort();
  } catch {
    return [];
  }
}

export async function vaciarBronceLocalYRedis(fechas: readonly string[]): Promise<void> {
  if (hasUpstashConfig()) {
    const commands = fechas.map((fecha) => ["DEL", redisKey(fecha)]);
    if (commands.length) {
      try {
        await upstashPipeline(commands);
      } catch (error) {
        console.error("[analitica:bronce:purge-redis]", error);
      }
    }
  }

  for (const fecha of fechas) {
    try {
      await unlink(filePath(fecha));
    } catch {
      // archivo ausente
    }
  }
}
