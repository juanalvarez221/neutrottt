import type { Metadata, Viewport } from "next";
import {
  Alex_Brush,
  Bebas_Neue,
  Marck_Script,
  Meddon,
  Montserrat,
  Space_Mono,
  UnifrakturMaguntia,
} from "next/font/google";
import "./globals.css";
import { LanguageProvider } from "@/shared/i18n/LanguageProvider";
import { CartProvider } from "@/shared/lib/cart";
import { HtmlLangSync } from "@/widgets/i18n/HtmlLangSync";
import { NavigationScrollManager } from "@/widgets/navigation/NavigationScrollManager";
import { DeferredChrome } from "@/widgets/layout/DeferredChrome";
import { ErrorBoundary } from "@/shared/ui/ErrorBoundary";
import { CartDrawer } from "@/widgets/shop/CartDrawer";
import { SiteHeader } from "@/features/navigation/SiteHeader";

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

/** Lettering candidates — preview at /dev/fonts; product uses --font-lettering after lock. */
const fontLetteringMarck = Marck_Script({
  variable: "--font-lettering-marck",
  subsets: ["latin"],
  weight: ["400"],
  display: "swap",
  preload: false,
});

const fontLetteringMeddon = Meddon({
  variable: "--font-lettering-meddon",
  subsets: ["latin"],
  weight: ["400"],
  display: "swap",
  preload: false,
});

const fontLetteringAlex = Alex_Brush({
  variable: "--font-lettering-alex",
  subsets: ["latin"],
  weight: ["400"],
  display: "swap",
  preload: false,
});

export const metadata: Metadata = {
  title: "Danniel Cuervo · Lettering · Emerald Tattoo",
  description: "Tatuador especializado en lettering · Emerald Tattoo Studio, Medellín, Colombia.",
  metadataBase: process.env.NEXT_PUBLIC_SITE_URL
    ? new URL(process.env.NEXT_PUBLIC_SITE_URL)
    : undefined,
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
      className={`${fontSans.variable} ${fontDisplay.variable} ${fontMono.variable} ${fontGothic.variable} ${fontLetteringMarck.variable} ${fontLetteringMeddon.variable} ${fontLetteringAlex.variable} h-full antialiased`}
    >
      <body suppressHydrationWarning className="min-h-full flex flex-col bg-background text-ivory">
        <LanguageProvider>
          <CartProvider>
            <HtmlLangSync />
            <NavigationScrollManager />
            <div aria-hidden className="amber-storm">
              <span className="amber-storm__flash amber-storm__flash--a" />
              <span className="amber-storm__flash amber-storm__flash--b" />
              <span className="amber-storm__flash amber-storm__flash--c" />
            </div>
            <SiteHeader />
            <div className="relative z-10">
              <ErrorBoundary>{children}</ErrorBoundary>
            </div>
            <CartDrawer />
            <DeferredChrome />
          </CartProvider>
        </LanguageProvider>
      </body>
    </html>
  );
}
