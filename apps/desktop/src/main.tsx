import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { isTauri } from "@tauri-apps/api/core";
import "@thinkbrain/ui/styles.css";
import "./index.css";
import App from "./App";
import { bootstrapExtensions } from "./extensions/bootstrap";
import { createDesktopExtensionDirectoryStore } from "./extensions/desktopExtensionDirectoryStore";
import { createDesktopLocalDirectoryLoader } from "./extensions/desktopLocalDirectoryLoader";
import { createLocalExtensions } from "./extensions/localExtensions";
import { setLocalExtensions } from "./extensions/localExtensionsRef";

// Built-in contributions are registered before React renders so the activity
// bar and palette are complete on the first frame. Extensions loaded from a
// directory arrive later and reach the shell through registry subscriptions.
const bootstrap = bootstrapExtensions();

const localExtensions = createLocalExtensions({
  loader: createDesktopLocalDirectoryLoader(),
  bootstrap,
  ...(isTauri() ? { directories: createDesktopExtensionDirectoryStore() } : {})
});
setLocalExtensions(localExtensions);

// Directories added in a previous session load again now; one that no longer
// loads stays stored and reports why in the Extensions panel.
void localExtensions.restore().catch((error: unknown) => {
  console.error("[extensions] Failed to restore local extension directories.", error);
});

const root = document.getElementById("root");

if (!root) {
  throw new Error("The desktop root element is missing.");
}

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>
);
