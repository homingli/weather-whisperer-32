import { createRoot } from "react-dom/client";
import { Analytics } from "@vercel/analytics/react";
import App from "./App.tsx";
import "leaflet/dist/leaflet.css";
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
