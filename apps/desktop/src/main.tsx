import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "@thinkbrain/ui/styles.css";
import "./index.css";
import App from "./App";
import { bootstrapExtensions } from "./extensions/bootstrap";

// Registers manifest-declared contributions BEFORE React renders. The command
// and panel registries are not reactive — nothing subscribes to them — so a
// contribution added after the first render would not appear in the activity
// bar until an unrelated re-render.
bootstrapExtensions();

const root = document.getElementById("root");

if (!root) {
  throw new Error("The desktop root element is missing.");
}

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>
);
