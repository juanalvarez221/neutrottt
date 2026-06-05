export const STUDIO = {
  name: "Emerald Tattoo Studio",
  displayName: "Emerald Tattoo Studio",
  taglineKey: "studioTagline" as const,
  addressLine1: "Calle 10a #36 11",
  city: "Medellín",
  region: "Antioquia",
  country: "Colombia",
  locationShort: "Medellín, Colombia",
  photoSrc: "/brand/about-studio.png",
  logoSrc: "/brand/emerald-studio-logo.png",
  verifiedBadgeSrc: "/brand/verified-badge.png",
  mapsUrl:
    "https://www.google.com/maps/search/?api=1&query=Calle+10a+%2336-11%2C+Medell%C3%ADn%2C+Antioquia%2C+Colombia",
} as const;

export function getStudioFullAddress(): string {
  return `${STUDIO.addressLine1}, ${STUDIO.city}, ${STUDIO.region}, ${STUDIO.country}`;
}
