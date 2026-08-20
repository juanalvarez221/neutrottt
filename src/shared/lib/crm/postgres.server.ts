import postgres from "postgres";

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
];

let client: postgres.Sql | null = null;
let schemaReady: Promise<postgres.Sql | null> | null = null;

export function databaseUrl(): string | null {
  return process.env.DATABASE_URL?.trim() || null;
}

export function hasDatabaseConfig() {
  return Boolean(databaseUrl());
}

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
        await client.unsafe(statement);
      }
      return client;
    })().catch((error) => {
      schemaReady = null;
      throw error;
    });
  }
  return schemaReady;
}
