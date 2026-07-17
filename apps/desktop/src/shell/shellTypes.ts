export type UnavailableFeature =
  | "assistant"
  | "extensions"
  | "sourceControl"
  | "tags"
  | "theme";

export function getUnavailableMessage(feature: UnavailableFeature): string {
  switch (feature) {
    case "sourceControl":
      return "Source control is owned by the Git integration work.";
    case "tags":
      return "Tag navigation is not available until indexing exposes tag data.";
    case "extensions":
      return "Extensions are not available until the extensions work is active.";
    case "assistant":
      return "The AI assistant is not available until the AI work is active.";
    case "theme":
      return "Use Settings to change the theme; a shell theme control is planned separately.";
  }
}
