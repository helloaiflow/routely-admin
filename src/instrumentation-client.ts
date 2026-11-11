/**
 * M28-B · Browser error capture for GlitchTip. Runs before hydration.
 * Only the two global error channels are wired: no console, DOM, input,
 * fetch/XHR, navigation or replay capture. Inert unless config enables it.
 */

import { readConfig } from "@/lib/observability/config";
import { captureError } from "@/lib/observability/reporter";

if (typeof window !== "undefined" && readConfig("browser")) {
  window.addEventListener("error", (e) => {
    void captureError(e.error, { operation: "browser.unhandled_error", runtime: "browser" });
  });
  window.addEventListener("unhandledrejection", (e) => {
    void captureError(e.reason, { operation: "browser.unhandled_rejection", runtime: "browser" });
  });
}
