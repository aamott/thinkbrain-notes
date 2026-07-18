import type { Tab } from "@thinkbrain/core";

import type { ActiveDocumentState } from "../stores/appStore";

/** Resolves preview content by the note resource, never by a preview-tab ID. */
export function getDocumentForTabResource(
  documents: Readonly<Record<string, ActiveDocumentState>>,
  tab: Tab
): ActiveDocumentState | undefined {
  const resource = tab.resource;
  if (!resource?.rootPath || !resource.relativePath) {
    return undefined;
  }

  return Object.values(documents).find(
    (document) => {
      const file = document.file;

      return (
        file !== null &&
        file.rootPath === resource.rootPath &&
        file.relativePath === resource.relativePath
      );
    }
  );
}
