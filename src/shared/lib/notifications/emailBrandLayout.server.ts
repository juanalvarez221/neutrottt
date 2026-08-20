import { BRAND } from "@/shared/config/brand";

const FONT_IMPORT =
  "@import url('https://fonts.googleapis.com/css2?family=Bebas+Neue&family=Montserrat:wght@400;600&family=Space+Mono:wght@400;700&family=UnifrakturMaguntia&display=swap');";

const FONT_BRAND = "'UnifrakturMaguntia', 'Times New Roman', serif";
const FONT_DISPLAY = "'Bebas Neue', 'Arial Narrow', sans-serif";
const FONT_SANS = "Montserrat, 'Helvetica Neue', Arial, sans-serif";
const FONT_MONO = "'Space Mono', ui-monospace, monospace";

/** Paleta identica a globals.css de la web. */
export const EMAIL_COLOR = {
  cafe: "#17110d",
  espresso: "#2a1c16",
  cacao: "#4a3428",
  taupe: "#7b6352",
  camel: "#b88958",
  sand: "#d4a066",
  honey: "#e8a840",
  amber: "#d97a28",
  terracotta: "#b86238",
  ivory: "#f3e6d7",
} as const;

export type EmailFact = {
  label: string;
  value: string;
  href?: string;
};

export type EmailAction = {
  href: string;
  label: string;
};

export function escapeEmailHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function factsTable(facts: EmailFact[]): string {
  if (facts.length === 0) return "";
  const rows = facts
    .map((fact, index) => {
      const border = index === 0 ? "none" : `1px solid rgba(${"243,230,215"},0.10)`;
      const value = fact.href
        ? `<a href="${escapeEmailHtml(fact.href)}" style="color:${EMAIL_COLOR.honey};text-decoration:underline;text-underline-offset:3px">${escapeEmailHtml(fact.value)}</a>`
        : escapeEmailHtml(fact.value);
      return `<tr>
        <td width="132" style="padding:13px 16px 13px 0;font-family:${FONT_SANS};font-size:10px;letter-spacing:0.2em;text-transform:uppercase;color:${EMAIL_COLOR.taupe};white-space:nowrap;border-top:${border};vertical-align:top">${escapeEmailHtml(fact.label)}</td>
        <td style="padding:12px 0;font-family:${FONT_MONO};font-size:13px;line-height:1.55;color:${EMAIL_COLOR.ivory};border-top:${border};vertical-align:top">${value}</td>
      </tr>`;
    })
    .join("");
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;background:${EMAIL_COLOR.espresso};padding:0;">
    <tr><td style="padding:6px 22px 8px;border-left:2px solid ${EMAIL_COLOR.honey};">${rows ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;">${rows}</table>` : ""}</td></tr>
  </table>`;
}

export function wrapStudioEmail(input: {
  kicker: string;
  headline: string;
  lead: string;
  facts?: EmailFact[];
  closing?: string;
  action?: EmailAction;
}): string {
  const facts = input.facts?.filter((fact) => fact.value.trim()) ?? [];
  const action = input.action
    ? `<p style="margin:28px 0 0">
        <a href="${escapeEmailHtml(input.action.href)}" style="font-family:${FONT_DISPLAY};font-size:20px;letter-spacing:0.16em;text-transform:uppercase;color:${EMAIL_COLOR.honey};text-decoration:none;border-bottom:1px solid ${EMAIL_COLOR.honey};padding:0 0 6px;display:inline-block">${escapeEmailHtml(input.action.label)}</a>
      </p>`
    : "";

  return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <style type="text/css">${FONT_IMPORT}</style>
</head>
<body style="margin:0;padding:0;background:${EMAIL_COLOR.cafe};">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${EMAIL_COLOR.cafe};">
    <tr>
      <td style="padding:40px 18px 56px;">
        <table role="presentation" width="560" cellpadding="0" cellspacing="0" align="left" style="width:100%;max-width:560px;border-collapse:collapse;">
          <tr>
            <td style="padding:0 0 8px;">
              <p style="margin:0;font-family:${FONT_BRAND};font-size:54px;line-height:0.88;color:${EMAIL_COLOR.honey};">${escapeEmailHtml(BRAND.name)}</p>
            </td>
          </tr>
          <tr>
            <td style="padding:0 0 26px;">
              <p style="margin:0;font-family:${FONT_SANS};font-size:10px;letter-spacing:0.36em;text-transform:uppercase;color:${EMAIL_COLOR.camel};">Experto en sombras y lettering</p>
            </td>
          </tr>
          <tr>
            <td style="height:1px;background:rgba(232,168,64,0.38);font-size:0;line-height:0;">&nbsp;</td>
          </tr>
          <tr>
            <td style="padding:24px 0 4px;">
              <p style="margin:0;font-family:${FONT_SANS};font-size:11px;letter-spacing:0.28em;text-transform:uppercase;color:${EMAIL_COLOR.sand};">${escapeEmailHtml(input.kicker)}</p>
            </td>
          </tr>
          <tr>
            <td style="padding:0 0 14px;">
              <h1 style="margin:0;font-family:${FONT_DISPLAY};font-size:44px;line-height:0.9;letter-spacing:0.04em;text-transform:uppercase;color:${EMAIL_COLOR.ivory};font-weight:400;">${escapeEmailHtml(input.headline)}</h1>
            </td>
          </tr>
          <tr>
            <td style="padding:0 0 24px;">
              <p style="margin:0;font-family:${FONT_SANS};font-size:16px;line-height:1.65;color:${EMAIL_COLOR.sand};max-width:46ch;">${escapeEmailHtml(input.lead)}</p>
            </td>
          </tr>
          <tr>
            <td style="padding:0 0 8px;">
              <p style="margin:0 0 10px;font-family:${FONT_SANS};font-size:10px;letter-spacing:0.26em;text-transform:uppercase;color:${EMAIL_COLOR.honey};">Detalle de la reserva</p>
              ${factsTable(facts)}
            </td>
          </tr>
          <tr>
            <td style="padding:8px 0 0;">
              ${action}
              ${
                input.closing
                  ? `<p style="margin:22px 0 0;font-family:${FONT_SANS};font-size:14px;line-height:1.65;color:${EMAIL_COLOR.taupe};">${escapeEmailHtml(input.closing)}</p>`
                  : ""
              }
            </td>
          </tr>
          <tr>
            <td style="padding:32px 0 0;">
              <div style="height:1px;background:rgba(243,230,215,0.1);font-size:0;line-height:0;">&nbsp;</div>
              <p style="margin:18px 0 0;font-family:${FONT_BRAND};font-size:22px;color:${EMAIL_COLOR.honey};">${escapeEmailHtml(BRAND.name)}</p>
              <p style="margin:6px 0 0;font-family:${FONT_SANS};font-size:10px;letter-spacing:0.22em;text-transform:uppercase;color:${EMAIL_COLOR.taupe};">Medellín · sombras y lettering</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}
