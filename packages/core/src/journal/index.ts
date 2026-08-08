/**
 * Journal data model: filenames, dates, and the frontmatter contract.
 *
 * Platform-agnostic and file-shaped — a journal entry is an ordinary Markdown
 * note (D2), and nothing here reads or writes one.
 */
export * from "./types";
export * from "./filename";
export * from "./paths";
export * from "./frontmatter";
export * from "./calendar";
