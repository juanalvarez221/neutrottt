"use client";

import { useEffect, useRef, useState, type VideoHTMLAttributes } from "react";

type LazyVideoProps = Omit<VideoHTMLAttributes<HTMLVideoElement>, "src"> & {
  src: string;
  rootMargin?: string;
  playWhenVisible?: boolean;
};

export function LazyVideo({
  src,
  rootMargin = "160px 0px",
  playWhenVisible = true,
  poster,
  muted = true,
  loop = true,
  playsInline = true,
  preload,
  className,
  ...rest
}: LazyVideoProps) {
  const ref = useRef<HTMLVideoElement>(null);
  const [inView, setInView] = useState(() => typeof IntersectionObserver === "undefined");

  useEffect(() => {
    const node = ref.current;
    if (!node) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        const visible = entry.isIntersecting && entry.intersectionRatio >= 0.12;
        setInView(visible);
      },
      { rootMargin, threshold: [0, 0.12, 0.35] },
    );

    observer.observe(node);
    return () => observer.disconnect();
  }, [rootMargin]);

  useEffect(() => {
    const node = ref.current;
    if (!node || !inView) return;

    if (playWhenVisible) {
      node.play().catch(() => {});
      return;
    }

    node.pause();
  }, [inView, playWhenVisible]);

  useEffect(() => {
    const node = ref.current;
    if (!node || inView) return;
    node.pause();
    node.currentTime = 0;
  }, [inView]);

  return (
    <video
      ref={ref}
      src={inView ? src : undefined}
      poster={poster}
      muted={muted}
      loop={loop}
      playsInline={playsInline}
      preload={preload ?? (inView ? "metadata" : "none")}
      className={className}
      {...rest}
    />
  );
}
