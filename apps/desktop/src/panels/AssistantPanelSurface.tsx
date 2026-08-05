import { lazy, Suspense } from "react";

import { Unavailable } from "../shell/Unavailable";

/** Lazy-loaded assistant panel kept outside the registry for fast refresh. */
const LazyAssistantPanel = lazy(async () => {
  const module = await import("../agent/AssistantPanel");
  return { default: module.AssistantPanel };
});

/** Renders the assistant contribution with its existing loading state. */
export function AssistantPanelSurface() {
  return (
    <Suspense
      fallback={
        <Unavailable
          title="Loading assistant"
          description="Preparing the assistant panel…"
        />
      }
    >
      <LazyAssistantPanel />
    </Suspense>
  );
}
