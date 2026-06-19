import { AppShell } from "@/widgets/layout/AppShell";
import { Card } from "@/shared/ui/Card";
import { Button } from "@/shared/ui/Button";
import { SocialBrandIcon } from "@/shared/ui/SocialBrandIcon";
import { StudioLocationTrigger } from "@/shared/ui/StudioLocationTrigger";
import { BRAND, WHATSAPP_MESSAGES, whatsappUrl } from "@/shared/config/brand";
import { STUDIO } from "@/shared/config/studio";

export default function ContactoPage() {
  return (
    <AppShell>
      <header>
        <p className="typo-eyebrow typo-eyebrow-muted">Contacto</p>
        <h1 className="typo-section-sm mt-2">Hablemos</h1>
      </header>

      <div className="mt-5 grid gap-3">
        <StudioLocationTrigger variant="card" />

        <Button className="w-full" href={STUDIO.mapsUrl}>
          Ver en Google Maps
        </Button>

        <Card>
          <div className="p-4">
            <SocialBrandIcon network="whatsapp" className="h-12 w-12" />
            <p className="typo-subtitle mt-3 text-sm">WhatsApp</p>
            <p className="typo-body mt-1 text-sm text-zinc-400">Cotizaciones y agenda.</p>
            <div className="mt-3">
              <Button className="w-full" href={whatsappUrl(WHATSAPP_MESSAGES.contact)}>
                Continuar en WhatsApp
              </Button>
            </div>
          </div>
        </Card>

        <Card>
          <div className="p-4">
            <SocialBrandIcon network="instagram" className="h-12 w-12" />
            <p className="mt-3 text-sm font-semibold text-zinc-50">Instagram</p>
            <p className="mt-1 text-xs text-zinc-400">@{BRAND.instagramHandle}</p>
            <div className="mt-3">
              <Button className="w-full" href={BRAND.instagramUrl}>
                Abrir Instagram
              </Button>
            </div>
          </div>
        </Card>
      </div>
    </AppShell>
  );
}
