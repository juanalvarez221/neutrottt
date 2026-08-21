import postgres from "postgres";

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("Falta DATABASE_URL");
  process.exit(1);
}

const statements = [
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
  `CREATE TABLE IF NOT EXISTS admins (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email TEXT NOT NULL UNIQUE,
    nombre TEXT NOT NULL,
    password_hash TEXT NOT NULL,
    activo BOOLEAN NOT NULL DEFAULT true,
    creado_en TIMESTAMPTZ NOT NULL DEFAULT now(),
    ultimo_acceso_en TIMESTAMPTZ
  )`,
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

const sql = postgres(url, { ssl: "require", max: 1 });
const info = await sql`select current_database() as db, current_user as usr`;
for (const statement of statements) {
  await sql.unsafe(statement);
}
const tables = await sql`
  select table_name
  from information_schema.tables
  where table_schema = 'public'
    and table_name in ('personas', 'persona_hechos', 'crm_meta', 'admins', 'cotizaciones', 'agenda', 'analitica_eventos', 'analitica_oro')
  order by table_name
`;
await sql.end();
console.log("ok", info[0].db, info[0].usr, tables.map((t) => t.table_name).join(","));