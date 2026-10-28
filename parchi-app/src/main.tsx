import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "@fontsource-variable/inter";
import "@fontsource/jetbrains-mono/500.css";
import "@fontsource/caveat/latin-600.css";
import "./index.css";
import App from "./App";
import { canonicalUrl } from "./lib/site";
import { loadClarity } from "./lib/clarity";

const goTo = canonicalUrl(window.location.href);
if (goTo) {
  window.location.replace(goTo);
} else {
  loadClarity(import.meta.env.VITE_CLARITY_PROJECT_ID, import.meta.env.PROD);
  createRoot(document.getElementById("root")!).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
}
