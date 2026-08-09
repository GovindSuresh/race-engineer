"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/** Binds file drag-and-drop at the DOCUMENT level and reports whether a drag
 *  is currently in progress.
 *
 *  Document-level rather than on one element for two reasons: a drop-anywhere
 *  target is far more forgiving than making the user hit a specific box, and
 *  browsers NAVIGATE AWAY from the page when a file is dropped on an element
 *  that doesn't `preventDefault`, so the document has to handle the event
 *  regardless of where the visible target is.
 *
 *  Lives in a hook rather than inside the drop-zone component because the
 *  Race Analysis dashboard also needs to accept a dropped Garage61 CSV after
 *  its upload stage has been replaced by the dashboard itself. */
export function useFileDrop(onFiles: (files: File[]) => void): { isDragging: boolean } {
  const [isDragging, setIsDragging] = useState(false);
  // Drag events fire per-element as the pointer crosses children, so a plain
  // boolean flickers on every internal boundary. Counting enter/leave pairs is
  // the standard fix.
  const dragDepth = useRef(0);

  // Held in a ref so the listeners (bound once) always call the latest
  // callback without re-binding on every parent render.
  const onFilesRef = useRef(onFiles);
  useEffect(() => {
    onFilesRef.current = onFiles;
  }, [onFiles]);

  const reset = useCallback(() => {
    dragDepth.current = 0;
    setIsDragging(false);
  }, []);

  useEffect(() => {
    const onDragEnter = (e: DragEvent) => {
      e.preventDefault();
      dragDepth.current += 1;
      setIsDragging(true);
    };
    const onDragOver = (e: DragEvent) => e.preventDefault();
    const onDragLeave = (e: DragEvent) => {
      e.preventDefault();
      dragDepth.current -= 1;
      if (dragDepth.current <= 0) reset();
    };
    const onDrop = (e: DragEvent) => {
      e.preventDefault();
      reset();
      const files = e.dataTransfer?.files;
      if (files && files.length > 0) onFilesRef.current([...files]);
    };

    document.addEventListener("dragenter", onDragEnter);
    document.addEventListener("dragover", onDragOver);
    document.addEventListener("dragleave", onDragLeave);
    document.addEventListener("drop", onDrop);
    return () => {
      document.removeEventListener("dragenter", onDragEnter);
      document.removeEventListener("dragover", onDragOver);
      document.removeEventListener("dragleave", onDragLeave);
      document.removeEventListener("drop", onDrop);
    };
  }, [reset]);

  return { isDragging };
}
