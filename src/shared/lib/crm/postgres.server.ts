import postgres from "postgres";

const ADMIN_TABLE = `CREATE TABLE IF NOT EXISTS admins (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email TEXT NOT NULL UNIQUE,
    nombre TEXT NOT NULL,
    password_hash TEXT NOT NULL,
    activo BOOLEAN NOT NULL DEFAULT true,
    creado_en TIMESTAMPTZ NOT NULL DEFAULT now(),
    ultimo_acceso_en TIMESTAMPTZ
  )`;

const SCHEMA_STATEMENTS = [
  `CREATE TABLE IF NOT EXISTS personas (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    nombre TEXT NOT NULL,
    whatsapp TEXT NOT NULL DEFAULT '',
    email TEXT NOT NULL DEFAULT '',
    whatsapp_normalizado TEXT NOT NULL DEFAULT '',
    email_normalizado TEXT NOT NULL DEFAULT '',
    estado TEXT NOT NULL CHECK (estado IN ('crudo', 'prospecto', 'cliente')),
    origen TEXT NOT NULL DEFAULT 'cotizador',
    creado_en TIMESTAMPTZ NOT NULL DEFAULT now(),
    actualizado_en TIMESTAMPTZ NOT NULL DEFAULT now(),
    pasado_a_prospecto_en TIMESTAMPTZ,
    pasado_a_cliente_en TIMESTAMPTZ
  )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS personas_email_uq
    ON personas (email_normalizado) WHERE email_normalizado <> ''`,
  `CREATE UNIQUE INDEX IF NOT EXISTS personas_whatsapp_uq
    ON personas (whatsapp_normalizado) WHERE whatsapp_normalizado <> ''`,
  `CREATE TABLE IF NOT EXISTS persona_hechos (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    persona_id UUID NOT NULL REFERENCES personas(id) ON DELETE CASCADE,
    tipo TEXT NOT NULL,
    detalle TEXT,
    referencia_id TEXT,
    ocurrido_en TIMESTAMPTZ NOT NULL DEFAULT now()
  )`,
  `CREATE INDEX IF NOT EXISTS persona_hechos_persona_idx
    ON persona_hechos (persona_id, ocurrido_en DESC)`,
  `CREATE TABLE IF NOT EXISTS crm_meta (
    clave TEXT PRIMARY KEY,
    valor TEXT NOT NULL
  )`,
  ADMIN_TABLE,
  `ALTER TABLE personas ADD COLUMN IF NOT EXISTS id_visitante TEXT NOT NULL DEFAULT ''`,
  `CREATE INDEX IF NOT EXISTS personas_visitante_idx
    ON personas (id_visitante) WHERE id_visitante <> ''`,
  `CREATE TABLE IF NOT EXISTS cotizaciones (
    id TEXT PRIMARY KEY,
    client_name TEXT NOT NULL,
    whatsapp TEXT NOT NULL DEFAULT '',
    email TEXT NOT NULL DEFAULT '',
    project_size TEXT NOT NULL DEFAULT '',
    body_placement TEXT NOT NULL DEFAULT '',
    reference_notes TEXT NOT NULL DEFAULT '',
    connection_answers JSONB NOT NULL DEFAULT '{}'::jsonb,
    collaboration_mode TEXT,
    advisory_mode TEXT,
    advisory_scheduled_at TIMESTAMPTZ,
    advisory_booking_id TEXT,
    style TEXT,
    estimate_sessions TEXT,
    estimate_per_session TEXT,
    estimate_total TEXT,
    status_label TEXT NOT NULL,
    status_slug TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    official_session_price INTEGER,
    official_session_count INTEGER,
    official_note TEXT,
    official_sent_at TIMESTAMPTZ
  )`,
  `CREATE INDEX IF NOT EXISTS cotizaciones_created_idx ON cotizaciones (created_at DESC)`,
  `CREATE INDEX IF NOT EXISTS cotizaciones_status_idx ON cotizaciones (status_slug)`,
  `CREATE TABLE IF NOT EXISTS agenda (
    id TEXT PRIMARY KEY,
    valor JSONB NOT NULL,
    actualizado_en TIMESTAMPTZ NOT NULL DEFAULT now()
  )`,

  `CREATE TABLE IF NOT EXISTS analitica_eventos (
    id_evento TEXT PRIMARY KEY,
    fecha_estudio DATE NOT NULL,
    ocurrido_en TIMESTAMPTZ NOT NULL,
    payload JSONB NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS analitica_eventos_fecha_idx
    ON analitica_eventos (fecha_estudio, ocurrido_en)`,
  `CREATE TABLE IF NOT EXISTS analitica_oro (
    id TEXT PRIMARY KEY,
    valor JSONB NOT NULL,
    actualizado_en TIMESTAMPTZ NOT NULL DEFAULT now()
  )`,
];

let client: postgres.Sql | null = null;
let schemaReady: Promise<postgres.Sql | null> | null = null;

export function databaseUrl(): string | null {
  return process.env.DATABASE_URL?.trim() || null;
}

export function hasDatabaseConfig() {
  return Boolean(databaseUrl());
}

let adminReady: Promise<postgres.Sql | null> | null = null;

function createClient(url: string) {
  const local = /localhost|127\.0\.0\.1/i.test(url);
  return postgres(url, {
    max: 1,
    idle_timeout: 20,
    connect_timeout: 10,
    ssl: local ? false : "require",
  });
}

export async function getCrmSql(): Promise<postgres.Sql | null> {
  const url = databaseUrl();
  if (!url) return null;
  if (!schemaReady) {
    schemaReady = (async () => {
      if (!client) client = createClient(url);
      for (const statement of SCHEMA_STATEMENTS) {
        try {
          await client.unsafe(statement);
        } catch (error) {
          const optional =
            statement.includes("id_visitante") || statement.includes("personas_visitante_idx");
          console.error("[crm:schema]", error);
          if (!optional) throw error;
        }
      }
      return client;
    })().catch((error) => {
      schemaReady = null;
      throw error;
    });
  }
  return schemaReady;
}

/** Solo tabla admins. El login no debe esperar migraciones del CRM. */
export async function getAdminSql(): Promise<postgres.Sql | null> {
  const url = databaseUrl();
  if (!url) return null;
  if (!adminReady) {
    adminReady = (async () => {
      if (!client) client = createClient(url);
      await client.unsafe(ADMIN_TABLE);
      return client;
    })().catch((error) => {
      adminReady = null;
      throw error;
    });
  }
  return adminReady;
}
