"use client";

type ConnectionManifestoHeadlineProps = {
  line1: string;
  line2: string;
  eyebrow?: string;
};

export function ConnectionManifestoHeadline({
  line1,
  line2,
  eyebrow,
}: ConnectionManifestoHeadlineProps) {
  return (
    <header className="connection-manifesto">
      {eyebrow ? (
        <p className="connection-manifesto__eyebrow connection-intro__eyebrow">{eyebrow}</p>
      ) : null}

      <h2 className="connection-manifesto__title" aria-label={`${line1} ${line2}`}>
        <span className="connection-manifesto__line connection-intro__title-line connection-intro__title-line--a">
          {line1}
        </span>
        <span className="connection-manifesto__divider connection-intro__title-rule" aria-hidden />
        <span className="connection-manifesto__line connection-manifesto__line--soft connection-intro__title-line connection-intro__title-line--b">
          {line2}
        </span>
      </h2>
    </header>
  );
}
