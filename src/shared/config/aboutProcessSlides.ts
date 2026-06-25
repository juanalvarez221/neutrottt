import type { SiteCopyKey } from "@/shared/i18n/siteLanguage";

export type AboutProcessSlide =
  | { type: "image"; src: string; altKey: SiteCopyKey; captionKey: SiteCopyKey }
  | { type: "video"; src: string; altKey: SiteCopyKey; captionKey: SiteCopyKey };

/** video → foto → video → foto */
export const ABOUT_PROCESS_SLIDES: AboutProcessSlide[] = [
  {
    type: "video",
    src: "/brand/neutro-avion.mp4",
    altKey: "aboutProcessVideoAlt",
    captionKey: "aboutProcessVideoCaption",
  },
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
    src: "/brand/about-studio.png",
    altKey: "aboutImgStudioAlt",
    captionKey: "aboutProcessCaption2",
  },
];
