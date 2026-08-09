"use client";

import { useRef } from "react";
import { useFileDrop } from "@/hooks/useFileDrop";

export interface DropSlot {
  key: string;
  /** What this slot is for, e.g. "iRacing lap chart". */
  label: string;
  /** Requirement + extension line, e.g. "Required · .json". */
  requirement: string;
  /** Filename once loaded, or null. */
  fileName: string | null;
}

export interface DropStageProps {
  flag: string;
  heading: string;
  blurb: React.ReactNode;
  slots: DropSlot[];
  accept: string;
  /** Called once per dropped/selected file. The parent decides which slot a
   *  file belongs to (by extension), since only it knows how to parse them. */
  onFiles: (files: File[]) => void;
  error?: string | null;
}

/** Full-screen upload stage — the app's first impression, shown until enough
 *  data is loaded to render a dashboard. Drag-and-drop comes from
 *  `useFileDrop`, which binds at the document level (see the note there). */
export function DropStage({
  flag,
  heading,
  blurb,
  slots,
  accept,
  onFiles,
  error,
}: DropStageProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const { isDragging } = useFileDrop(onFiles);

  return (
    <div className="flex min-h-[calc(100vh-110px)] items-center justify-center px-5 py-10">
      <div
        className={`w-[min(720px,100%)] rounded-lg border border-dashed px-11 py-13 text-center transition-colors ${
          isDragging ? "border-amber bg-panel2" : "border-line2 bg-panel"
        }`}
      >
        <div className="mb-4 font-mono text-xs uppercase tracking-[0.3em] text-amber">{flag}</div>
        <h2 className="mb-2.5 font-display text-[38px] font-bold uppercase leading-none tracking-[0.03em] text-text">
          {heading}
        </h2>
        <p className="mx-auto mb-6 max-w-[52ch] text-muted">{blurb}</p>

        <div className="mx-auto mb-6 grid max-w-[560px] gap-2.5 text-left sm:grid-cols-2">
          {slots.map((slot) => (
            <div
              key={slot.key}
              className={`rounded border px-3.5 py-3 ${
                slot.fileName ? "border-pgreen bg-panel2" : "border-line bg-panel2"
              }`}
            >
              <div className="flex items-center justify-between gap-2 font-display text-[13px] uppercase tracking-[0.08em] text-muted">
                <span>{slot.label}</span>
                <span className="text-[10px] tracking-[0.1em] text-faint">{slot.requirement}</span>
              </div>
              <div
                className={`mt-1 truncate font-mono text-[11px] ${
                  slot.fileName ? "text-pgreen" : "text-faint"
                }`}
              >
                {slot.fileName ?? "Not loaded"}
              </div>
            </div>
          ))}
        </div>

        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          className="rounded border-0 bg-amber px-6 py-2.5 font-display text-base font-semibold uppercase tracking-[0.08em] text-[#181203] transition-[filter] hover:brightness-110"
        >
          Browse for files
        </button>
        <input
          ref={inputRef}
          type="file"
          accept={accept}
          multiple
          className="sr-only"
          onChange={(e) => {
            const files = e.target.files;
            if (files && files.length > 0) onFiles([...files]);
            // Reset so re-selecting the same file still fires a change event.
            e.target.value = "";
          }}
        />

        {error && <p className="mt-4 font-mono text-xs text-danger">{error}</p>}

        <div className="mt-4 text-xs text-faint">
          Everything is processed in your browser. Nothing is uploaded.
        </div>
      </div>
    </div>
  );
}
