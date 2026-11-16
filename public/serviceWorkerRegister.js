// Updates do not reload active conversations; the worker claims clients.
if ("serviceWorker" in navigator) {
  const start = async () => {
    try {
      const registration = await navigator.serviceWorker.register("/serviceWorker.js");
      await navigator.serviceWorker.ready;
      window._SW_ENABLED = !!navigator.serviceWorker.controller;
      navigator.serviceWorker.addEventListener("controllerchange", () => { window._SW_ENABLED = true; });
      registration.update().catch(() => {});
    } catch { window._SW_ENABLED = false; }
  };
  if (document.readyState === "loading") window.addEventListener("DOMContentLoaded", start, { once: true });
  else start();
}
