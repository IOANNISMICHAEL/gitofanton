"use client";

import { useEffect } from "react";
import Lenis from "lenis";
import "lenis/dist/lenis.css";

/**
 * Smooth, inertial wheel scrolling (Lenis) on desktop. Touch devices keep native scrolling, and so does
 * anyone with "reduce motion" on. Dialogs (search) and the phone menu scroll natively, and the page
 * stops while a dialog locks it.
 */
export function SmoothScroll() {
  useEffect(() => {
    if (matchMedia("(prefers-reduced-motion: reduce)").matches || !matchMedia("(pointer: fine)").matches) return;
    const lenis = new Lenis({
      autoRaf: true,
      anchors: true,
      allowNestedScroll: true,
      prevent: (node) => !!node.closest("[role=dialog], [data-lenis-prevent]"),
    });
    // Radix dialogs mark <body data-scroll-locked> while open.
    const sync = () => (document.body.hasAttribute("data-scroll-locked") ? lenis.stop() : lenis.start());
    const mo = new MutationObserver(sync);
    mo.observe(document.body, { attributes: true, attributeFilter: ["data-scroll-locked"] });
    return () => {
      mo.disconnect();
      lenis.destroy();
    };
  }, []);
  return null;
}
