import type { Metadata, Viewport } from "next";
import { Bebas_Neue, Montserrat, Space_Mono, UnifrakturMaguntia } from "next/font/google";
import "./globals.css";
import { LanguageProvider } from "@/shared/i18n/LanguageProvider";
import { HtmlLangSync } from "@/widgets/i18n/HtmlLangSync";
import { NavigationScrollManager } from "@/widgets/navigation/NavigationScrollManager";
import { PublicAtmosphere } from "@/widgets/layout/PublicAtmosphere";
import { ErrorBoundary } from "@/shared/ui/ErrorBoundary";

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

export const metadata: Metadata = {
  title: "Neutrottt · Sombras y Lettering",
  description: "Lettering y sombras · Neutrottt · Medellín.",
  metadataBase: new URL(
    process.env.NEXT_PUBLIC_SITE_URL?.trim() || "https://neutrott.vercel.app",
  ),
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#17110d",
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
