"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import gsap from "gsap";
import { useGSAP } from "@gsap/react";
import { useReducedMotion } from "framer-motion";
import { Check, ExternalLink } from "lucide-react";
import { SocialBrandIcon } from "@/shared/ui/SocialBrandIcon";
import { BRAND, WHATSAPP_MESSAGES, whatsappUrl } from "@/shared/config/brand";
import { QuoteShell } from "@/widgets/quote/QuoteShell";
import { useSiteLanguage } from "@/shared/i18n/LanguageProvider";
import { getQuoteCompletionType } from "@/shared/lib/quoteDraft";
import { QUOTE_FLOW_PATHS, startNewQuoteSession } from "@/shared/lib/quoteFlow";

gsap.registerPlugin(useGSAP);

type AdvisoryConfirmation = {
  label: string;
  mode: "presencial" | "virtual";
  whatsappUrl: string;
  meetingLink?: string;
};

export function QuoteThanksStep() {
  const { t } = useSiteLanguage();
  const reduceMotion = useReducedMotion();
  const rootRef = useRef<HTMLElement>(null);
  const [isAdvisory, setIsAdvisory] = useState(false);
  const [advisoryConfirmation, setAdvisoryConfirmation] = useState<AdvisoryConfirmation | null>(
    null,
  );

  useEffect(() => {
    setIsAdvisory(getQuoteCompletionType() === "asesoria");
    const raw = sessionStorage.getItem("quote_advisory_confirmation");
    if (!raw) return;
    try {
      setAdvisoryConfirmation(JSON.parse(raw) as AdvisoryConfirmation);
    } catch {
      setAdvisoryConfirmation(null);
    }
  }, []);

  useGSAP(
    () => {
      const root = rootRef.current;
      if (!root) return;

      if (reduceMotion) {
        gsap.set(".quote-thanks__reveal", { clearProps: "all", opacity: 1, y: 0, scale: 1 });
        return;
      }

      const tl = gsap.timeline({ defaults: { ease: "power3.out" } });

      tl.fromTo(
        ".quote-thanks__orb",
        { opacity: 0, scale: 0.72 },
        { opacity: 1, scale: 1, duration: 1.2, ease: "power2.out" },
        0,
      )
        .fromTo(
          ".quote-thanks__mark",
          { opacity: 0, scale: 0.6, rotate: -12 },
          { opacity: 1, scale: 1, rotate: 0, duration: 0.75, ease: "back.out(1.6)" },
          0.2,
        )
        .fromTo(
          ".quote-thanks__tag",
          { opacity: 0, y: 12, filter: "blur(6px)" },
          { opacity: 1, y: 0, filter: "blur(0px)", duration: 0.55 },
          0.42,
        )
        .fromTo(
          ".quote-thanks__title",
          { opacity: 0, y: 28 },
          { opacity: 1, y: 0, duration: 0.8 },
          0.52,
        )
        .fromTo(
          ".quote-thanks__body",
          { opacity: 0, y: 16 },
          { opacity: 1, y: 0, duration: 0.65 },
          0.7,
        )
        .fromTo(
          ".quote-thanks__slot",
          { opacity: 0, y: 14, scale: 0.98 },
          { opacity: 1, y: 0, scale: 1, duration: 0.55 },
          0.88,
        )
        .fromTo(
          ".quote-thanks__actions > *",
          { opacity: 0, y: 18 },
          { opacity: 1, y: 0, duration: 0.5, stagger: 0.08 },
          1.0,
        );

      gsap.to(".quote-thanks__orb", {
        scale: 1.06,
        opacity: 0.88,
        duration: 5.5,
        yoyo: true,
        repeat: -1,
        ease: "sine.inOut",
        delay: 1.3,
      });
    },
    { scope: rootRef, dependencies: [reduceMotion, isAdvisory, advisoryConfirmation?.label] },
  );

  const whatsappHref =
    isAdvisory && advisoryConfirmation?.whatsappUrl
      ? advisoryConfirmation.whatsappUrl
      : whatsappUrl(WHATSAPP_MESSAGES.quoteFollowUp);

  const title = isAdvisory ? t("quoteThanksAdvisoryTitle") : t("quoteThanksTitle");
  const body = isAdvisory ? t("quoteThanksAdvisoryBody") : t("quoteThanksBody");
  const primaryWhatsappLabel = isAdvisory
    ? t("quoteThanksAdvisoryWhatsapp")
    : t("quoteThanksWhatsappCta");

  return (
    <QuoteShell showGreeting={false}>
      <section ref={rootRef} className="quote-thanks" aria-labelledby="quote-thanks-title">
        <div className="quote-thanks__ambient" aria-hidden>
          <span className="quote-thanks__orb quote-thanks__reveal" />
        </div>

        <div className="quote-thanks__stage">
          <div className="quote-thanks__mark quote-thanks__reveal" aria-hidden>
            <Check className="h-7 w-7" strokeWidth={2.25} />
          </div>

          <p className="quote-thanks__tag quote-thanks__reveal">{t("quoteThanksTag")}</p>

          <h1 id="quote-thanks-title" className="quote-thanks__title quote-thanks__reveal">
            {title}
          </h1>

          <p className="quote-thanks__body quote-thanks__reveal">{body}</p>

          {isAdvisory && advisoryConfirmation ? (
            <div className="quote-thanks__slot quote-thanks__reveal">
              <p className="quote-thanks__slot-label">{t("quoteThanksAdvisorySlot")}</p>
              <p className="quote-thanks__slot-value">{advisoryConfirmation.label}</p>
              {advisoryConfirmation.meetingLink ? (
                <a
                  href={advisoryConfirmation.meetingLink}
                  target="_blank"
                  rel="noreferrer"
                  className="quote-thanks__meeting focus-ring"
                >
                  {t("quoteThanksMeetingCta")}
                  <ExternalLink className="h-3.5 w-3.5" strokeWidth={2} />
                </a>
              ) : null}
            </div>
          ) : null}

          <div className="quote-thanks__actions">
            <a
              href={whatsappHref}
              target="_blank"
              rel="noreferrer"
              className="quote-thanks__cta quote-thanks__cta--primary focus-ring btn-accent"
            >
              <SocialBrandIcon network="whatsapp" className="h-8 w-8" />
              {primaryWhatsappLabel}
            </a>

            <div className="quote-thanks__secondary">
              <a
                href={BRAND.instagramUrl}
                target="_blank"
                rel="noreferrer"
                className="quote-thanks__cta quote-thanks__cta--ghost focus-ring"
              >
                <SocialBrandIcon network="instagram" className="h-7 w-7" />
                {t("quoteThanksInstagramCta")}
              </a>

              <Link
                href={QUOTE_FLOW_PATHS.quoteStart}
                onClick={() => startNewQuoteSession()}
                className="quote-thanks__link focus-ring"
              >
                {t("quoteThanksNewQuoteCta")}
              </Link>
            </div>
          </div>
        </div>
      </section>
    </QuoteShell>
  );
}
