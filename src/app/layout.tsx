import type { Metadata, Viewport } from "next";
import { Inter, Space_Mono, Syncopate, UnifrakturMaguntia } from "next/font/google";
import "./globals.css";
import { LanguageProvider } from "@/shared/i18n/LanguageProvider";
import { CartProvider } from "@/shared/lib/cart";
import { HtmlLangSync } from "@/widgets/i18n/HtmlLangSync";
import { NavigationScrollManager } from "@/widgets/navigation/NavigationScrollManager";
import { DeferredChrome } from "@/widgets/layout/DeferredChrome";
import { ErrorBoundary } from "@/shared/ui/ErrorBoundary";
import { CartDrawer } from "@/widgets/shop/CartDrawer";
import { SiteHeader } from "@/features/navigation/SiteHeader";

/** Body UI — clean, quiet, legible against gothic display. */
const fontSans = Inter({
  variable: "--font-sans",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  display: "swap",
  preload: true,
});

/** Elegant display — wide, architectural Syncopate for section hierarchy. */
const fontDisplay = Syncopate({
  variable: "--font-display",
  subsets: ["latin"],
  weight: ["400", "700"],
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

/** Gothic lettering — blackletter mark aligned with Danniel's tattoo craft. */
const fontGothic = UnifrakturMaguntia({
  variable: "--font-gothic",
  subsets: ["latin"],
  weight: ["400"],
  display: "swap",
  preload: true,
});

export const metadata: Metadata = {
  title: {
    default: "Danniel Cuervo · Oficio en piel",
    template: "%s · Danniel Cuervo",
  },
  description:
    "Tatuador en Emerald Tattoo Studio, Medellín. Piezas con oficio, de la idea a la piel.",
  icons: {
    icon: [{ url: "/brand/logo-dc-mark.png", type: "image/png", sizes: "any" }],
    apple: [{ url: "/brand/logo-dc-mark.png", type: "image/png" }],
    shortcut: ["/brand/logo-dc-mark.png"],
  },
  openGraph: {
    title: "Danniel Cuervo · Oficio en piel",
    description:
      "Tatuador en Emerald Tattoo Studio, Medellín. Piezas con oficio, de la idea a la piel.",
    type: "website",
    locale: "es_CO",
  },
  twitter: {
    card: "summary",
    title: "Danniel Cuervo · Oficio en piel",
    description:
      "Tatuador en Emerald Tattoo Studio, Medellín. Piezas con oficio, de la idea a la piel.",
  },
  metadataBase: process.env.NEXT_PUBLIC_SITE_URL
    ? new URL(process.env.NEXT_PUBLIC_SITE_URL)
    : undefined,
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#0e0a0b",
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
