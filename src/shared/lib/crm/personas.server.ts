import {
  aplicarTransicion,
  normalizarEmail,
  normalizarWhatsapp,
} from "@/shared/lib/crm/estado";
import { getCrmSql, hasDatabaseConfig } from "@/shared/lib/crm/postgres.server";
import type {
  EstadoPersona,
  EventoCrm,
  Persona,
  RegistroCrmInput,
} from "@/shared/lib/crm/tipos";

type PersonaRow = {
  id: string;
  nombre: string;
  whatsapp: string;
  email: string;
  estado: EstadoPersona;
  origen: string;
  id_visitante?: string | null;
  creado_en: Date | string;
  actualizado_en: Date | string;
  pasado_a_prospecto_en: Date | string | null;
  pasado_a_cliente_en: Date | string | null;
};

function iso(value: Date | string | null | undefined): string | null {
  if (!value) return null;
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function mapPersona(row: PersonaRow): Persona {
  return {
    id: row.id,
    nombre: row.nombre,
    whatsapp: row.whatsapp,
    email: row.email,
    estado: row.estado,
    origen: row.origen,
    id_visitante: row.id_visitante?.trim() || null,
    creado_en: iso(row.creado_en) ?? new Date().toISOString(),
    actualizado_en: iso(row.actualizado_en) ?? new Date().toISOString(),
    pasado_a_prospecto_en: iso(row.pasado_a_prospecto_en),
    pasado_a_cliente_en: iso(row.pasado_a_cliente_en),
  };
}

async function buscarPersona(
  sql: NonNullable<Awaited<ReturnType<typeof getCrmSql>>>,
  emailNorm: string,
  whatsappNorm: string,
): Promise<PersonaRow | null> {
  if (emailNorm) {
    const byEmail = await sql<PersonaRow[]>`
      SELECT * FROM personas WHERE email_normalizado = ${emailNorm} LIMIT 1
    `;
    if (byEmail[0]) return byEmail[0];
  }
  if (whatsappNorm) {
    const byPhone = await sql<PersonaRow[]>`
      SELECT * FROM personas WHERE whatsapp_normalizado = ${whatsappNorm} LIMIT 1
    `;
    if (byPhone[0]) return byPhone[0];
  }
  return null;
}

/**
 * Crea o actualiza la persona y avanza el estado (nunca baja).
 * Sin DATABASE_URL no hace nada: cotizaciones/agenda siguen en Redis.
 */
export async function registrarHechoCrm(
  input: RegistroCrmInput,
): Promise<Persona | null> {
  if (!hasDatabaseConfig()) return null;
  const sql = await getCrmSql();
  if (!sql) return null;

  const nombre = input.nombre.trim();
  if (!nombre) return null;

  const email = (input.email ?? "").trim();
  const whatsapp = (input.whatsapp ?? "").trim();
  const emailNorm = normalizarEmail(email);
  const whatsappNorm = normalizarWhatsapp(whatsapp);
  const idVisitante = (input.id_visitante ?? "").trim().slice(0, 80);
  if (!emailNorm && !whatsappNorm) return null;

  const existente = await buscarPersona(sql, emailNorm, whatsappNorm);
  const estado = existente
    ? aplicarTransicion(existente.estado, input.evento)
    : aplicarTransicion("crudo", input.evento);
  const now = new Date();
  const prospectoEn =
    estado !== "crudo"
      ? iso(existente?.pasado_a_prospecto_en) ?? now.toISOString()
      : null;
  const clienteEn =
    estado === "cliente"
      ? iso(existente?.pasado_a_cliente_en) ?? now.toISOString()
      : null;

  let persona: PersonaRow;
  if (existente) {
    const updated = await sql<PersonaRow[]>`
      UPDATE personas SET
        nombre = ${nombre},
        whatsapp = CASE WHEN ${whatsapp} = '' THEN whatsapp ELSE ${whatsapp} END,
        email = CASE WHEN ${email} = '' THEN email ELSE ${email} END,
        whatsapp_normalizado = CASE
          WHEN ${whatsappNorm} = '' THEN whatsapp_normalizado
          ELSE ${whatsappNorm}
        END,
        email_normalizado = CASE
          WHEN ${emailNorm} = '' THEN email_normalizado
          ELSE ${emailNorm}
        END,
        estado = ${estado},
        id_visitante = CASE
          WHEN ${idVisitante} = '' THEN id_visitante
          ELSE ${idVisitante}
        END,
        actualizado_en = ${now},
        pasado_a_prospecto_en = ${prospectoEn},
        pasado_a_cliente_en = ${clienteEn}
      WHERE id = ${existente.id}
      RETURNING *
    `;
    persona = updated[0] ?? existente;
  } else {
    const inserted = await sql<PersonaRow[]>`
      INSERT INTO personas (
        nombre, whatsapp, email, whatsapp_normalizado, email_normalizado,
        estado, origen, id_visitante, pasado_a_prospecto_en, pasado_a_cliente_en
      ) VALUES (
        ${nombre}, ${whatsapp}, ${email}, ${whatsappNorm}, ${emailNorm},
        ${estado}, ${input.origen ?? "cotizador"}, ${idVisitante}, ${prospectoEn}, ${clienteEn}
      )
      RETURNING *
    `;
    persona = inserted[0];
  }

  await sql`
    INSERT INTO persona_hechos (persona_id, tipo, detalle, referencia_id)
    VALUES (
      ${persona.id},
      ${input.evento},
      ${input.detalle ?? null},
      ${input.referencia_id ?? null}
    )
  `;

  return mapPersona(persona);
}

export async function listarPersonas(): Promise<Persona[]> {
  const sql = await getCrmSql();
  if (!sql) return [];
  const rows = await sql<PersonaRow[]>`
    SELECT * FROM personas
    ORDER BY actualizado_en DESC
    LIMIT 400
  `;
  return rows.map(mapPersona);
}

export async function promoverPersona(
  id: string,
  evento: Extract<EventoCrm, "cotizacion_aceptada" | "acuerdo_asesoria">,
): Promise<Persona | null> {
  const sql = await getCrmSql();
  if (!sql) return null;
  const rows = await sql<PersonaRow[]>`
    SELECT * FROM personas WHERE id = ${id} LIMIT 1
  `;
  const actual = rows[0];
  if (!actual) return null;
  return registrarHechoCrm({
    nombre: actual.nombre,
    email: actual.email,
    whatsapp: actual.whatsapp,
    evento,
    origen: actual.origen,
    detalle: evento === "acuerdo_asesoria" ? "Acuerdo en asesoría" : "Cotización aceptada",
  });
}

export async function crmListo(): Promise<boolean> {
  return hasDatabaseConfig() && Boolean(await getCrmSql());
}
