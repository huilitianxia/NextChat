import { useEffect } from "react";

export function useMobileViewport(mobile: boolean) {
  useEffect(() => {
    const viewport = window.visualViewport;
    if (!mobile || !viewport) return;
    const root = document.documentElement;
    const update = () => {
      if (viewport.scale !== 1) return;
      const keyboard = window.innerHeight - viewport.height > 100;
      if (keyboard) {
        root.style.setProperty(
          "--mobile-viewport-height",
          Math.floor(viewport.height) + "px",
        );
      } else {
        root.style.removeProperty("--mobile-viewport-height");
      }
      root.toggleAttribute("data-mobile-keyboard", keyboard);
    };
    viewport.addEventListener("resize", update);
    window.addEventListener("resize", update);
    update();
    return () => {
      viewport.removeEventListener("resize", update);
      window.removeEventListener("resize", update);
      root.style.removeProperty("--mobile-viewport-height");
      root.removeAttribute("data-mobile-keyboard");
    };
  }, [mobile]);
}
