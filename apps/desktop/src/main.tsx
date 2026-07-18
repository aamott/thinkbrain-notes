import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "@thinkbrain/ui/styles.css";
import "./shell/global.css";
import App from "./App";

const root = document.getElementById("root");

if (!root) {
  throw new Error("The desktop root element is missing.");
}

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>
);
