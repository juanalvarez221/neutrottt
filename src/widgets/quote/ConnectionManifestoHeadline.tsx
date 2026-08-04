"use client";

import { ConnectionRule } from "@/widgets/quote/ConnectionMarks";

type ConnectionManifestoHeadlineProps = {
  line1: string;
  line2: string;
  eyebrow?: string;
  align?: "center" | "start";
  tone?: "warm" | "cool";
};

export function ConnectionManifestoHeadline({
  line1,
  line2,
  eyebrow,
  align = "center",
  tone = "warm",
}: ConnectionManifestoHeadlineProps) {
  return (
    <header
      className={[
        "connection-manifesto",
        align === "start" ? "connection-manifesto--start" : "",
      ]
        .filter(Boolean)
        .join(" ")}
    >
      {eyebrow ? (
        <p
          className="connection-manifesto__eyebrow connection-intro__eyebrow"
          data-flip-id="connection-eyebrow"
        >
          {eyebrow}
        </p>
      ) : null}

      <h2 className="connection-manifesto__title" aria-label={`${line1} ${line2}`}>
        <span className="connection-manifesto__line connection-manifesto__line--display connection-intro__title-line connection-intro__title-line--a">
          {line1}
        </span>
        <span className="connection-manifesto__divider" aria-hidden>
          <ConnectionRule variant="intro-title" tone={tone} />
        </span>
        <span className="connection-manifesto__line connection-manifesto__line--brand connection-intro__title-line connection-intro__title-line--b">
          {line2}
        </span>
      </h2>
    </header>
  );
}
