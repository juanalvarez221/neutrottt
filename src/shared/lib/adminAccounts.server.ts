import { hashPassword, verifyPassword } from "@/shared/lib/adminPassword";
import { esCorreoValido, normalizarCorreo } from "@/shared/lib/adminEmail";
import { getAdminSql, hasDatabaseConfig } from "@/shared/lib/crm/postgres.server";

export type AdminAccount = {
  id: string;
  email: string;
  nombre: string;
};

type AdminRow = {
  id: string;
  email: string;
  nombre: string;
  password_hash: string;
  activo: boolean;
};

let dummyHashPromise: Promise<string> | null = null;

function dummyHash(): Promise<string> {
  dummyHashPromise ??= hashPassword("__neutrott-dummy-not-a-user__");
  return dummyHashPromise;
}

async function verifyWithDummy(password: string): Promise<null> {
  const stored = await dummyHash();
  await verifyPassword(password || " ", stored);
  return null;
}

export async function upsertAdminAccount(input: {
  email: string;
  nombre: string;
  password: string;
}): Promise<AdminAccount | null> {
  const sql = await getAdminSql();
  if (!sql) return null;
  const email = normalizarCorreo(input.email);
  const nombre = input.nombre.trim();
  if (!esCorreoValido(email) || !nombre || !input.password) return null;
  const password_hash = await hashPassword(input.password);
  const rows = await sql<AdminRow[]>`
    INSERT INTO admins (email, nombre, password_hash, activo)
    VALUES (${email}, ${nombre}, ${password_hash}, true)
    ON CONFLICT (email) DO UPDATE SET
      nombre = EXCLUDED.nombre,
      password_hash = EXCLUDED.password_hash,
      activo = true
    RETURNING id, email, nombre, password_hash, activo
  `;
  const row = rows[0];
  if (!row) return null;
  return { id: row.id, email: row.email, nombre: row.nombre };
}

export async function authenticateAdminEmail(
  emailRaw: string,
  password: string,
): Promise<AdminAccount | null> {
  const email = normalizarCorreo(emailRaw);
  if (!esCorreoValido(email) || !password) {
    return verifyWithDummy(password);
  }

  if (!hasDatabaseConfig()) {
    console.error("[admin-auth] Falta DATABASE_URL.");
    return verifyWithDummy(password);
  }

  let sql: Awaited<ReturnType<typeof getAdminSql>> = null;
  try {
    sql = await getAdminSql();
  } catch (error) {
    console.error("[admin-auth] db", error);
    return verifyWithDummy(password);
  }
  if (!sql) {
    return verifyWithDummy(password);
  }

  let rows: AdminRow[] = [];
  try {
    rows = await sql<AdminRow[]>`
      SELECT id, email, nombre, password_hash, activo
      FROM admins
      WHERE email = ${email}
      LIMIT 1
    `;
  } catch (error) {
    console.error("[admin-auth] query", error);
    return verifyWithDummy(password);
  }

  const row = rows[0];
  if (!row || !row.activo) {
    return verifyWithDummy(password);
  }

  const ok = await verifyPassword(password, row.password_hash);
  if (!ok) return null;

  try {
    await sql`UPDATE admins SET ultimo_acceso_en = now() WHERE id = ${row.id}`;
  } catch (error) {
    console.error("[admin-auth] acceso", error);
  }

  return { id: row.id, email: row.email, nombre: row.nombre };
}
