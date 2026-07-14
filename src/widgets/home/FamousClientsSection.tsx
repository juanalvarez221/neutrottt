"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import Image from "next/image";
import { AnimatePresence, motion } from "framer-motion";
import {
  ArrowUpRight,
  Bookmark,
  ChevronLeft,
  ChevronRight,
  Heart,
  MapPin,
  Maximize2,
  MessageCircle,
  MoreHorizontal,
  Play,
  Send,
  X,
} from "lucide-react";
import { useSiteLanguage } from "@/shared/i18n/LanguageProvider";
import type { SiteCopyKey } from "@/shared/i18n/siteLanguage";
import { useHorizontalDragScroll } from "@/shared/hooks/useHorizontalDragScroll";
import { LazyVideo } from "@/shared/ui/LazyVideo";
import { MediaLightboxPortal } from "@/shared/ui/MediaLightboxPortal";
import { scrollRevealViewport } from "@/shared/motion/scrollReveal";
import { ClientMediaLightboxRoot } from "@/widgets/home/ClientMediaLightbox";

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
  {
    id: "camilog-12",
    handle: "@camilog_12",
    instagramUrl: "https://www.instagram.com/camilog_12/",
    avatar: "/brand/client-camilog-12.png",
    avatarAltKey: "famousClientCamilog12AvatarAlt",
    avatarPosition: "center 35%",
    tattoos: [
      {
        id: "camilog-arms",
        captionKey: "famousPostCaptionCamilog",
        media: [
          { type: "image", src: "/brand/client-camilog-12-1.png", altKey: "famousClientCamilog12Alt" },
          { type: "image", src: "/brand/client-camilog-12-2.png", altKey: "famousClientCamilog12DetailAlt" },
        ],
      },
    ],
  },
];

function InstagramPostActions({
  liked,
  saved,
  shareToast,
  commentHint,
  t,
  onToggleLike,
  onToggleSave,
  onShare,
  onComment,
}: {
  liked: boolean;
  saved: boolean;
  shareToast: boolean;
  commentHint: boolean;
  t: (key: SiteCopyKey, vars?: Record<string, string>) => string;
  onToggleLike: () => void;
  onToggleSave: () => void;
  onShare: () => void;
  onComment: () => void;
}) {
  return (
    <div className="relative">
      <div className="ig-post-actions">
        <div className="ig-post-actions__left">
          <motion.button
            type="button"
            onClick={onToggleLike}
            className="ig-action-btn inline-flex min-h-[44px] min-w-[44px] items-center justify-center"
            aria-label={liked ? t("famousPostUnlike") : t("famousPostLike")}
            whileTap={{ scale: 0.88 }}
            transition={{ type: "spring", stiffness: 520, damping: 28 }}
          >
            <Heart
              className={`h-[1.625rem] w-[1.625rem] transition-colors duration-200 ${
                liked ? "fill-[#ff3040] text-[#ff3040]" : "text-white"
              }`}
              strokeWidth={liked ? 0 : 1.75}
            />
          </motion.button>
          <motion.button
            type="button"
            onClick={onComment}
            className="ig-action-btn inline-flex min-h-[44px] min-w-[44px] items-center justify-center"
            aria-label={t("famousPostComment")}
            whileTap={{ scale: 0.88 }}
            transition={{ type: "spring", stiffness: 520, damping: 28 }}
          >
            <MessageCircle className="h-[1.625rem] w-[1.625rem] text-white" strokeWidth={1.75} />
          </motion.button>
          <motion.button
            type="button"
            onClick={onShare}
            className="ig-action-btn inline-flex min-h-[44px] min-w-[44px] items-center justify-center"
            aria-label={t("famousPostShare")}
            whileTap={{ scale: 0.88 }}
            transition={{ type: "spring", stiffness: 520, damping: 28 }}
          >
            <Send className="h-[1.625rem] w-[1.625rem] text-white" strokeWidth={1.75} />
          </motion.button>
        </div>
        <motion.button
          type="button"
          onClick={onToggleSave}
          className="ig-action-btn inline-flex min-h-[44px] min-w-[44px] items-center justify-center"
          aria-label={saved ? t("famousPostUnsave") : t("famousPostSave")}
          whileTap={{ scale: 0.88 }}
          transition={{ type: "spring", stiffness: 520, damping: 28 }}
        >
          <Bookmark
            className={`h-[1.625rem] w-[1.625rem] transition-colors duration-200 ${
              saved ? "fill-white text-white" : "text-white"
            }`}
            strokeWidth={1.75}
          />
        </motion.button>
      </div>

      {shareToast ? (
        <span className="ig-share-toast pointer-events-none absolute left-1/2 top-0 z-20 -translate-x-1/2 rounded-full bg-zinc-800/95 px-3 py-1.5 text-[0.75rem] font-medium text-white shadow-lg ring-1 ring-white/10">
          {t("famousPostShareCopied")}
        </span>
      ) : null}

      {commentHint ? (
        <span className="ig-share-toast pointer-events-none absolute left-1/2 top-0 z-20 -translate-x-1/2 rounded-full bg-zinc-800/95 px-3 py-1.5 text-[0.75rem] font-medium text-white shadow-lg ring-1 ring-white/10">
          {t("famousPostCommentHint")}
        </span>
      ) : null}
    </div>
  );
}

function ClientMediaFrame({
  item,
  alt,
  isActive = true,
}: {
  item: ClientMedia;
  alt: string;
  isActive?: boolean;
}) {
  if (item.type === "video") {
    return (
      <LazyVideo
        src={item.src}
        poster={item.poster}
        className="h-full w-full object-contain"
        playWhenVisible={isActive}
        autoPlay
        muted
        loop
        playsInline
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
  onExpandMedia,
}: {
  client: FeaturedClient;
  tattoo: ClientTattoo;
  verifiedAlt: string;
  t: (key: SiteCopyKey, vars?: Record<string, string>) => string;
  onExpandMedia: (mediaIndex: number) => void;
}) {
  const [slide, setSlide] = useState(0);
  const [liked, setLiked] = useState(false);
  const [saved, setSaved] = useState(false);
  const [heartBurst, setHeartBurst] = useState<number | null>(null);
  const [shareToast, setShareToast] = useState(false);
  const [commentHint, setCommentHint] = useState(false);
  const scrollerRef = useRef<HTMLDivElement>(null);
  const lastTapRef = useRef(0);
  const expandTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const shareTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const commentTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const { wasDragged } = useHorizontalDragScroll(scrollerRef);

  const username = client.handle.replace("@", "");

  const slides: { key: string; content: ReactNode; isVideo?: boolean }[] = tattoo.media.map(
    (item, mediaIndex) => ({
      key: item.src,
      isVideo: item.type === "video",
      content: (
        <ClientMediaFrame item={item} alt={t(item.altKey)} isActive={slide === mediaIndex} />
      ),
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

  const triggerHeartBurst = useCallback(() => {
    setLiked(true);
    const burstId = Date.now();
    setHeartBurst(burstId);
    window.setTimeout(() => {
      setHeartBurst((current) => (current === burstId ? null : current));
    }, 900);
  }, []);

  const toggleLike = useCallback(() => {
    setLiked((current) => !current);
  }, []);

  const clearExpandTimer = useCallback(() => {
    if (expandTimerRef.current) {
      clearTimeout(expandTimerRef.current);
      expandTimerRef.current = null;
    }
  }, []);

  const handleMediaTap = useCallback(() => {
    if (wasDragged()) return;
    const now = Date.now();
    if (now - lastTapRef.current < 300) {
      clearExpandTimer();
      triggerHeartBurst();
      lastTapRef.current = 0;
      return;
    }
    lastTapRef.current = now;
    clearExpandTimer();
    expandTimerRef.current = setTimeout(() => {
      expandTimerRef.current = null;
      onExpandMedia(slide);
    }, 280);
  }, [clearExpandTimer, onExpandMedia, slide, triggerHeartBurst, wasDragged]);

  const showTransientToast = useCallback(
    (setter: (value: boolean) => void, timerRef: React.MutableRefObject<ReturnType<typeof setTimeout> | null>) => {
      if (timerRef.current) clearTimeout(timerRef.current);
      setter(true);
      timerRef.current = setTimeout(() => {
        setter(false);
        timerRef.current = null;
      }, 2200);
    },
    [],
  );

  const handleShare = useCallback(async () => {
    const shareUrl = client.instagramUrl;
    try {
      if (navigator.share) {
        await navigator.share({ title: client.handle, url: shareUrl });
        return;
      }
      await navigator.clipboard.writeText(shareUrl);
      showTransientToast(setShareToast, shareTimerRef);
    } catch {
      showTransientToast(setShareToast, shareTimerRef);
    }
  }, [client.handle, client.instagramUrl, showTransientToast]);

  const handleComment = useCallback(() => {
    showTransientToast(setCommentHint, commentTimerRef);
    window.open(client.instagramUrl, "_blank", "noopener,noreferrer");
  }, [client.instagramUrl, showTransientToast]);

  useEffect(() => {
    return () => {
      clearExpandTimer();
      if (shareTimerRef.current) clearTimeout(shareTimerRef.current);
      if (commentTimerRef.current) clearTimeout(commentTimerRef.current);
    };
  }, [clearExpandTimer]);

  return (
    <motion.article
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: "easeOut" }}
      className="ig-post-card relative w-full overflow-hidden"
    >
      <header className="ig-post-header flex items-center gap-3 px-3 py-2.5 sm:px-4 sm:py-3">
        <a
          href={client.instagramUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="ig-post-avatar-ring shrink-0 rounded-full transition active:scale-[0.97]"
        >
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
        </a>
        <div className="min-w-0 flex-1">
          <a
            href={client.instagramUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="typo-ui flex items-center gap-1.5 text-white transition hover:opacity-80"
          >
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
          </a>
          <p className="typo-ui-meta mt-0.5 flex items-center gap-1 truncate">
            <MapPin className="h-3 w-3 shrink-0" strokeWidth={2} />
            {t("famousPostLocation")}
          </p>
        </div>
        <span className="ig-post-header__menu inline-flex h-8 w-8 items-center justify-center text-zinc-300" aria-hidden>
          <MoreHorizontal className="h-5 w-5" strokeWidth={1.75} />
        </span>
      </header>

      <div className="relative bg-zinc-950">
        <div
          ref={scrollerRef}
          onScroll={syncSlide}
          className={
            multi
              ? "ig-post-media-scroll relative flex w-full snap-x snap-mandatory overflow-x-auto overscroll-x-contain [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
              : "relative w-full"
          }
        >
          {slides.map((s, mediaIndex) => (
            <div
              key={s.key}
              className={multi ? "relative min-w-full shrink-0 snap-center" : "relative w-full"}
            >
              <div
                role="button"
                tabIndex={0}
                className="ig-post-media-frame ig-post-media-frame--interactive w-full"
                onClick={handleMediaTap}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    onExpandMedia(mediaIndex);
                  }
                }}
                aria-label={t("famousMediaExpand")}
              >
                {s.content}
              </div>
              {s.isVideo ? (
                <span className="pointer-events-none absolute left-3 top-3 flex h-7 w-7 items-center justify-center rounded-full bg-black/55 text-white backdrop-blur-sm">
                  <Play className="h-3.5 w-3.5 fill-current" strokeWidth={0} />
                </span>
              ) : null}
              <button
                type="button"
                className="ig-post-expand focus-ring absolute right-3 top-3 z-10 inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-full bg-black/55 text-white backdrop-blur-sm transition hover:bg-black/70 active:scale-[0.96]"
                onClick={(event) => {
                  event.stopPropagation();
                  onExpandMedia(mediaIndex);
                }}
                aria-label={t("famousMediaExpand")}
              >
                <Maximize2 className="h-4 w-4" strokeWidth={1.75} />
              </button>
            </div>
          ))}
        </div>

        <AnimatePresence>
          {heartBurst !== null ? (
            <motion.div
              key={heartBurst}
              className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center"
              initial={{ opacity: 0, scale: 0.4 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 1.25 }}
              transition={{ type: "spring", stiffness: 420, damping: 22 }}
            >
              <Heart className="ig-heart-burst h-[5.5rem] w-[5.5rem] fill-[#ff3040] text-[#ff3040] sm:h-24 sm:w-24" strokeWidth={0} />
            </motion.div>
          ) : null}
        </AnimatePresence>

        {multi ? (
          <>
            <div className="typo-ui-meta pointer-events-none absolute left-3 top-3 rounded-md bg-black/65 px-2 py-0.5 font-semibold tabular-nums text-white backdrop-blur-sm">
              {slide + 1}/{slides.length}
            </div>
            {slide > 0 ? (
              <button
                type="button"
                onClick={() => goToSlide(slide - 1)}
                className="absolute left-1 top-1/2 z-10 flex min-h-[44px] min-w-[44px] -translate-y-1/2 items-center justify-center rounded-full bg-black/50 p-2.5 text-white backdrop-blur-sm transition hover:bg-black/70 active:scale-[0.96]"
                aria-label={t("famousGalleryPrev")}
              >
                <ChevronLeft className="h-5 w-5" strokeWidth={2} />
              </button>
            ) : null}
            {slide < slides.length - 1 ? (
              <button
                type="button"
                onClick={() => goToSlide(slide + 1)}
                className="absolute right-1 top-1/2 z-10 flex min-h-[44px] min-w-[44px] -translate-y-1/2 items-center justify-center rounded-full bg-black/50 p-2.5 text-white backdrop-blur-sm transition hover:bg-black/70 active:scale-[0.96]"
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
        <InstagramPostActions
          liked={liked}
          saved={saved}
          shareToast={shareToast}
          commentHint={commentHint}
          t={t}
          onToggleLike={toggleLike}
          onToggleSave={() => setSaved((current) => !current)}
          onShare={handleShare}
          onComment={handleComment}
        />

        <p className="typo-body typo-body-emphasis mt-2 text-[0.8125rem] leading-snug sm:text-[0.875rem]">
          <a
            href={client.instagramUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="typo-ui text-white transition hover:opacity-80"
          >
            {username}
          </a>{" "}
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
  const [lightbox, setLightbox] = useState<{
    media: ClientTattoo["media"];
    index: number;
  } | null>(null);

  useEffect(() => {
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, []);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !lightbox) onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [lightbox, onClose]);

  return (
    <>
      <motion.div
        className="featured-client-modal fixed inset-0 z-[100] flex items-stretch justify-center sm:items-center sm:p-3"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        role="dialog"
        aria-modal="true"
        aria-label={`${username}, ${t("famousViewGallery")}`}
      >
        <button
          type="button"
          className="absolute inset-0 bg-zinc-950/90 backdrop-blur-md"
          aria-label={t("famousModalClose")}
          onClick={onClose}
        />

        <motion.div
          initial={{ opacity: 0, y: 24, scale: 0.985 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 16, scale: 0.99 }}
          transition={{ duration: 0.34, ease: [0.22, 1, 0.36, 1] }}
          className="featured-client-modal__panel relative z-10 flex w-full flex-col overflow-hidden"
          onClick={(event) => event.stopPropagation()}
        >
          <button
            type="button"
            onClick={onClose}
            className="featured-client-modal__close focus-ring inline-flex items-center justify-center rounded-full text-zinc-100 transition hover:bg-white/10 active:scale-[0.96]"
            aria-label={t("famousModalClose")}
          >
            <X className="h-5 w-5" strokeWidth={2} />
          </button>

          <div className="featured-client-modal__toolbar">
            <div className="featured-client-modal__title-wrap min-w-0 text-center">
              <p className="featured-client-modal__title truncate">{username}</p>
              <p className="featured-client-modal__subtitle typo-ui-meta truncate">
                {t("famousPostLocation")}
              </p>
            </div>
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
                  onExpandMedia={(mediaIndex) =>
                    setLightbox({ media: tattoo.media, index: mediaIndex })
                  }
                />
              ))}
              {client.tattoos.length > 1 ? (
                <p className="featured-client-modal__feed-note typo-tech text-center text-[0.68rem] uppercase tracking-[0.18em] text-taupe">
                  {t("famousGalleryScrollHint")}
                </p>
              ) : null}
            </div>
          </div>

          <div className="featured-client-modal__footer">
            <a
              href={client.instagramUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="featured-client-modal__instagram-cta focus-ring inline-flex w-full items-center justify-center gap-2 rounded-full px-4 py-2.5 text-[0.8125rem] font-semibold text-ivory transition active:scale-[0.98]"
            >
              {t("famousOpenInstagram")}
              <ArrowUpRight className="h-4 w-4 shrink-0" strokeWidth={2} />
            </a>
          </div>
        </motion.div>
      </motion.div>

      <ClientMediaLightboxRoot
        media={lightbox?.media ?? null}
        index={lightbox?.index ?? 0}
        title={username}
        onClose={() => setLightbox(null)}
        onChangeIndex={(nextIndex) =>
          setLightbox((current) => (current ? { ...current, index: nextIndex } : null))
        }
      />
    </>
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

      <MediaLightboxPortal>
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
      </MediaLightboxPortal>
    </>
  );
}
