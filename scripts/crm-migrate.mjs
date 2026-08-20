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
    and table_name in ('personas', 'persona_hechos', 'crm_meta')
  order by table_name
`;
await sql.end();
console.log("ok", info[0].db, info[0].usr, tables.map((t) => t.table_name).join(","));