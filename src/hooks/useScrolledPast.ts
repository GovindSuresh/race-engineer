"use client";

import { useCallback, useEffect, useState } from "react";

/** Tracks whether an element has scrolled up out of view, for revealing a
 *  sticky stand-in once the real thing is no longer reachable.
 *
 *  Returns a `ref` callback to attach to the element and the boolean. It's a
 *  callback ref rather than a `useRef` object on purpose: the element it
 *  watches is conditionally rendered (there's no lap-selection block until a
 *  file is loaded), and an effect keyed on a ref object would run once while
 *  `.current` was still null and never re-attach. A callback ref sets state, so
 *  the observer attaches the moment the node appears and detaches when it goes.
 *
 *  Uses IntersectionObserver rather than a scroll listener: the browser
 *  computes visibility itself and calls back only when the answer changes,
 *  where a scroll handler would run on every frame of every scroll.
 *
 *  `topInset` is how much of the viewport the sticky header covers, so "out of
 *  view" means "hidden behind the header" rather than "past the very top of the
 *  window" — without it the bar appears a header's-height too late.
 *
 *  It must stay a FIXED value, not the live height of a header that grows when
 *  the bar appears. Feeding the bar's own effect on layout back into the
 *  threshold that decides whether to show it is a feedback loop: the bar
 *  appears, the header gets taller, the element is now "further" past the
 *  threshold, and near the boundary it can flip on and off every frame. With a
 *  constant inset the result is a pure function of scroll position.
 */
export function useScrolledPast(topInset = 56) {
  const [node, setNode] = useState<HTMLElement | null>(null);
  const [scrolledPast, setScrolledPast] = useState(false);

  const ref = useCallback((el: HTMLElement | null) => setNode(el), []);

  useEffect(() => {
    if (!node) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        // Both halves matter: `!isIntersecting` alone is also true for anything
        // still below the fold, which would show the bar before the user has
        // scrolled anywhere at all.
        setScrolledPast(!entry.isIntersecting && entry.boundingClientRect.top < topInset);
      },
      { rootMargin: `-${topInset}px 0px 0px 0px` },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [node, topInset]);

  // Derived rather than reset in the effect: with no element there is nothing to
  // have scrolled past, and clearing the flag by calling setState in the effect
  // body would trigger a second render pass every time the node unmounts. On
  // remount the observer fires straight away with the current position, so the
  // retained value can't be read while stale.
  return [ref, node !== null && scrolledPast] as const;
}
