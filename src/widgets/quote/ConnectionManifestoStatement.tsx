"use client";

type ConnectionManifestoStatementProps = {
  text: string;
  align?: "center" | "start";
};

export function ConnectionManifestoStatement({
  text,
  align = "center",
}: ConnectionManifestoStatementProps) {
  const lines = text
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

  if (lines.length === 0) return null;

  return (
    <div
      className={[
        "connection-manifest",
        align === "start" ? "connection-manifest--start" : "",
      ]
        .filter(Boolean)
        .join(" ")}
      aria-live="polite"
    >
      <div className="connection-manifest__copy connection-intro__manifest-copy">
        {lines.map((line, index) => (
          <p
            key={`${index}-${line.slice(0, 16)}`}
            className={[
              "connection-manifest__line",
              "connection-intro__manifest-line",
              index === 0 ? "connection-manifest__line--lead" : "",
              index === lines.length - 1 && lines.length > 1
                ? "connection-manifest__line--echo"
                : "",
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
