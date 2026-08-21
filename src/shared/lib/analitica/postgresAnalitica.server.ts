import { getCrmSql } from "@/shared/lib/crm/postgres.server";
import type { CapaOro, EventoBronce } from "@/shared/lib/analitica/tipos";
import { fechaEstudio } from "@/shared/lib/analitica/fechaEstudio";

const ORO_ID = "actual";

type EventoRow = {
  payload: EventoBronce | string;
};

type OroRow = {
  valor: CapaOro | string;
};

function asEvento(raw: EventoRow["payload"]): EventoBronce | null {
  if (!raw) return null;
  if (typeof raw === "string") {
    try {
      return JSON.parse(raw) as EventoBronce;
    } catch {
      return null;
    }
  }
  if (typeof raw === "object" && typeof raw.id_evento === "string") return raw;
  return null;
}

function asOro(raw: OroRow["valor"]): CapaOro | null {
  if (!raw) return null;
  if (typeof raw === "string") {
    try {
      return JSON.parse(raw) as CapaOro;
    } catch {
      return null;
    }
  }
  if (typeof raw === "object" && Array.isArray(raw.embudo)) return raw;
  return null;
}

export async function appendEventosPostgres(eventos: EventoBronce[]): Promise<number> {
  const sql = await getCrmSql();
  if (!sql || eventos.length === 0) return 0;
  for (const evento of eventos) {
    const fecha = fechaEstudio(evento.ocurrido_en);
    await sql`
      INSERT INTO analitica_eventos (id_evento, fecha_estudio, ocurrido_en, payload)
      VALUES (
        ${evento.id_evento},
        ${fecha},
        ${evento.ocurrido_en},
        ${sql.json(evento)}
      )
      ON CONFLICT (id_evento) DO NOTHING
    `;
  }
  return eventos.length;
}

export async function leerEventosPostgres(
  fechas: readonly string[],
): Promise<EventoBronce[] | null> {
  const sql = await getCrmSql();
  if (!sql) return null;
  if (fechas.length === 0) return [];
  const rows = await sql<EventoRow[]>`
    SELECT payload FROM analitica_eventos
    WHERE fecha_estudio::text = ANY(${[...fechas]})
    ORDER BY ocurrido_en ASC
  `;
  return rows.map((row) => asEvento(row.payload)).filter((e): e is EventoBronce => Boolean(e));
}

export async function leerOroPostgres(): Promise<CapaOro | null> {
  const sql = await getCrmSql();
  if (!sql) return null;
  const rows = await sql<OroRow[]>`
    SELECT valor FROM analitica_oro WHERE id = ${ORO_ID} LIMIT 1
  `;
  return asOro(rows[0]?.valor ?? "");
}

export async function escribirOroPostgres(oro: CapaOro): Promise<void> {
  const sql = await getCrmSql();
  if (!sql) {
    throw new Error("No hay DATABASE_URL para guardar las métricas.");
  }
  await sql`
    INSERT INTO analitica_oro (id, valor, actualizado_en)
    VALUES (${ORO_ID}, ${sql.json(oro)}, now())
    ON CONFLICT (id) DO UPDATE SET
      valor = EXCLUDED.valor,
      actualizado_en = now()
  `;
}

export async function vaciarAnaliticaPostgres(): Promise<void> {
  const sql = await getCrmSql();
  if (!sql) return;
  await sql`DELETE FROM analitica_eventos`;
  await sql`DELETE FROM analitica_oro`;
}
