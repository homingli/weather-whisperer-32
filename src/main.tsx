import { createRoot } from "react-dom/client";
import { gsap } from "gsap";
import { useGSAP } from "@gsap/react";
import App from "./App.tsx";
import "leaflet/dist/leaflet.css";
import "./index.css";

// Register the GSAP React plugin once at app boot so components don't
// repeat the registration. Idempotent per GSAP docs.
gsap.registerPlugin(useGSAP);

createRoot(document.getElementById("root")!).render(<App />);
