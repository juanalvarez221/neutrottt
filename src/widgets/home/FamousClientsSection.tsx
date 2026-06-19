"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import Image from "next/image";
import { AnimatePresence, motion } from "framer-motion";
import {
  ArrowLeft,
  ArrowUpRight,
  Bookmark,
  ChevronLeft,
  ChevronRight,
  Heart,
  MapPin,
  MessageCircle,
  MoreHorizontal,
  Play,
  Send,
} from "lucide-react";
import { useSiteLanguage } from "@/shared/i18n/LanguageProvider";
import type { SiteCopyKey } from "@/shared/i18n/siteLanguage";
import { useHorizontalDragScroll } from "@/shared/hooks/useHorizontalDragScroll";
import { scrollRevealViewport } from "@/shared/motion/scrollReveal";

type ClientMedia =
  | { type: "image"; src: string; altKey: SiteCopyKey }
  | { type: "video"; src: string; altKey: SiteCopyKey; poster?: string };

type ClientTattoo = {
  id: string;
  captionKey: SiteCopyKey;
  media: ClientMedia[];
};

type FeaturedClient = {
  id: string;
  handle: string;
  instagramUrl: string;
  avatar: string;
  avatarAltKey: SiteCopyKey;
  avatarPosition?: string;
  tattoos: ClientTattoo[];
};

const FEATURED_CLIENTS: FeaturedClient[] = [
  {
    id: "kris-r",
    handle: "@krisrofficial",
    instagramUrl: "https://www.instagram.com/krisrofficial/",
    avatar: "/brand/client-kris-r.png",
    avatarAltKey: "famousClientKrisAvatarAlt",
    avatarPosition: "center 20%",
    tattoos: [
      {
        id: "kris-arm",
        captionKey: "famousPostCaptionKris",
        media: [
          { type: "image", src: "/brand/client-kris-r-1.png", altKey: "famousClientKrisAlt" },
          {
            type: "video",
            src: "/brand/client-kris-r-video.mp4",
            altKey: "famousClientKrisVideoAlt",
            poster: "/brand/client-kris-r-1.png",
          },
          { type: "image", src: "/brand/client-kris-r-3.jpg", altKey: "famousClientKrisArtAlt" },
        ],
      },
    ],
  },
  {
    id: "roapr",
    handle: "@roapr__",
    instagramUrl: "https://www.instagram.com/roapr__/",
    avatar: "/brand/client-roapr.png",
    avatarAltKey: "famousClientRoaprAvatarAlt",
    avatarPosition: "center 35%",
    tattoos: [
      {
        id: "roa-lettering-floral",
        captionKey: "famousPostCaptionRoaT1",
        media: [
          { type: "image", src: "/brand/client-roa-1.png", altKey: "famousClientRoaprAlt" },
          { type: "image", src: "/brand/client-roa-2.png", altKey: "famousClientRoaprT1Alt" },
          { type: "image", src: "/brand/client-roa-3.png", altKey: "famousClientRoaprT1bAlt" },
          {
            type: "video",
            src: "/brand/client-roa-video-1.mp4",
            altKey: "famousClientRoaprVideo1Alt",
            poster: "/brand/client-roa-3.png",
          },
        ],
      },
      {
        id: "roa-lettering-red",
        captionKey: "famousPostCaptionRoaT2",
        media: [
          { type: "image", src: "/brand/client-roa-4.png", altKey: "famousClientRoaprT2Alt" },
          {
            type: "video",
            src: "/brand/client-roa-video-2.mp4",
            altKey: "famousClientRoaprVideo2Alt",
            poster: "/brand/client-roa-4.png",
          },
          { type: "image", src: "/brand/client-roa-5.png", altKey: "famousClientRoaprStudioAlt" },
        ],
      },
    ],
  },
  {
    id: "eljoc07",
    handle: "@eljoc07",
    instagramUrl: "https://www.instagram.com/eljoc07/",
    avatar: "/brand/client-eljoc07.png",
    avatarAltKey: "famousClientEljoc07AvatarAlt",
    avatarPosition: "center 30%",
    tattoos: [
      {
        id: "eljoc-shoulder",
        captionKey: "famousPostCaptionEljoc",
        media: [
          { type: "image", src: "/brand/client-eljoc-1.png", altKey: "famousClientEljoc07Alt" },
          { type: "image", src: "/brand/client-eljoc-2.png", altKey: "famousClientEljoc07DetailAlt" },
          { type: "image", src: "/brand/client-eljoc-3.jpg", altKey: "famousClientEljoc07StudioAlt" },
        ],
      },
    ],
  },
];

function ClientMediaFrame({ item, alt }: { item: ClientMedia; alt: string }) {
  if (item.type === "video") {
    return (
      <video
        src={item.src}
        poster={item.poster}
        className="h-full w-full object-contain"
        autoPlay
        muted
        loop
        playsInline
        preload="metadata"
        aria-label={alt}
      />
    );
  }

  return (
    <div className="relative h-full w-full">
      <Image
        src={item.src}
        alt={alt}
        fill
        quality={92}
        sizes="(max-width: 640px) 100vw, 680px"
        className="object-contain"
      />
    </div>
  );
}

function ClientProfileCard({
  client,
  index,
  verifiedAlt,
  t,
  onSelect,
}: {
  client: FeaturedClient;
  index: number;
  verifiedAlt: string;
  t: (key: SiteCopyKey, vars?: Record<string, string>) => string;
  onSelect: () => void;
}) {
  return (
    <motion.button
      type="button"
      initial={{ opacity: 0, y: 16 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={scrollRevealViewport}
      transition={{
        duration: 0.45,
        delay: index * 0.07,
        ease: "easeOut",
        type: "spring",
        stiffness: 380,
        damping: 26,
      }}
      whileHover={{ y: -4, scale: 1.015 }}
      onClick={onSelect}
      className="featured-client-card group text-left"
    >
      <span className="featured-client-card__spotlight" aria-hidden />

      <div className="featured-client-card__tile">
        <div className="featured-client-card__main">
          <div className="featured-client-card__avatar-ring shrink-0 rounded-full">
            <span className="featured-client-card__avatar-glow" aria-hidden />
            <div className="featured-client-card__avatar relative overflow-hidden rounded-full bg-zinc-900">
              <Image
                src={client.avatar}
                alt={t(client.avatarAltKey)}
                fill
                className="object-cover transition duration-500 group-hover:scale-[1.06]"
                style={{ objectPosition: client.avatarPosition ?? "center" }}
                sizes="(max-width: 639px) 30vw, (max-width: 1023px) 28vw, 240px"
              />
            </div>
          </div>

          <p className="featured-client-card__handle flex items-center justify-center gap-1.5 text-ivory">
            <span className="truncate">{client.handle}</span>
            <span className="famous-badge-wrap relative inline-flex shrink-0">
              <span className="famous-badge-glow" aria-hidden />
              <Image
                src="/brand/verified-badge.png"
                alt={verifiedAlt}
                width={16}
                height={16}
                className="relative z-10 h-4 w-4 object-contain sm:h-[1.125rem] sm:w-[1.125rem] lg:h-5 lg:w-5"
              />
            </span>
          </p>
        </div>

        <span className="featured-client-card__cta">
          {t("famousViewGallery")}
          <ArrowUpRight className="h-3.5 w-3.5 shrink-0 transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5" />
        </span>
      </div>
    </motion.button>
  );
}

function FeaturedClientGrid({ children }: { children: ReactNode }) {
  return <div className="featured-client-grid-shell">{children}</div>;
}

function GalleryPostCard({
  client,
  tattoo,
  verifiedAlt,
  t,
}: {
  client: FeaturedClient;
  tattoo: ClientTattoo;
  verifiedAlt: string;
  t: (key: SiteCopyKey, vars?: Record<string, string>) => string;
}) {
  const [slide, setSlide] = useState(0);
  const scrollerRef = useRef<HTMLDivElement>(null);
  useHorizontalDragScroll(scrollerRef);

  const username = client.handle.replace("@", "");

  const slides: { key: string; content: ReactNode; isVideo?: boolean }[] = tattoo.media.map(
    (item) => ({
      key: item.src,
      isVideo: item.type === "video",
      content: <ClientMediaFrame item={item} alt={t(item.altKey)} />,
    }),
  );

  const multi = slides.length > 1;

  const syncSlide = useCallback(() => {
    const el = scrollerRef.current;
    if (!el || el.offsetWidth === 0) return;
    const index = Math.round(el.scrollLeft / el.offsetWidth);
    setSlide(Math.min(index, slides.length - 1));
  }, [slides.length]);

  const goToSlide = (index: number) => {
    const el = scrollerRef.current;
    if (!el) return;
    el.scrollTo({ left: index * el.offsetWidth, behavior: "smooth" });
    setSlide(index);
  };

  return (
    <motion.article
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: "easeOut" }}
      className="ig-post-card relative w-full overflow-hidden rounded-none border-x-0 sm:rounded-xl sm:border-x"
    >
      <header className="ig-post-header flex items-center gap-3 px-3 py-2.5 sm:px-4 sm:py-3">
        <div className="ig-post-avatar-ring shrink-0 rounded-full">
          <div className="relative h-9 w-9 overflow-hidden rounded-full bg-zinc-900 sm:h-10 sm:w-10">
            <Image
              src={client.avatar}
              alt={t(client.avatarAltKey)}
              fill
              className="object-cover"
              style={{ objectPosition: client.avatarPosition ?? "center" }}
              sizes="40px"
            />
          </div>
        </div>
        <div className="min-w-0 flex-1">
          <p className="typo-ui flex items-center gap-1.5 text-white">
            <span className="truncate">{username}</span>
            <span className="famous-badge-wrap relative inline-flex shrink-0">
              <span className="famous-badge-glow" aria-hidden />
              <Image
                src="/brand/verified-badge.png"
                alt={verifiedAlt}
                width={16}
                height={16}
                className="relative z-10 h-4 w-4 object-contain"
              />
            </span>
          </p>
          <p className="typo-ui-meta mt-0.5 flex items-center gap-1 truncate">
            <MapPin className="h-3 w-3 shrink-0" strokeWidth={2} />
            {t("famousPostLocation")}
          </p>
        </div>
        <span className="ig-post-header__menu inline-flex h-8 w-8 items-center justify-center text-zinc-300" aria-hidden>
          <MoreHorizontal className="h-5 w-5" strokeWidth={1.75} />
        </span>
      </header>

      <div className="relative bg-black">
        <div
          ref={scrollerRef}
          onScroll={syncSlide}
          className={
            multi
              ? "ig-post-media-scroll relative flex w-full snap-x snap-mandatory overflow-x-auto overscroll-x-contain [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
              : "relative w-full"
          }
        >
          {slides.map((s) => (
            <div
              key={s.key}
              className={multi ? "relative min-w-full shrink-0 snap-center" : "relative w-full"}
            >
              <div className="ig-post-media-frame w-full">{s.content}</div>
              {s.isVideo ? (
                <span className="pointer-events-none absolute right-3 top-3 flex h-7 w-7 items-center justify-center rounded-full bg-black/55 text-white backdrop-blur-sm">
                  <Play className="h-3.5 w-3.5 fill-current" strokeWidth={0} />
                </span>
              ) : null}
            </div>
          ))}
        </div>

        {multi ? (
          <>
            <div className="typo-ui-meta pointer-events-none absolute right-3 top-3 rounded-md bg-black/65 px-2 py-0.5 font-semibold tabular-nums text-white backdrop-blur-sm">
              {slide + 1}/{slides.length}
            </div>
            {slide > 0 ? (
              <button
                type="button"
                onClick={() => goToSlide(slide - 1)}
                className="absolute left-1 top-1/2 z-10 flex min-h-[44px] min-w-[44px] -translate-y-1/2 items-center justify-center rounded-full bg-black/50 p-2.5 text-white backdrop-blur-sm transition hover:bg-black/70"
                aria-label={t("famousGalleryPrev")}
              >
                <ChevronLeft className="h-5 w-5" strokeWidth={2} />
              </button>
            ) : null}
            {slide < slides.length - 1 ? (
              <button
                type="button"
                onClick={() => goToSlide(slide + 1)}
                className="absolute right-1 top-1/2 z-10 flex min-h-[44px] min-w-[44px] -translate-y-1/2 items-center justify-center rounded-full bg-black/50 p-2.5 text-white backdrop-blur-sm transition hover:bg-black/70"
                aria-label={t("famousGalleryNext")}
              >
                <ChevronRight className="h-5 w-5" strokeWidth={2} />
              </button>
            ) : null}
            <div className="absolute bottom-3 left-0 right-0 flex justify-center gap-1.5">
              {slides.map((_, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => goToSlide(i)}
                  aria-label={t("famousGallerySlide", { index: String(i + 1) })}
                  className="flex h-11 w-11 items-center justify-center"
                >
                  <span
                    className={`block rounded-full transition-all ${
                      i === slide ? "ig-post-dot-active h-1.5 w-4" : "h-1.5 w-1.5 bg-white/45 hover:bg-white/70"
                    }`}
                  />
                </button>
              ))}
            </div>
          </>
        ) : null}
      </div>

      <div className="ig-post-body px-3 pb-3 pt-2.5 sm:px-4 sm:pb-4 sm:pt-3">
        <div className="ig-post-actions" aria-hidden>
          <div className="ig-post-actions__left">
            <span className="ig-action-btn inline-flex">
              <Heart className="h-6 w-6 text-white" strokeWidth={1.75} />
            </span>
            <span className="ig-action-btn inline-flex">
              <MessageCircle className="h-6 w-6 text-white" strokeWidth={1.75} />
            </span>
            <span className="ig-action-btn inline-flex">
              <Send className="h-6 w-6 text-white" strokeWidth={1.75} />
            </span>
          </div>
          <span className="ig-action-btn inline-flex">
            <Bookmark className="h-6 w-6 text-white" strokeWidth={1.75} />
          </span>
        </div>

        <p className="typo-body typo-body-emphasis mt-2 text-[0.8125rem] leading-snug sm:text-[0.875rem]">
          <span className="typo-ui text-white">{username}</span>{" "}
          <span className="text-zinc-200">{t(tattoo.captionKey)}</span>
        </p>
      </div>
    </motion.article>
  );
}

function ClientGalleryModal({
  client,
  verifiedAlt,
  t,
  onClose,
}: {
  client: FeaturedClient;
  verifiedAlt: string;
  t: (key: SiteCopyKey, vars?: Record<string, string>) => string;
  onClose: () => void;
}) {
  const username = client.handle.replace("@", "");

  useEffect(() => {
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, []);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  return (
    <motion.div
      className="featured-client-modal fixed inset-0 z-[75] flex items-end justify-center sm:items-center"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      role="dialog"
      aria-modal="true"
      aria-label={`${username} — ${t("famousViewGallery")}`}
    >
      <button
        type="button"
        className="absolute inset-0 bg-background/88 backdrop-blur-sm"
        aria-label={t("famousDetailClose")}
        onClick={onClose}
      />

      <motion.div
        initial={{ opacity: 0, y: 28 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: 20 }}
        transition={{ duration: 0.32, ease: [0.22, 1, 0.36, 1] }}
        className="featured-client-modal__panel relative z-10 w-full max-w-[430px] sm:max-w-[480px]"
      >
        <div className="featured-client-modal__toolbar">
          <button
            type="button"
            onClick={onClose}
            className="featured-client-modal__back focus-ring inline-flex items-center justify-center rounded-full p-2 text-zinc-100 transition hover:bg-white/8 active:scale-[0.98]"
            aria-label={t("famousDetailClose")}
          >
            <ArrowLeft className="h-5 w-5" strokeWidth={2} />
          </button>

          <div className="featured-client-modal__title-wrap min-w-0 text-center">
            <p className="featured-client-modal__title truncate">{username}</p>
            <p className="featured-client-modal__subtitle typo-ui-meta truncate">{t("famousPostLocation")}</p>
          </div>

          <span className="featured-client-modal__toolbar-spacer" aria-hidden />
        </div>

        <div className="featured-client-modal__content">
          <div className="featured-client-modal__feed">
            {client.tattoos.map((tattoo) => (
              <GalleryPostCard
                key={tattoo.id}
                client={client}
                tattoo={tattoo}
                verifiedAlt={verifiedAlt}
                t={t}
              />
            ))}
            {client.tattoos.length > 1 ? (
              <p className="featured-client-modal__feed-note typo-tech text-center text-[0.68rem] uppercase tracking-[0.18em] text-taupe">
                {t("famousGalleryScrollHint")}
              </p>
            ) : null}
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
}

export function FamousClientsSection() {
  const { t } = useSiteLanguage();
  const [selectedClientId, setSelectedClientId] = useState<string | null>(null);
  const selectedClient = FEATURED_CLIENTS.find((client) => client.id === selectedClientId) ?? null;

  return (
    <>
      <motion.section
        initial={{ opacity: 0, y: 20 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={scrollRevealViewport}
        transition={{ duration: 0.55, ease: "easeOut" }}
        className="page-section page-section-y section-surface section-surface--clients section-divider famous-section relative w-full overflow-hidden"
        aria-labelledby="famous-clients-heading"
      >
        <div className="pointer-events-none absolute inset-x-0 top-0 z-[2] h-px bg-gradient-to-r from-transparent via-white/10 to-transparent" />

        <div className="page-section-pad relative z-10">
          <div className="famous-section__header max-w-2xl">
            <p className="typo-eyebrow typo-eyebrow-muted">{t("famousTag")}</p>
            <h2 id="famous-clients-heading" className="famous-section__title mt-2">
              {t("famousTitle")}
            </h2>
            <p className="famous-section__lead mt-2">{t("famousBody")}</p>
          </div>

          <FeaturedClientGrid>
            <div className="featured-client-grid">
              {FEATURED_CLIENTS.map((client, index) => (
                <ClientProfileCard
                  key={client.id}
                  client={client}
                  index={index}
                  verifiedAlt={t("famousVerifiedAlt")}
                  t={t}
                  onSelect={() => setSelectedClientId(client.id)}
                />
              ))}
            </div>
          </FeaturedClientGrid>
        </div>
      </motion.section>

      <AnimatePresence>
        {selectedClient ? (
          <ClientGalleryModal
            key={selectedClient.id}
            client={selectedClient}
            verifiedAlt={t("famousVerifiedAlt")}
            t={t}
            onClose={() => setSelectedClientId(null)}
          />
        ) : null}
      </AnimatePresence>
    </>
  );
}
