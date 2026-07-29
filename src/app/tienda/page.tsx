"use client";

import { AppShell } from "@/widgets/layout/AppShell";
import { getCatalogProducts } from "@/shared/config/products";
import { ShopCatalog } from "@/widgets/shop/ShopCatalog";
import { useSiteLanguage } from "@/shared/i18n/LanguageProvider";

export default function TiendaPage() {
  const { t } = useSiteLanguage();
  const count = getCatalogProducts().length;

  return (
    <AppShell>
      <header className="grid grid-cols-1 items-end gap-6 border-b border-[rgba(var(--rgb-sand),0.12)] pb-8 md:grid-cols-[1.4fr_0.6fr]">
        <div className="max-w-2xl">
          <p className="font-mono text-[0.62rem] uppercase tracking-[0.18em] text-[rgba(var(--rgb-sand),0.5)]">
            {t("shopPageTag")}
          </p>
          <h1 className="typo-gothic mt-3 text-[clamp(2.2rem,5vw,3.5rem)] text-[rgba(var(--rgb-sand),0.96)]">
            {t("shopPageTitle")}
          </h1>
          <p className="mt-4 max-w-[48ch] text-sm leading-relaxed text-[rgba(var(--rgb-ivory),0.55)]">
            {t("shopPageBody")}
          </p>
        </div>
        <p className="font-mono text-[0.68rem] uppercase tracking-[0.16em] text-[rgba(var(--rgb-sand),0.4)] md:text-right">
          {t("shopCatalogCount").replace("{count}", String(count))}
        </p>
      </header>

      <ShopCatalog />
    </AppShell>
  );
}
