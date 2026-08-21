import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

/**
 * Merge Tailwind class names with conflict resolution.
 * Combines clsx (conditional classes) and tailwind-merge
 * (dedupes conflicting Tailwind utilities, last-wins).
 */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}

/** The file name out of a workspace-relative path. */
export function noteName(path: string): string {
  return path.split("/").filter(Boolean).at(-1) ?? path;
}
