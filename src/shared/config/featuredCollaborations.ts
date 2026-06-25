import { BRAND } from "@/shared/config/brand";
import type { SiteCopyKey } from "@/shared/i18n/siteLanguage";

export type FeaturedArtist = {
  handle: string;
  instagramUrl: string;
  avatar: string;
  nameKey: SiteCopyKey;
  altKey: SiteCopyKey;
  avatarPosition?: string;
};

export type FeaturedCollaboration = {
  id: string;
  indexLabel: string;
  video: string;
  poster: string;
  resultImage: string;
  resultAltKey: SiteCopyKey;
  tagKey: SiteCopyKey;
  titleKey: SiteCopyKey;
  hookKey: SiteCopyKey;
  videoAltKey: SiteCopyKey;
  artists: FeaturedArtist[];
};

const DANNIEL_ARTIST: FeaturedArtist = {
  handle: "@dannielcuervo",
  instagramUrl: "https://www.instagram.com/dannielcuervo/",
  avatar: "/brand/collab-danniel-cuervo.png",
  nameKey: "collabDannielName",
  altKey: "collabDannielAlt",
  avatarPosition: "center 18%",
};

const MALIANTEO_ARTIST: FeaturedArtist = {
  handle: "@malianteo_ink",
  instagramUrl: "https://www.instagram.com/malianteo_ink/",
  avatar: "/brand/collab-malianteo-portrait.png",
  nameKey: "collabMalianteoName",
  altKey: "collabMalianteoAlt",
  avatarPosition: "center 28%",
};

const NEUTROTT_ARTIST: FeaturedArtist = {
  handle: "@neutrottt",
  instagramUrl: BRAND.instagramUrl,
  avatar: "/brand/hero-portrait-full.png",
  nameKey: "collabNeutrotttName",
  altKey: "collabNeutrotttAlt",
  avatarPosition: "center 16%",
};

export const FEATURED_COLLABORATIONS: FeaturedCollaboration[] = [
  {
    id: "triple-back",
    indexLabel: "01",
    video: "/brand/collab-danniel-malianteo-neutro.mp4",
    poster: "/brand/collab-back-piece.jpg",
    resultImage: "/brand/collab-back-piece.jpg",
    resultAltKey: "collabFeaturedResultAlt",
    tagKey: "collabFeaturedTag",
    titleKey: "collabFeaturedTitle",
    hookKey: "collabFeaturedHook",
    videoAltKey: "collabFeaturedVideoAlt",
    artists: [DANNIEL_ARTIST, MALIANTEO_ARTIST, NEUTROTT_ARTIST],
  },
  {
    id: "malianteo-back",
    indexLabel: "02",
    video: "/brand/collab-malianteo-back-video.mp4",
    poster: "/brand/collab-malianteo-back-piece.jpg",
    resultImage: "/brand/collab-malianteo-neutro-result.png",
    resultAltKey: "collabMalianteoFeaturedResultAlt",
    tagKey: "collabMalianteoFeaturedTag",
    titleKey: "collabMalianteoFeaturedTitle",
    hookKey: "collabMalianteoFeaturedHook",
    videoAltKey: "collabMalianteoFeaturedVideoAlt",
    artists: [MALIANTEO_ARTIST, NEUTROTT_ARTIST],
  },
];
