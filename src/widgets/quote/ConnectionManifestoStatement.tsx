"use client";

type ConnectionManifestoStatementProps = {
  text: string;
};

export function ConnectionManifestoStatement({ text }: ConnectionManifestoStatementProps) {
  const lines = text
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

  if (lines.length === 0) return null;

  return (
    <div className="connection-manifest" aria-live="polite">
      <div className="connection-manifest__bridge connection-intro__bridge" aria-hidden />

      <div className="connection-manifest__copy connection-intro__manifest-copy">
        {lines.map((line, index) => (
          <p
            key={`${index}-${line.slice(0, 16)}`}
            className={[
              "connection-manifest__line",
              "connection-intro__manifest-line",
              index === 0 ? "connection-manifest__line--lead" : "",
              index === lines.length - 1 ? "connection-manifest__line--last" : "",
            ]
              .filter(Boolean)
              .join(" ")}
          >
            {line}
          </p>
        ))}
      </div>
    </div>
  );
}
