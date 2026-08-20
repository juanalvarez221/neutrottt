export function normalizarCorreo(value: string): string {
  return value.trim().toLowerCase();
}

/** Forma de correo aceptable para login. La allowlist real es la tabla admins. */
export function esCorreoValido(value: string): boolean {
  const email = normalizarCorreo(value);
  if (email.length < 5 || email.length > 254) return false;
  return /^[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}$/.test(email);
}
