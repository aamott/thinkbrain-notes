import type { SVGProps } from "react";

export type ShellIconName =
  | "assistant"
  | "backlinks"
  | "close"
  | "explorer"
  | "extensions"
  | "outline"
  | "panel"
  | "properties"
  | "search"
  | "settings"
  | "sourceControl"
  | "tags"
  | "theme";

interface ShellIconProps extends SVGProps<SVGSVGElement> {
  readonly name: ShellIconName;
}

/** Small dependency-free icon set for shell controls. */
export function ShellIcon({ name, ...props }: ShellIconProps) {
  return (
    <svg
      aria-hidden="true"
      fill="none"
      focusable="false"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="1.8"
      viewBox="0 0 24 24"
      {...props}
    >
      <IconPaths name={name} />
    </svg>
  );
}

function IconPaths({ name }: Pick<ShellIconProps, "name">) {
  switch (name) {
    case "explorer":
      return <path d="M3 6.5h6l2 2H21v9.5H3z" />;
    case "search":
      return <><circle cx="10.5" cy="10.5" r="6.5" /><path d="m16 16 4.5 4.5" /></>;
    case "sourceControl":
      return <><circle cx="6" cy="5" r="2" /><circle cx="18" cy="7" r="2" /><circle cx="6" cy="19" r="2" /><path d="M8 5h4a4 4 0 0 1 4 4v7a3 3 0 0 1-3 3H8" /></>;
    case "tags":
      return <path d="M4 5h8l7 7-7 7-8-8zM8.5 9h.01" />;
    case "extensions":
      return <path d="M8 3h3v4a2 2 0 1 0 4 0V3h1a3 3 0 0 1 3 3v3h-4a2 2 0 1 0 0 4h4v5a3 3 0 0 1-3 3h-4v-4a2 2 0 1 0-4 0v4H6a3 3 0 0 1-3-3v-5h4a2 2 0 1 0 0-4H3V6a3 3 0 0 1 3-3z" />;
    case "assistant":
      return <><path d="m12 3 1.5 5.5L19 10l-5.5 1.5L12 17l-1.5-5.5L5 10l5.5-1.5z" /><path d="m18 16 .7 2.3L21 19l-2.3.7L18 22l-.7-2.3L15 19l2.3-.7z" /></>;
    case "settings":
      return <><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1-2.1 2.1-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.6v.2h-3v-.2a1.7 1.7 0 0 0-1-1.6 1.7 1.7 0 0 0-1.9.3l-.1.1-2.1-2.1.1-.1a1.7 1.7 0 0 0 .3-1.9 1.7 1.7 0 0 0-1.6-1H5v-3h.2a1.7 1.7 0 0 0 1.6-1 1.7 1.7 0 0 0-.3-1.9l-.1-.1 2.1-2.1.1.1a1.7 1.7 0 0 0 1.9.3 1.7 1.7 0 0 0 1-1.6V3.5h3v.2a1.7 1.7 0 0 0 1 1.6 1.7 1.7 0 0 0 1.9-.3l.1-.1 2.1 2.1-.1.1a1.7 1.7 0 0 0-.3 1.9 1.7 1.7 0 0 0 1.6 1h.2v3h-.2a1.7 1.7 0 0 0-1.6 1z" /></>;
    case "theme":
      return <><circle cx="12" cy="12" r="4" /><path d="M12 2v2m0 16v2M2 12h2m16 0h2m-2.9-7.1-1.4 1.4M6.3 17.7l-1.4 1.4m0-14.2 1.4 1.4m11.4 11.4 1.4 1.4" /></>;
    case "outline":
      return <><path d="M5 6h14M5 12h14M5 18h14" /><path d="M3 6h.01M3 12h.01M3 18h.01" /></>;
    case "backlinks":
      return <><path d="M10 7H6a3 3 0 0 0 0 6h2" /><path d="m9 10 3 3-3 3" /><path d="M14 17h4a3 3 0 0 0 0-6h-2" /><path d="m15 14-3-3 3-3" /></>;
    case "properties":
      return <><path d="M4 7h16M4 12h16M4 17h16" /><circle cx="9" cy="7" r="1.5" /><circle cx="15" cy="12" r="1.5" /><circle cx="11" cy="17" r="1.5" /></>;
    case "panel":
      return <><rect height="14" rx="1" width="18" x="3" y="5" /><path d="M9 5v14" /></>;
    case "close":
      return <path d="m6 6 12 12M18 6 6 18" />;
  }
}
