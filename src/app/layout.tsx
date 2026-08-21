import type { Metadata, Viewport } from "next";
import { Bebas_Neue, Montserrat, Space_Mono, UnifrakturMaguntia } from "next/font/google";
import "./globals.css";
import { LanguageProvider } from "@/shared/i18n/LanguageProvider";
import { HtmlLangSync } from "@/widgets/i18n/HtmlLangSync";
import { NavigationScrollManager } from "@/widgets/navigation/NavigationScrollManager";
import { PublicAtmosphere } from "@/widgets/layout/PublicAtmosphere";
import { ErrorBoundary } from "@/shared/ui/ErrorBoundary";
import { BRAND } from "@/shared/config/brand";
import { STUDIO, getStudioFullAddress } from "@/shared/config/studio";
import { CANONICAL_SITE_URL } from "@/shared/lib/site";

const fontSans = Montserrat({
  variable: "--font-sans",
  subsets: ["latin"],
  weight: ["400", "600", "700"],
  display: "swap",
  preload: true,
});

/** Integral CF EB no está en Google Fonts; Bebas Neue es el sustituto más cercano para títulos. */
const fontDisplay = Bebas_Neue({
  variable: "--font-display",
  subsets: ["latin"],
  weight: ["400"],
  display: "swap",
  preload: true,
});

const fontMono = Space_Mono({
  variable: "--font-mono",
  subsets: ["latin"],
  weight: ["400", "700"],
  display: "swap",
  preload: false,
});

const fontGothic = UnifrakturMaguntia({
  variable: "--font-gothic",
  subsets: ["latin"],
  weight: ["400"],
  display: "swap",
  preload: false,
});

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL?.trim() || CANONICAL_SITE_URL;
const siteTitle = "Neutrottt · Sombras y Lettering";
const siteDescription = "Lettering y sombras · Neutrottt · Medellín.";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: siteTitle,
    template: "%s · Neutrottt",
  },
  description: siteDescription,
  applicationName: BRAND.name,
  authors: [{ name: BRAND.name, url: siteUrl }],
  creator: BRAND.name,
  publisher: BRAND.name,
  category: "studio",
  alternates: { canonical: "/" },
  openGraph: {
    type: "website",
    locale: "es_CO",
    url: "/",
    siteName: BRAND.name,
    title: siteTitle,
    description: siteDescription,
  },
  twitter: {
    card: "summary_large_image",
    title: siteTitle,
    description: siteDescription,
  },
  robots: {
    index: true,
    follow: true,
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#17110d",
};

const studioJsonLd = {
  "@context": "https://schema.org",
  "@type": "TattooParlor",
  name: BRAND.name,
  url: siteUrl,
  image: `${siteUrl.replace(/\/$/, "")}/brand/hero-portrait-full.png`,
  telephone: `+${BRAND.whatsappPhone}`,
  address: {
    "@type": "PostalAddress",
    streetAddress: STUDIO.addressLine1,
    addressLocality: STUDIO.city,
    addressRegion: STUDIO.region,
    addressCountry: "CO",
  },
  areaServed: getStudioFullAddress(),
  sameAs: [BRAND.instagramUrl],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="es"
      suppressHydrationWarning
      className={`${fontSans.variable} ${fontDisplay.variable} ${fontMono.variable} ${fontGothic.variable} h-full antialiased`}
    >
      <body suppressHydrationWarning className="min-h-full flex flex-col bg-background text-ivory">
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(studioJsonLd) }}
        />
        <LanguageProvider>
          <HtmlLangSync />
          <NavigationScrollManager />
          <PublicAtmosphere />
          <div className="relative z-10">
            <ErrorBoundary>{children}</ErrorBoundary>
          </div>
        </LanguageProvider>
      </body>
    </html>
  );
}
