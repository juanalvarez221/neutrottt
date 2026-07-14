"use client";

import { Check } from "lucide-react";
import type { ConnectionSelectionMode } from "@/shared/lib/quoteConnection";

type ConnectionChoiceOptionProps = {
  selected: boolean;
  label: string;
  detail?: string;
  mode: ConnectionSelectionMode;
  onClick: () => void;
};

export function ConnectionChoiceOption({
  selected,
  label,
  detail,
  mode,
  onClick,
}: ConnectionChoiceOptionProps) {
  const isSingle = mode === "single";

  return (
    <button
      type="button"
      role={isSingle ? "radio" : "checkbox"}
      aria-checked={selected}
      onClick={onClick}
      className={[
        "connection-choice focus-ring",
        selected ? "connection-choice--selected" : "",
        isSingle ? "connection-choice--single" : "connection-choice--multi",
        detail ? "connection-choice--with-detail" : "",
      ].join(" ")}
    >
      <span className="connection-choice__copy">
        <span className="connection-choice__label">{label}</span>
        {detail ? <span className="connection-choice__detail">{detail}</span> : null}
      </span>
      <span
        className={[
          "connection-choice__indicator",
          isSingle ? "connection-choice__indicator--radio" : "connection-choice__indicator--check",
          selected ? "connection-choice__indicator--on" : "",
        ].join(" ")}
        aria-hidden
      >
        {selected ? (
          isSingle ? (
            <span className="connection-choice__radio-dot" />
          ) : (
            <Check className="h-3 w-3" strokeWidth={2.5} />
          )
        ) : null}
      </span>
    </button>
  );
}
