"use client";

import { motion, useReducedMotion } from "framer-motion";

const easeOut = [0.22, 1, 0.36, 1] as const;

/** Inicio tras el último carácter del headline hero. */
const MANIFEST_START_DELAY = 2.15;
const LINE_STAGGER = 0.52;

const EMPHASIS_WORDS = new Set([
  "ecos",
  "tinta",
  "resuena",
  "idioma",
  "arte",
  "echoes",
  "ink",
  "resonates",
  "language",
  "art",
]);

function isEmphasisWord(raw: string) {
  return EMPHASIS_WORDS.has(raw.replace(/[,:.;!?¿¡]/g, "").toLowerCase());
}

type ConnectionManifestoStatementProps = {
  text: string;
};

export function ConnectionManifestoStatement({ text }: ConnectionManifestoStatementProps) {
  const reduceMotion = useReducedMotion();
  const lines = text
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

  if (lines.length === 0) return null;

  if (reduceMotion) {
    return (
      <div className="connection-manifest">
        {lines.map((line) => (
          <p key={line} className="connection-manifest__line">
            {line}
          </p>
        ))}
      </div>
    );
  }

  return (
    <div className="connection-manifest" aria-live="polite">
      <motion.div
        className="connection-manifest__bridge"
        initial={{ scaleX: 0, opacity: 0 }}
        animate={{ scaleX: 1, opacity: 1 }}
        transition={{ duration: 0.65, delay: MANIFEST_START_DELAY - 0.35, ease: easeOut }}
      />

      {lines.map((line, index) => {
        const delay = MANIFEST_START_DELAY + index * LINE_STAGGER;
        const isLead = index === 0;
        const isAccent = index === lines.length - 1;

        return (
          <motion.p
            key={`${index}-${line.slice(0, 12)}`}
            className={[
              "connection-manifest__line",
              isLead ? "connection-manifest__line--lead" : "",
              isAccent ? "connection-manifest__line--accent" : "",
            ]
              .filter(Boolean)
              .join(" ")}
            initial={{ opacity: 0, y: 20, filter: "blur(8px)" }}
            animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
            transition={{ duration: 0.78, delay, ease: easeOut }}
          >
            {line.split(/(\s+)/).map((chunk, chunkIndex) => {
              if (!chunk.trim()) return chunk;
              const emphasis = isEmphasisWord(chunk);
              const wordDelay = delay + 0.08 + chunkIndex * 0.045;
              return (
                <motion.span
                  key={`${index}-${chunkIndex}`}
                  className={[
                    "connection-manifest__word",
                    emphasis ? "connection-manifest__word--emphasis" : "",
                  ]
                    .filter(Boolean)
                    .join(" ")}
                  initial={{ opacity: 0, y: emphasis ? 14 : 10, scale: emphasis ? 0.96 : 1 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  transition={{
                    duration: emphasis ? 0.68 : 0.55,
                    delay: wordDelay,
                    ease: emphasis ? [0.16, 1, 0.3, 1] : easeOut,
                  }}
                >
                  {chunk}
                </motion.span>
              );
            })}
          </motion.p>
        );
      })}
    </div>
  );
}

export const CONNECTION_MANIFEST_ANIMATION_MS = 9600;
