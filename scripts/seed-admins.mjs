import { randomBytes, scrypt as scryptCallback } from "node:crypto";
import { promisify } from "node:util";
import postgres from "postgres";

const scrypt = promisify(scryptCallback);

/**
 * Semilla de admins. No guarda claves en el repo.
 * Uso: ADMIN_SEED='email|Nombre|clave' (una por línea) node scripts/seed-admins.mjs
 */
const url = process.env.DATABASE_URL;
const seed = process.env.ADMIN_SEED;
if (!url) {
  console.error("Falta DATABASE_URL");
  process.exit(1);
}
if (!seed) {
  console.error("Falta ADMIN_SEED");
  process.exit(1);
}

await postgres(url, { ssl: "require", max: 1 }).unsafe(`
  CREATE TABLE IF NOT EXISTS admins (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email TEXT NOT NULL UNIQUE,
    nombre TEXT NOT NULL,
    password_hash TEXT NOT NULL,
    activo BOOLEAN NOT NULL DEFAULT true,
    creado_en TIMESTAMPTZ NOT NULL DEFAULT now(),
    ultimo_acceso_en TIMESTAMPTZ
  )
`);

const sql = postgres(url, { ssl: "require", max: 1 });

async function hashPassword(password) {
  const salt = randomBytes(16);
  const key = await scrypt(password, salt, 32);
  return `scrypt:${salt.toString("base64")}:${key.toString("base64")}`;
}

const lines = seed
  .split(/\r?\n/)
  .map((line) => line.trim())
  .filter(Boolean);

for (const line of lines) {
  const [emailRaw, nombreRaw, ...passwordParts] = line.split("|");
  const email = emailRaw?.trim().toLowerCase();
  const nombre = nombreRaw?.trim();
  const password = passwordParts.join("|");
  if (!email || !nombre || !password) {
    console.error("Linea inválida");
    process.exit(1);
  }
  const password_hash = await hashPassword(password);
  await sql`
    INSERT INTO admins (email, nombre, password_hash, activo)
    VALUES (${email}, ${nombre}, ${password_hash}, true)
    ON CONFLICT (email) DO UPDATE SET
      nombre = EXCLUDED.nombre,
      password_hash = EXCLUDED.password_hash,
      activo = true
  `;
  console.log("ok", email);
}

await sql.end();
