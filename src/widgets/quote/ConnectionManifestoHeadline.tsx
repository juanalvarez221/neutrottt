"use client";

import { motion, useReducedMotion } from "framer-motion";

const easeOut = [0.22, 1, 0.36, 1] as const;
const springReveal = { type: "spring" as const, stiffness: 120, damping: 22 };

type ConnectionManifestoHeadlineProps = {
  line1: string;
  line2: string;
  eyebrow?: string;
  size?: "intro" | "reward";
};

function splitWords(text: string) {
  return text.split(/\s+/).filter(Boolean);
}

function splitChars(text: string) {
  return [...text];
}

export function ConnectionManifestoHeadline({
  line1,
  line2,
  eyebrow,
  size = "intro",
}: ConnectionManifestoHeadlineProps) {
  const reduceMotion = useReducedMotion();
  const words1 = splitWords(line1);
  const words2 = splitWords(line2);
  const heroWord = words2[words2.length - 1] ?? "";
  const prefixWords = words2.slice(0, -1);
  const heroChars = splitChars(heroWord);

  const line1Start = 0.22;
  const ruleDelay = line1Start + words1.length * 0.1 + 0.34;
  const prefixStart = ruleDelay + 0.28;
  const heroStart = prefixStart + prefixWords.length * 0.12 + 0.08;

  if (reduceMotion) {
    return (
      <div className={`connection-manifesto connection-manifesto--${size}`}>
        {eyebrow ? <p className="connection-manifesto__eyebrow">{eyebrow}</p> : null}
        <p className="connection-manifesto__line-static connection-manifesto__line-static--muted">{line1}</p>
        <p className="connection-manifesto__line-static connection-manifesto__line-static--accent">
          {line2}
        </p>
      </div>
    );
  }

  return (
    <div className={`connection-manifesto connection-manifesto--${size}`}>
      {eyebrow ? (
        <motion.p
          className="connection-manifesto__eyebrow"
          initial={{ opacity: 0, y: 10, letterSpacing: "0.42em" }}
          animate={{ opacity: 1, y: 0, letterSpacing: "0.28em" }}
          transition={{ duration: 0.85, delay: 0.04, ease: easeOut }}
        >
          {eyebrow}
        </motion.p>
      ) : null}

      <div className="connection-manifesto__stage">
        <motion.span
          className="connection-manifesto__corner connection-manifesto__corner--tl"
          aria-hidden
          initial={{ opacity: 0, scale: 0.6 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.9, delay: 0.12, ease: easeOut }}
        />
        <motion.span
          className="connection-manifesto__corner connection-manifesto__corner--br"
          aria-hidden
          initial={{ opacity: 0, scale: 0.6 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.9, delay: 0.22, ease: easeOut }}
        />

        <div className="connection-manifesto__lines">
          <div className="connection-manifesto__line-wrap connection-manifesto__line-wrap--muted">
            {words1.map((word, index) => (
              <span key={`l1-${word}-${index}`} className="connection-manifesto__word-mask">
                <motion.span
                  className="connection-manifesto__word connection-manifesto__word--muted"
                  initial={{ opacity: 0, y: "120%", rotateX: 28 }}
                  animate={{ opacity: 1, y: 0, rotateX: 0 }}
                  transition={{
                    ...springReveal,
                    delay: line1Start + index * 0.1,
                  }}
                  style={{ transformPerspective: 600 }}
                >
                  {word}
                </motion.span>
              </span>
            ))}
          </div>

          <motion.div
            className="connection-manifesto__rule"
            initial={{ scaleX: 0, opacity: 0 }}
            animate={{ scaleX: 1, opacity: 1 }}
            transition={{ duration: 0.82, delay: ruleDelay, ease: easeOut }}
          >
            <motion.span
              className="connection-manifesto__rule-sweep"
              aria-hidden
              initial={{ x: "-120%", opacity: 0 }}
              animate={{ x: "220%", opacity: [0, 1, 0] }}
              transition={{
                duration: 1.15,
                delay: ruleDelay + 0.18,
                ease: [0.16, 1, 0.3, 1],
              }}
            />
          </motion.div>

          <div className="connection-manifesto__line-wrap connection-manifesto__line-wrap--accent">
            {prefixWords.map((word, index) => (
              <span key={`l2-${word}-${index}`} className="connection-manifesto__word-mask">
                <motion.span
                  className="connection-manifesto__word connection-manifesto__word--accent"
                  initial={{ opacity: 0, y: "115%", filter: "blur(6px)" }}
                  animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
                  transition={{
                    duration: 0.78,
                    delay: prefixStart + index * 0.12,
                    ease: easeOut,
                  }}
                >
                  {word}
                </motion.span>
              </span>
            ))}

            {heroWord ? (
              <span className="connection-manifesto__hero-wrap">
                <span className="connection-manifesto__word-mask connection-manifesto__word-mask--hero">
                  {heroChars.map((char, index) => (
                    <motion.span
                      key={`hero-${char}-${index}`}
                      className="connection-manifesto__char connection-manifesto__char--hero"
                      initial={{ opacity: 0, y: "130%", scale: 0.82, rotateZ: index % 2 === 0 ? -8 : 8 }}
                      animate={{ opacity: 1, y: 0, scale: 1, rotateZ: 0 }}
                      transition={{
                        ...springReveal,
                        stiffness: 140,
                        damping: 18,
                        delay: heroStart + index * 0.055,
                      }}
                    >
                      {char}
                    </motion.span>
                  ))}
                </span>
                <motion.span
                  className="connection-manifesto__hero-glow"
                  aria-hidden
                  initial={{ opacity: 0, scale: 0.85 }}
                  animate={{ opacity: [0, 0.55, 0.35], scale: [0.85, 1.08, 1] }}
                  transition={{
                    duration: 1.4,
                    delay: heroStart + heroChars.length * 0.055 + 0.1,
                    ease: easeOut,
                  }}
                />
                <motion.span
                  className="connection-manifesto__hero-shimmer"
                  aria-hidden
                  initial={{ x: "-140%", opacity: 0 }}
                  animate={{ x: "240%", opacity: [0, 0.9, 0] }}
                  transition={{
                    duration: 1.05,
                    delay: heroStart + heroChars.length * 0.055 + 0.35,
                    ease: [0.16, 1, 0.3, 1],
                  }}
                />
              </span>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}
