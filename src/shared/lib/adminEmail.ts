export function esCorreoAdmin(value: string): boolean {
  return /^[a-z0-9._%+-]+@neutrottt\.com$/.test(value.trim().toLowerCase());
}
