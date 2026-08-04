import type { SiteCopyKey } from "@/shared/i18n/siteLanguage";

/** Slide del carrusel "Momentos que guardo". */
export type AboutProcessSlide =
  | { type: "image"; src: string; altKey: SiteCopyKey; captionKey: SiteCopyKey }
  | { type: "video"; src: string; altKey: SiteCopyKey; captionKey: SiteCopyKey };

/** Orden del carrusel: premios, Perú y momentos con Kris R. */
export const ABOUT_PROCESS_SLIDES: AboutProcessSlide[] = [
  {
    type: "image",
    src: "/brand/about-award.png",
    altKey: "aboutImgAwardAlt",
    captionKey: "aboutProcessCaption1",
  },
  {
    type: "video",
    src: "/brand/neutro-peru.mp4",
    altKey: "aboutProcessPeruVideoAlt",
    captionKey: "aboutProcessCaption3",
  },
  {
    type: "image",
    src: "/brand/about-peru-first.png",
    altKey: "aboutImgPeruAlt",
    captionKey: "aboutProcessCaption4",
  },
  {
    type: "image",
    src: "/brand/client-kris-r-1.png",
    altKey: "aboutImgKrisAlt",
    captionKey: "aboutProcessCaptionKris",
  },
  {
    type: "image",
    src: "/brand/about-kris-moment.png",
    altKey: "aboutImgKrisMomentAlt",
    captionKey: "aboutProcessCaptionKrisMoment",
  },
];
