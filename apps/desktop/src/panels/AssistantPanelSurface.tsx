import { lazy, Suspense } from "react";

import { Unavailable } from "../shell/Unavailable";

/** Lazy-loaded assistant panel kept behind a dynamic import boundary for fast refresh; the registry references this surface, not the heavy agent module directly. */
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
