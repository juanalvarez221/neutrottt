import type { SiteCopyKey } from "@/shared/i18n/siteLanguage";

export type AboutProcessSlide =
  | { type: "image"; src: string; altKey: SiteCopyKey; captionKey: SiteCopyKey }
  | { type: "video"; src: string; altKey: SiteCopyKey; captionKey: SiteCopyKey };

/** Real Danniel assets only — banners, awards, lettering tattoos, profile. */
export const ABOUT_PROCESS_SLIDES: AboutProcessSlide[] = [
  {
    type: "video",
    src: "/danniel/brand/banner-1.mp4",
    altKey: "aboutProcessVideoAlt",
    captionKey: "aboutProcessVideoCaption",
  },
  {
    type: "image",
    src: "/danniel/premios/premio-01.jpg",
    altKey: "aboutImgAwardAlt",
    captionKey: "aboutProcessCaption1",
  },
  {
    type: "image",
    src: "/danniel/tattoo/cabeza/0.jpg",
    altKey: "aboutImgLetteringAlt",
    captionKey: "aboutProcessCaption3",
  },
  {
    type: "image",
    src: "/danniel/premios/premio-12.jpg",
    altKey: "aboutImgPeruAlt",
    captionKey: "aboutProcessCaption4",
  },
  {
    type: "image",
    src: "/danniel/brand/perfil.jpg",
    altKey: "aboutImgStudioAlt",
    captionKey: "aboutProcessCaption2",
  },
];
