import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "@thinkbrain/ui/styles.css";
import "./index.css";
import App from "./App";
import { bootstrapExtensions } from "./extensions/bootstrap";
import { createDesktopLocalDirectoryLoader } from "./extensions/desktopLocalDirectoryLoader";
import { createLocalExtensions } from "./extensions/localExtensions";
import { setLocalExtensions } from "./extensions/localExtensionsRef";

// Built-in contributions are registered before React renders so the activity
// bar and palette are complete on the first frame. Extensions loaded from a
// directory arrive later and reach the shell through registry subscriptions.
const bootstrap = bootstrapExtensions();

setLocalExtensions(
  createLocalExtensions({ loader: createDesktopLocalDirectoryLoader(), bootstrap })
);

const root = document.getElementById("root");

if (!root) {
  throw new Error("The desktop root element is missing.");
}

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>
);
