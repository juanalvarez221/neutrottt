"use client";

import { useCallback, useRef, useState, type FormEvent, type ReactNode } from "react";
import Image from "next/image";
import { AnimatePresence, motion } from "framer-motion";
import {
  BadgeCheck,
  Bookmark,
  ChevronLeft,
  ChevronRight,
  Heart,
  HeartHandshake,
  MapPin,
  MessageCircle,
  MoreHorizontal,
  Play,
  Send,
  Sparkles,
} from "lucide-react";
import { useSiteLanguage } from "@/shared/i18n/LanguageProvider";
import type { SiteCopyKey, SiteLanguage } from "@/shared/i18n/siteLanguage";
import { useHorizontalDragScroll } from "@/shared/hooks/useHorizontalDragScroll";
import { scrollRevealViewport } from "@/shared/motion/scrollReveal";

const PILL_KEYS = ["famousPill1", "famousPill2", "famousPill3"] as const;

type LocalizedText = { es: string; en: string };

type PostComment = {
  user: string;
  text: LocalizedText;
};

type ClientMedia =
  | { type: "image"; src: string; altKey: SiteCopyKey }
  | { type: "video"; src: string; altKey: SiteCopyKey; poster?: string };

type FeaturedClient = {
  handle: string;
  avatar: string;
  avatarAltKey: SiteCopyKey;
  avatarPosition?: string;
  captionKey: SiteCopyKey;
  baseLikes: number;
  commentCount: number;
  comments: PostComment[];
  altKey?: SiteCopyKey;
  objectPosition?: string;
  image?: string;
  media?: ClientMedia[];
};

const FEATURED_CLIENTS: FeaturedClient[] = [
  {
    handle: "@krisrofficial",
    avatar: "/brand/client-kris-r.png",
    avatarAltKey: "famousClientKrisAvatarAlt",
    avatarPosition: "center 20%",
    captionKey: "famousPostCaptionKris",
    baseLikes: 18200,
    commentCount: 84,
    comments: [
      { user: "maria.ink", text: { es: "Brutal el contraste 🔥", en: "That contrast is insane 🔥" } },
      { user: "diego.tatts", text: { es: "¿Cuántas sesiones fueron?", en: "How many sessions was this?" } },
      { user: "luna.art", text: { es: "Neutrottt siempre entrega 🖤", en: "Neutrottt always delivers 🖤" } },
    ],
    media: [
      { type: "image", src: "/brand/client-kris-r-1.png", altKey: "famousClientKrisAlt" },
      { type: "video", src: "/brand/client-kris-r-video.mp4", altKey: "famousClientKrisVideoAlt", poster: "/brand/client-kris-r-1.png" },
      { type: "image", src: "/brand/client-kris-r-3.jpg", altKey: "famousClientKrisArtAlt" },
    ],
  },
  {
    handle: "@roapr__",
    avatar: "/brand/client-roapr.png",
    avatarAltKey: "famousClientRoaprAvatarAlt",
    avatarPosition: "center 35%",
    captionKey: "famousPostCaptionRoa",
    baseLikes: 24700,
    commentCount: 84,
    comments: [
      { user: "camila.roa", text: { es: "Las dos quedaron perfectas 😍", en: "Both pieces came out perfect 😍" } },
      { user: "ink.med", text: { es: "El lettering en rojo 🔥", en: "That red lettering 🔥" } },
      { user: "neutrottt", text: { es: "Gracias por la confianza 🙏", en: "Thanks for trusting the process 🙏" } },
    ],
    media: [
      { type: "image", src: "/brand/client-roa-1.png", altKey: "famousClientRoaprAlt" },
      { type: "image", src: "/brand/client-roa-2.png", altKey: "famousClientRoaprT1Alt" },
      { type: "image", src: "/brand/client-roa-3.png", altKey: "famousClientRoaprT1bAlt" },
      { type: "video", src: "/brand/client-roa-video-1.mp4", altKey: "famousClientRoaprVideo1Alt", poster: "/brand/client-roa-3.png" },
      { type: "image", src: "/brand/client-roa-4.png", altKey: "famousClientRoaprT2Alt" },
      { type: "video", src: "/brand/client-roa-video-2.mp4", altKey: "famousClientRoaprVideo2Alt", poster: "/brand/client-roa-4.png" },
      { type: "image", src: "/brand/client-roa-5.png", altKey: "famousClientRoaprStudioAlt" },
    ],
  },
  {
    handle: "@eljoc07",
    avatar: "/brand/client-eljoc07.png",
    avatarAltKey: "famousClientEljoc07AvatarAlt",
    avatarPosition: "center 30%",
    captionKey: "famousPostCaptionEljoc",
    baseLikes: 9800,
    commentCount: 84,
    comments: [
      { user: "juan.tattoo", text: { es: "Realismo impecable 👏", en: "Flawless realism 👏" } },
      { user: "sofia.ink", text: { es: "Se ve increíble en hombro", en: "Looks incredible on the shoulder" } },
    ],
    media: [
      { type: "image", src: "/brand/client-eljoc-1.png", altKey: "famousClientEljoc07Alt" },
      { type: "image", src: "/brand/client-eljoc-2.png", altKey: "famousClientEljoc07DetailAlt" },
      { type: "image", src: "/brand/client-eljoc-3.jpg", altKey: "famousClientEljoc07StudioAlt" },
    ],
  },
];

function formatIgLikes(count: number, language: SiteLanguage): string {
  if (count >= 1_000_000) {
    const value = count / 1_000_000;
    const formatted = value.toFixed(1).replace(".", language === "es" ? "," : ".");
    return language === "es" ? `${formatted} M me gusta` : `${formatted}M likes`;
  }
  if (count >= 10_000) {
    const value = count / 1_000;
    const formatted = value.toFixed(1).replace(".", language === "es" ? "," : ".");
    return language === "es" ? `${formatted} mil me gusta` : `${formatted}K likes`;
  }
  if (count >= 1_000) {
    const value = Math.round(count / 100) / 10;
    const formatted = String(value).replace(".", language === "es" ? "," : ".");
    return language === "es" ? `${formatted} mil me gusta` : `${formatted}K likes`;
  }
  return language === "es" ? `${count} me gusta` : `${count} likes`;
}

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
        priority={false}
      />
    </div>
  );
}

type LiveComment = PostComment & { id: string; isYou?: boolean };

function InstagramPostCard({
  client,
  verifiedAlt,
  t,
  language,
}: {
  client: FeaturedClient;
  verifiedAlt: string;
  t: (key: SiteCopyKey, vars?: Record<string, string>) => string;
  language: SiteLanguage;
}) {
  const [slide, setSlide] = useState(0);
  const [liked, setLiked] = useState(false);
  const [saved, setSaved] = useState(false);
  const [likeCount, setLikeCount] = useState(client.baseLikes);
  const [commentsOpen, setCommentsOpen] = useState(false);
  const [commentDraft, setCommentDraft] = useState("");
  const [shareToast, setShareToast] = useState(false);
  const [heartBurst, setHeartBurst] = useState(false);
  const [liveComments, setLiveComments] = useState<LiveComment[]>(() =>
    client.comments.map((c, i) => ({ ...c, id: `seed-${i}` })),
  );

  const scrollerRef = useRef<HTMLDivElement>(null);
  const { wasDragged } = useHorizontalDragScroll(scrollerRef);
  const lastTapRef = useRef(0);
  const touchMovedRef = useRef(false);
  const touchStartXRef = useRef(0);
  const shareTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const username = client.handle.replace("@", "");
  const totalComments = client.commentCount + liveComments.length - client.comments.length;

  const slides: { key: string; content: ReactNode; isVideo?: boolean }[] = client.media
    ? client.media.map((item) => ({
        key: item.src,
        isVideo: item.type === "video",
        content: <ClientMediaFrame item={item} alt={t(item.altKey)} />,
      }))
    : [
        {
          key: client.image!,
          content: (
            <div className="relative h-full w-full">
              <Image
                src={client.image!}
                alt={t(client.altKey!)}
                fill
                quality={92}
                sizes="(max-width: 640px) 100vw, 680px"
                className="object-contain"
              />
            </div>
          ),
        },
      ];

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
    setHeartBurst(true);
    window.setTimeout(() => setHeartBurst(false), 900);
  }, []);

  const applyLike = useCallback(
    (next: boolean) => {
      setLiked((prev) => {
        if (prev === next) return prev;
        setLikeCount((c) => (next ? c + 1 : c - 1));
        return next;
      });
      if (next) triggerHeartBurst();
    },
    [triggerHeartBurst],
  );

  const handleMediaPointerUp = () => {
    if (wasDragged() || touchMovedRef.current) return;
    const now = Date.now();
    if (now - lastTapRef.current < 320) {
      applyLike(true);
    }
    lastTapRef.current = now;
  };

  const handleShare = async () => {
    const shareUrl = `https://www.instagram.com/p/${username}`;
    const shareData = {
      title: `${username} · Neutrottt`,
      text: t(client.captionKey),
      url: shareUrl,
    };

    try {
      if (typeof navigator.share === "function") {
        await navigator.share(shareData);
        return;
      }
    } catch {
      /* user cancelled or unsupported */
    }

    try {
      await navigator.clipboard.writeText(shareUrl);
    } catch {
      /* clipboard blocked */
    }

    setShareToast(true);
    if (shareTimerRef.current) clearTimeout(shareTimerRef.current);
    shareTimerRef.current = setTimeout(() => setShareToast(false), 2200);
  };

  const handleCommentSubmit = (event: FormEvent) => {
    event.preventDefault();
    const text = commentDraft.trim();
    if (!text) return;

    setLiveComments((prev) => [
      ...prev,
      {
        id: `live-${Date.now()}`,
        user: t("famousYou"),
        isYou: true,
        text: { es: text, en: text },
      },
    ]);
    setCommentDraft("");
    setCommentsOpen(true);
  };

  const localized = (text: LocalizedText) => text[language];

  return (
    <motion.article
      initial={{ opacity: 0, y: 24 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={scrollRevealViewport}
      transition={{ duration: 0.5, ease: "easeOut" }}
      className="ig-post-card relative w-full overflow-hidden rounded-xl sm:rounded-2xl"
    >
      <header className="flex items-center gap-3 border-b border-white/[0.06] px-3 py-2.5 sm:px-4 sm:py-3">
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
        <button
          type="button"
          className="shrink-0 rounded-full p-1.5 text-zinc-400 transition-colors hover:bg-white/5 hover:text-white"
          aria-label="Más opciones"
        >
          <MoreHorizontal className="h-5 w-5" strokeWidth={1.75} />
        </button>
      </header>

      <div className="relative bg-black">
        <div
          ref={scrollerRef}
          onScroll={syncSlide}
          onPointerUp={multi ? handleMediaPointerUp : undefined}
          onTouchStart={
            multi
              ? (event) => {
                  touchMovedRef.current = false;
                  touchStartXRef.current = event.touches[0]?.clientX ?? 0;
                }
              : undefined
          }
          onTouchMove={
            multi
              ? (event) => {
                  const touch = event.touches[0];
                  if (!touch) return;
                  if (Math.abs(touch.clientX - touchStartXRef.current) > 8) {
                    touchMovedRef.current = true;
                  }
                }
              : undefined
          }
          onTouchEnd={multi ? handleMediaPointerUp : undefined}
          className={
            multi
              ? "ig-post-media-scroll relative flex w-full snap-x snap-mandatory overflow-x-auto overscroll-x-contain [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
              : "relative w-full"
          }
        >
          {slides.map((s) => (
            <div
              key={s.key}
              className={
                multi
                  ? "relative min-w-full shrink-0 snap-center"
                  : "relative w-full"
              }
            >
              <div
                className="ig-post-media-frame w-full"
                onPointerUp={!multi ? handleMediaPointerUp : undefined}
                onDoubleClick={() => applyLike(true)}
              >
                {s.content}
              </div>
              {s.isVideo ? (
                <span className="pointer-events-none absolute right-3 top-3 flex h-7 w-7 items-center justify-center rounded-full bg-black/55 text-white backdrop-blur-sm">
                  <Play className="h-3.5 w-3.5 fill-current" strokeWidth={0} />
                </span>
              ) : null}
            </div>
          ))}
        </div>

        <AnimatePresence>
          {heartBurst ? (
            <motion.div
              className="pointer-events-none absolute inset-0 flex items-center justify-center"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
            >
              <motion.div
                className="ig-heart-burst"
                initial={{ scale: 0.2, opacity: 0 }}
                animate={{ scale: [0.2, 1.35, 1.1], opacity: [0, 1, 0] }}
                transition={{ duration: 0.85, ease: [0.22, 1, 0.36, 1] }}
              >
                <Heart className="h-20 w-20 fill-white text-white sm:h-24 sm:w-24" strokeWidth={0} />
              </motion.div>
            </motion.div>
          ) : null}
        </AnimatePresence>

        {multi ? (
          <>
            <div className="typo-ui-meta pointer-events-none absolute right-3 top-3 rounded-md bg-black/65 px-2 py-0.5 font-semibold tabular-nums text-white backdrop-blur-sm">
              {slide + 1}/{slides.length}
            </div>
            {slide > 0 ? (
              <button
                type="button"
                onClick={() => goToSlide(slide - 1)}
                className="absolute left-2 top-1/2 z-10 flex -translate-y-1/2 rounded-full bg-black/50 p-1.5 text-white backdrop-blur-sm transition hover:bg-black/70"
                aria-label="Anterior"
              >
                <ChevronLeft className="h-5 w-5" strokeWidth={2} />
              </button>
            ) : null}
            {slide < slides.length - 1 ? (
              <button
                type="button"
                onClick={() => goToSlide(slide + 1)}
                className="absolute right-2 top-1/2 z-10 flex -translate-y-1/2 rounded-full bg-black/50 p-1.5 text-white backdrop-blur-sm transition hover:bg-black/70"
                aria-label="Siguiente"
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
                  aria-label={`Foto ${i + 1}`}
                  className={`h-1.5 rounded-full transition-all ${
                    i === slide ? "ig-post-dot-active w-4" : "w-1.5 bg-white/45 hover:bg-white/70"
                  }`}
                />
              ))}
            </div>
          </>
        ) : null}

        <AnimatePresence>
          {shareToast ? (
            <motion.p
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              className="ig-share-toast typo-ui pointer-events-none absolute bottom-4 left-1/2 z-20 -translate-x-1/2 rounded-full bg-white/95 px-4 py-2 text-[0.72rem] font-semibold uppercase tracking-[0.08em] text-zinc-900 shadow-lg"
            >
              {t("famousShareCopied")}
            </motion.p>
          ) : null}
        </AnimatePresence>
      </div>

      <div className="flex items-center justify-between px-3 py-2.5 sm:px-4">
        <div className="flex items-center gap-3.5">
          <motion.button
            type="button"
            onClick={() => applyLike(!liked)}
            className="ig-action-btn"
            aria-pressed={liked}
            aria-label={t("famousLikeAria")}
            whileTap={{ scale: 0.85 }}
          >
            <motion.span
              key={liked ? "on" : "off"}
              initial={{ scale: liked ? 0.6 : 1 }}
              animate={{ scale: 1 }}
              transition={{ type: "spring", stiffness: 520, damping: 18 }}
            >
              <Heart
                className={`h-[1.35rem] w-[1.35rem] sm:h-6 sm:w-6 ${
                  liked ? "fill-red-500 text-red-500" : "text-white"
                }`}
                strokeWidth={liked ? 0 : 1.75}
              />
            </motion.span>
          </motion.button>
          <motion.button
            type="button"
            onClick={() => setCommentsOpen((v) => !v)}
            className="ig-action-btn"
            aria-pressed={commentsOpen}
            aria-label={t("famousCommentAria")}
            whileTap={{ scale: 0.85 }}
          >
            <MessageCircle className="h-[1.35rem] w-[1.35rem] text-white sm:h-6 sm:w-6" strokeWidth={1.75} />
          </motion.button>
          <motion.button
            type="button"
            onClick={handleShare}
            className="ig-action-btn"
            aria-label={t("famousShareAria")}
            whileTap={{ scale: 0.85 }}
          >
            <Send className="h-[1.3rem] w-[1.3rem] -rotate-12 text-white sm:h-[1.35rem] sm:w-[1.35rem]" strokeWidth={1.75} />
          </motion.button>
        </div>
        <motion.button
          type="button"
          onClick={() => setSaved((v) => !v)}
          className="ig-action-btn"
          aria-pressed={saved}
          aria-label={t("famousSaveAria")}
          whileTap={{ scale: 0.85 }}
        >
          <Bookmark
            className={`h-[1.35rem] w-[1.35rem] sm:h-6 sm:w-6 ${
              saved ? "fill-amber-400 text-amber-400" : "text-white"
            }`}
            strokeWidth={saved ? 0 : 1.75}
          />
        </motion.button>
      </div>

      <div className="space-y-1.5 px-3 pb-3 sm:px-4 sm:pb-4">
        <motion.p
          key={likeCount}
          className="typo-ui text-white"
          initial={{ scale: 1.04 }}
          animate={{ scale: 1 }}
          transition={{ type: "spring", stiffness: 400, damping: 22 }}
        >
          {formatIgLikes(likeCount, language)}
        </motion.p>
        <p className="typo-body typo-body-emphasis text-[0.8125rem] leading-snug sm:text-[0.875rem]">
          <span className="typo-ui text-white">{username}</span>{" "}
          <span className="text-zinc-200">{t(client.captionKey)}</span>
        </p>
        <button
          type="button"
          onClick={() => setCommentsOpen(true)}
          className="typo-ui-meta transition-colors hover:text-zinc-400"
        >
          {t("famousViewAllComments", { count: String(totalComments) })}
        </button>

        <AnimatePresence initial={false}>
          {commentsOpen ? (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.28, ease: "easeOut" }}
              className="overflow-hidden"
            >
              <ul className="mt-2 space-y-2 border-t border-white/[0.06] pt-3">
                {liveComments.map((comment, index) => (
                  <motion.li
                    key={comment.id}
                    initial={index >= client.comments.length ? { opacity: 0, y: 8 } : false}
                    animate={{ opacity: 1, y: 0 }}
                    className="text-left text-[0.8125rem] leading-snug"
                  >
                    <span className={`typo-ui ${comment.isYou ? "text-amber-200" : "text-white"}`}>
                      {comment.user}
                    </span>{" "}
                    <span className="text-zinc-300">{localized(comment.text)}</span>
                  </motion.li>
                ))}
              </ul>

              <form onSubmit={handleCommentSubmit} className="mt-3 flex items-center gap-2 border-t border-white/[0.06] pt-3">
                <input
                  type="text"
                  value={commentDraft}
                  onChange={(e) => setCommentDraft(e.target.value)}
                  placeholder={t("famousCommentPlaceholder")}
                  className="min-w-0 flex-1 bg-transparent text-[0.8125rem] text-zinc-100 placeholder:text-zinc-500 focus:outline-none"
                  maxLength={220}
                />
                <button
                  type="submit"
                  disabled={!commentDraft.trim()}
                  className="typo-ui shrink-0 text-sm font-semibold text-sky-400 transition enabled:hover:text-sky-300 disabled:opacity-35"
                >
                  {t("famousCommentPost")}
                </button>
              </form>
            </motion.div>
          ) : null}
        </AnimatePresence>

        <p className="typo-micro pt-0.5 tracking-wide text-zinc-500">{t("famousPostTimeAgo")}</p>
      </div>
    </motion.article>
  );
}

export function FamousClientsSection() {
  const { t, language } = useSiteLanguage();

  return (
    <motion.section
      initial={{ opacity: 0, y: 20 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={scrollRevealViewport}
      transition={{ duration: 0.55, ease: "easeOut" }}
      className="page-section relative w-full overflow-hidden border-t border-white/[0.06] bg-[linear-gradient(180deg,rgba(20,14,8,0.98),rgba(8,6,4,1))] py-10 sm:py-14 md:py-16"
      aria-labelledby="famous-clients-heading"
    >
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(420px_200px_at_0%_0%,rgba(245,158,11,0.18),transparent_60%),radial-gradient(380px_180px_at_100%_100%,rgba(59,130,246,0.08),transparent_55%)]" />

      <div className="page-section-pad relative z-10">
        <div className="text-center sm:text-left">
          <p className="typo-eyebrow">{t("famousTag")}</p>
          <h2 id="famous-clients-heading" className="typo-section-sm mt-3">
            {t("famousTitle")}
          </h2>
          <p className="typo-body typo-body-emphasis mt-3">{t("famousBody")}</p>
        </div>

        <div className="mt-8 flex w-full flex-col gap-10 sm:mt-10 sm:gap-12 md:gap-14">
          {FEATURED_CLIENTS.map((client) => (
            <InstagramPostCard
              key={client.handle}
              client={client}
              verifiedAlt={t("famousVerifiedAlt")}
              t={t}
              language={language}
            />
          ))}
        </div>

        <ul className="mt-8 grid grid-cols-1 gap-2.5 sm:mt-10 sm:grid-cols-3 sm:gap-3">
          {PILL_KEYS.map((key, i) => {
            const Icon = i === 0 ? BadgeCheck : i === 1 ? HeartHandshake : Sparkles;
            return (
              <li
                key={key}
                className="flex items-center gap-3 rounded-2xl border border-white/8 bg-white/[0.04] px-4 py-3.5 sm:flex-col sm:items-start sm:gap-2 sm:py-4"
              >
                <Icon className="h-4 w-4 shrink-0 text-amber-300/90" strokeWidth={2} />
                <span className="typo-micro leading-snug tracking-[0.12em] text-zinc-200">{t(key)}</span>
              </li>
            );
          })}
        </ul>
      </div>
    </motion.section>
  );
}
