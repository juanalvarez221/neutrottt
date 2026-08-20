import { hashPassword, verifyPassword } from "@/shared/lib/adminPassword";
import { getCrmSql, hasDatabaseConfig } from "@/shared/lib/crm/postgres.server";

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

export async function upsertAdminAccount(input: {
  email: string;
  nombre: string;
  password: string;
}): Promise<AdminAccount | null> {
  const sql = await getCrmSql();
  if (!sql) return null;
  const email = input.email.trim().toLowerCase();
  const nombre = input.nombre.trim();
  if (!email || !nombre || !input.password) return null;
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
  if (!hasDatabaseConfig()) return null;
  const sql = await getCrmSql();
  if (!sql) return null;
  const email = emailRaw.trim().toLowerCase();
  if (!email || !password) return null;
  const rows = await sql<AdminRow[]>`
    SELECT id, email, nombre, password_hash, activo
    FROM admins
    WHERE email = ${email}
    LIMIT 1
  `;
  const row = rows[0];
  if (!row || !row.activo) return null;
  const ok = await verifyPassword(password, row.password_hash);
  if (!ok) return null;
  await sql`UPDATE admins SET ultimo_acceso_en = now() WHERE id = ${row.id}`;
  return { id: row.id, email: row.email, nombre: row.nombre };
}
