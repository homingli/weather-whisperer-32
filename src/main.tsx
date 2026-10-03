import { createRoot } from "react-dom/client";
import { Analytics } from "@vercel/analytics/react";
// Fontsource must be imported from JS: CSS @import in index.css breaks under
// Tailwind v4 (dangling url(./files/*) refs, no emitted fonts — see index.css).
import "@fontsource/outfit/300.css";
import "@fontsource/outfit/400.css";
import "@fontsource/outfit/500.css";
import "@fontsource/outfit/700.css";
import "@fontsource/playfair-display/latin-400.css";
import "@fontsource/playfair-display/latin-500.css";
import "@fontsource/playfair-display/latin-600.css";
import "@fontsource/playfair-display/latin-700.css";
import "@fontsource/playfair-display/latin-400-italic.css";
import App from "./App.tsx";
import "./index.css";
import { initSwObservability } from "@/lib/sw-observability";

// Observe SW lifecycle before render so registration failures (bad deploy,
// missing /sw.js) are reported even when the app itself renders fine.
initSwObservability();

createRoot(document.getElementById("root")!).render(
  <>
    <Analytics />
    <App />
  </>
);
