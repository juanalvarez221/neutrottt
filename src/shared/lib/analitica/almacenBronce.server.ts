import { appendFile, mkdir, readFile, readdir } from "node:fs/promises";
import path from "node:path";
import type { EventoBronce } from "@/shared/lib/analitica/tipos";
import { fechaEstudio } from "@/shared/lib/analitica/fechaEstudio";
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

export async function appendEventosBronce(eventos: EventoBronce[]): Promise<number> {
  if (eventos.length === 0) return 0;
  const byDay = new Map<string, EventoBronce[]>();
  for (const e of eventos) {
    const fecha = fechaEstudio(e.ocurrido_en);
    const list = byDay.get(fecha) ?? [];
    if (list.length < MAX_EVENTOS_DIA) list.push(e);
    byDay.set(fecha, list);
  }

  if (hasUpstashConfig()) {
    const commands: (string | number)[][] = [];
    for (const [fecha, list] of byDay) {
      const key = redisKey(fecha);
      for (const e of list) commands.push(["RPUSH", key, JSON.stringify(e)]);
      commands.push(["EXPIRE", key, TTL_BRONCE_S]);
    }
    await upstashPipeline(commands);
    return eventos.length;
  }

  if (isProductionRuntime()) {
    throw new Error(
      "La analítica requiere Upstash Redis en producción (capa bronce).",
    );
  }

  for (const [fecha, list] of byDay) {
    await appendFileDay(fecha, list);
  }
  return eventos.length;
}

export async function leerEventosBronce(
  fechas: readonly string[],
): Promise<EventoBronce[]> {
  if (hasUpstashConfig()) {
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

  if (isProductionRuntime()) {
    throw new Error(
      "La analítica requiere Upstash Redis en producción (capa bronce).",
    );
  }

  const out: EventoBronce[] = [];
  for (const fecha of fechas) {
    out.push(...(await readFileDay(fecha)));
  }
  return out;
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
