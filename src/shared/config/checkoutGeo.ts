import colombiaRaw from "@/shared/config/data/colombia-departments.json";
import { flagUrl, type PhoneCountryOption } from "@/shared/config/phoneCountries";

export type ColombiaDepartment = {
  id: number;
  departamento: string;
  ciudades: string[];
};

export const COLOMBIA_DEPARTMENTS = colombiaRaw as ColombiaDepartment[];

/** Países de residencia / facturación (banderas vía flagcdn). */
export const CHECKOUT_COUNTRIES: readonly PhoneCountryOption[] = [
  { dial: "+57", iso: "co", es: "Colombia", en: "Colombia" },
  { dial: "+54", iso: "ar", es: "Argentina", en: "Argentina" },
  { dial: "+591", iso: "bo", es: "Bolivia", en: "Bolivia" },
  { dial: "+55", iso: "br", es: "Brasil", en: "Brazil" },
  { dial: "+56", iso: "cl", es: "Chile", en: "Chile" },
  { dial: "+506", iso: "cr", es: "Costa Rica", en: "Costa Rica" },
  { dial: "+593", iso: "ec", es: "Ecuador", en: "Ecuador" },
  { dial: "+503", iso: "sv", es: "El Salvador", en: "El Salvador" },
  { dial: "+1", iso: "us", es: "Estados Unidos", en: "United States" },
  { dial: "+34", iso: "es", es: "España", en: "Spain" },
  { dial: "+502", iso: "gt", es: "Guatemala", en: "Guatemala" },
  { dial: "+504", iso: "hn", es: "Honduras", en: "Honduras" },
  { dial: "+52", iso: "mx", es: "México", en: "Mexico" },
  { dial: "+505", iso: "ni", es: "Nicaragua", en: "Nicaragua" },
  { dial: "+507", iso: "pa", es: "Panamá", en: "Panama" },
  { dial: "+595", iso: "py", es: "Paraguay", en: "Paraguay" },
  { dial: "+51", iso: "pe", es: "Perú", en: "Peru" },
  { dial: "+1", iso: "ca", es: "Canadá", en: "Canada" },
  { dial: "+598", iso: "uy", es: "Uruguay", en: "Uruguay" },
  { dial: "+58", iso: "ve", es: "Venezuela", en: "Venezuela" },
] as const;

export function getCheckoutCountry(iso: string) {
  return CHECKOUT_COUNTRIES.find((c) => c.iso === iso) ?? CHECKOUT_COUNTRIES[0];
}

export function getCitiesForDepartment(departmentName: string): string[] {
  const found = COLOMBIA_DEPARTMENTS.find((d) => d.departamento === departmentName);
  return found?.ciudades ?? [];
}

export { flagUrl };
