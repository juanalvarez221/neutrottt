import type { Metadata } from "next";
import { Bebas_Neue, Montserrat, Space_Mono, UnifrakturMaguntia } from "next/font/google";
import "./globals.css";
import { LanguageProvider } from "@/shared/i18n/LanguageProvider";
import { LanguagePrompt } from "@/widgets/i18n/LanguagePrompt";
import { NavigationScrollManager } from "@/widgets/navigation/NavigationScrollManager";
import { QuickActionDock } from "@/widgets/navigation/QuickActionDock";

const fontSans = Montserrat({
  variable: "--font-sans",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

/** Integral CF EB no está en Google Fonts; Bebas Neue es el sustituto más cercano para títulos. */
const fontDisplay = Bebas_Neue({
  variable: "--font-display",
  subsets: ["latin"],
  weight: ["400"],
});

const fontMono = Space_Mono({
  variable: "--font-mono",
  subsets: ["latin"],
  weight: ["400", "700"],
});

const fontGothic = UnifrakturMaguntia({
  variable: "--font-gothic",
  subsets: ["latin"],
  weight: ["400"],
});

export const metadata: Metadata = {
  title: "Neutrottt — Sombras y Lettering",
  description: "Tatuador en sombras y lettering · Emerald Tattoo Studio, Medellín.",
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
          <NavigationScrollManager />
          <div aria-hidden className="amber-storm">
            <span className="amber-storm__flash amber-storm__flash--a" />
            <span className="amber-storm__flash amber-storm__flash--b" />
            <span className="amber-storm__flash amber-storm__flash--c" />
          </div>
          <div className="relative z-10">{children}</div>
          <QuickActionDock />
          <LanguagePrompt />
        </LanguageProvider>
      </body>
    </html>
  );
}
