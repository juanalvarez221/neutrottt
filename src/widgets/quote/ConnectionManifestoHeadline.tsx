"use client";

import { motion, useReducedMotion } from "framer-motion";

const easeOut = [0.22, 1, 0.36, 1] as const;
const springReveal = { type: "spring" as const, stiffness: 130, damping: 22 };

type ConnectionManifestoHeadlineProps = {
  line1: string;
  line2: string;
  eyebrow?: string;
  size?: "intro" | "reward";
};

function splitWords(text: string) {
  return text.split(/\s+/).filter(Boolean);
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
  const allWords = [...words1, ...words2];

  const line1Start = 0.2;
  const ruleDelay = line1Start + words1.length * 0.09 + 0.28;
  const line2Start = ruleDelay + 0.22;

  if (reduceMotion) {
    return (
      <div className={`connection-manifesto connection-manifesto--${size}`}>
        {eyebrow ? <p className="connection-manifesto__eyebrow">{eyebrow}</p> : null}
        <h2 className="connection-manifesto__static">
          <span className="connection-manifesto__static-line">{line1}</span>
          <span className="connection-manifesto__static-line">{line2}</span>
        </h2>
      </div>
    );
  }

  return (
    <div className={`connection-manifesto connection-manifesto--${size}`}>
      {eyebrow ? (
        <motion.p
          className="connection-manifesto__eyebrow"
          initial={{ opacity: 0, y: 8, letterSpacing: "0.36em" }}
          animate={{ opacity: 1, y: 0, letterSpacing: "0.22em" }}
          transition={{ duration: 0.75, delay: 0.04, ease: easeOut }}
        >
          {eyebrow}
        </motion.p>
      ) : null}

      <div className="connection-manifesto__stage">
        <motion.span
          className="connection-manifesto__corner connection-manifesto__corner--tl"
          aria-hidden
          initial={{ opacity: 0, scale: 0.72 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.8, delay: 0.1, ease: easeOut }}
        />
        <motion.span
          className="connection-manifesto__corner connection-manifesto__corner--br"
          aria-hidden
          initial={{ opacity: 0, scale: 0.72 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.8, delay: 0.18, ease: easeOut }}
        />

        <h2 className="connection-manifesto__lines" aria-label={allWords.join(" ")}>
          <div className="connection-manifesto__line-wrap">
            {words1.map((word, index) => (
              <span key={`l1-${word}-${index}`} className="connection-manifesto__word-mask">
                <motion.span
                  className="connection-manifesto__word"
                  initial={{ opacity: 0, y: "108%" }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{
                    ...springReveal,
                    delay: line1Start + index * 0.09,
                  }}
                >
                  {word}
                </motion.span>
              </span>
            ))}
          </div>

          <motion.div
            className="connection-manifesto__rule"
            aria-hidden
            initial={{ scaleX: 0, opacity: 0 }}
            animate={{ scaleX: 1, opacity: 1 }}
            transition={{ duration: 0.7, delay: ruleDelay, ease: easeOut }}
          />

          <div className="connection-manifesto__line-wrap">
            {words2.map((word, index) => (
              <span key={`l2-${word}-${index}`} className="connection-manifesto__word-mask">
                <motion.span
                  className="connection-manifesto__word"
                  initial={{ opacity: 0, y: "108%" }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{
                    ...springReveal,
                    delay: line2Start + index * 0.09,
                  }}
                >
                  {word}
                </motion.span>
              </span>
            ))}
          </div>
        </h2>
      </div>
    </div>
  );
}
