"use client";

import { useId } from "react";

export interface FileUploadButtonProps {
  /** Small label above the control — e.g. "Run 1". */
  label: string;
  /** Renders the label in this color instead of muted — used for Stint
   *  Planner's per-run identity color, which must match that run's series
   *  color in the charts. */
  labelColor?: string;
  accept: string;
  /** Name of the currently-selected file, or null/undefined for none. */
  fileName?: string | null;
  onFileSelected: (file: File) => void;
  /** Shows a clear (✕) control next to the filename once one is selected. */
  onClear?: () => void;
  disabled?: boolean;
  error?: string | null;
  /** Bump this after calling onClear to force the underlying (uncontrolled)
   *  file input to remount — otherwise the browser keeps the old file
   *  associated with the input even though our own state has cleared it. */
  resetKey?: number;
  buttonLabel?: string;
}

/** A styled stand-in for the browser's default `<input type="file">` — same
 *  underlying input (kept for native file-picker and keyboard behavior), just
 *  visually hidden and triggered via a real button-looking `<label>` instead
 *  of the browser's "Choose file / no file chosen" chrome. */
export function FileUploadButton({
  label,
  labelColor,
  accept,
  fileName,
  onFileSelected,
  onClear,
  disabled,
  error,
  resetKey,
  buttonLabel = "Choose file",
}: FileUploadButtonProps) {
  const id = useId();

  return (
    <div className="flex flex-col gap-2">
      <span
        className="font-display text-[13px] uppercase tracking-[0.1em]"
        style={{ color: labelColor ?? "var(--muted)" }}
      >
        {label}
      </span>
      <div className="flex items-center gap-2">
        <label
          htmlFor={id}
          className={`shrink-0 rounded-sm border px-3 py-1 font-display text-[13px] uppercase tracking-[0.06em] transition-colors ${
            disabled
              ? "cursor-not-allowed border-line bg-panel text-faint"
              : "cursor-pointer border-line2 bg-panel2 text-text hover:border-amber hover:text-amber"
          }`}
        >
          {buttonLabel}
        </label>
        <input
          key={resetKey}
          id={id}
          type="file"
          accept={accept}
          disabled={disabled}
          className="sr-only"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) onFileSelected(file);
          }}
        />
        <span
          className={`truncate font-mono text-[11px] ${fileName ? "text-pgreen" : "text-faint"}`}
        >
          {fileName ?? "Not loaded"}
        </span>
        {fileName && onClear && (
          <button
            type="button"
            onClick={onClear}
            aria-label="Clear file"
            className="shrink-0 text-faint transition-colors hover:text-danger"
          >
            ✕
          </button>
        )}
      </div>
      {error && <p className="font-mono text-[11px] text-danger">{error}</p>}
    </div>
  );
}
