import { useState, type ReactNode } from "react";
import {
  ArrowUp,
  Bot,
  CodeXml,
  FileText,
  FolderOpen,
  Mic,
  Paperclip,
  Settings,
  Users,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";

/** Static placeholder messages shown until a real ACP session is wired in. */
type ChatRole = "user" | "assistant";

const INITIAL_MESSAGES: { role: ChatRole; content: string }[] = [
  {
    role: "assistant",
    content:
      "Connect an agent session to enable note-aware assistance. Messages stay unavailable until an Agent Client Protocol runtime is configured.",
  },
];

/** Stub MCP server list for the settings popover. Visual only. */
const MCP_SERVERS = [
  { id: "filesystem", name: "Filesystem", connected: true, enabled: true },
  { id: "terminal", name: "Terminal", connected: true, enabled: true },
  { id: "git", name: "Git", connected: false, enabled: false },
] as const;

/** Mock files-changed data for the tabs menu. Visual only. */
const MOCK_CHANGED_FILES = [
  { name: "notes.md", added: 12, removed: 3 },
  { name: "todo.md", added: 5, removed: 1 },
] as const;

/** Totalled +x -y across all changed files, for the tab label. */
const FILES_TOTAL = MOCK_CHANGED_FILES.reduce(
  (acc, f) => ({ added: acc.added + f.added, removed: acc.removed + f.removed }),
  { added: 0, removed: 0 },
);

/** Mock subagent data for the tabs menu. Visual only. */
const MOCK_SUBAGENTS = [
  { id: "research", name: "Research" },
  { id: "writer", name: "Writer" },
] as const;

/** Mock context stats for the context ring popout. */
const MOCK_CONTEXT = {
  percent: 50,
  usedLabel: "100k / 200k",
  cost: "$0.42",
  cacheExpiry: "12m",
} as const;

/** Whether any tab has content (controls shading + tab strip rendering). */
const HAS_TABS = MOCK_CHANGED_FILES.length > 0 || MOCK_SUBAGENTS.length > 0;

/**
 * ContextRing — gray background ring with a foreground fill ring that shows
 * context usage as a percentage. Hover/focus reveals a stats popout.
 */
function ContextRing({ percent }: { percent: number }) {
  const radius = 6;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (percent / 100) * circumference;
  return (
    <svg className="size-3.5 -rotate-90" viewBox="0 0 14 14" aria-hidden="true">
      <circle cx="7" cy="7" r={radius} fill="none" stroke="currentColor" strokeWidth="2" className="opacity-30" />
      <circle
        cx="7"
        cy="7"
        r={radius}
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeDasharray={circumference}
        strokeDashoffset={offset}
        strokeLinecap="round"
      />
    </svg>
  );
}

/**
 * ComposerButton — shared icon button for the composer bar. Eliminates the
 * repeated class string across all 8 composer controls. `title` provides a
 * native tooltip; `aria-label` provides the accessible name.
 */
function ComposerButton({
  label,
  children,
  className,
  ...props
}: {
  label: string;
  children: ReactNode;
} & Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, "aria-label" | "title">) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      className={cn(
        "flex size-6 shrink-0 items-center justify-center rounded text-muted-foreground hover:bg-accent hover:text-foreground",
        className,
      )}
      {...props}
    >
      {children}
    </button>
  );
}

/** Tab button — used for files/subagents tab labels. */
function TabButton({
  label,
  active,
  onClick,
  children,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      title={label}
      onClick={onClick}
      aria-label={label}
      aria-expanded={active}
      className={cn(
        "flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] transition-colors",
        active
          ? "bg-background font-medium text-foreground shadow-soft"
          : "text-muted-foreground hover:bg-background/50 hover:text-foreground",
      )}
    >
      {children}
    </button>
  );
}

/**
 * AssistantPanel renders the right-sidebar agent chat surface.
 *
 * Visual mockup only — no runtime is connected. The composer bar follows the
 * locked layout from `plans/pending-ai-med-hard.md`:
 * attach → MCP settings → profile → model → context ring → harness → voice → send.
 *
 * Container queries drive responsive label collapsing (harness first, then
 * profile, then model truncates with `...`).
 */
export function AssistantPanel() {
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [contextOpen, setContextOpen] = useState(false);
  const [expandedTab, setExpandedTab] = useState<"files" | "subagents" | null>(null);
  const [serverEnabled, setServerEnabled] = useState<Record<string, boolean>>(
    () => Object.fromEntries(MCP_SERVERS.map((s) => [s.id, s.enabled])),
  );

  return (
    <section
      className="@container flex h-full min-h-0 flex-col overflow-hidden bg-panel text-panel-foreground"
      aria-label="AI assistant"
    >
      {/* Thread viewport. */}
      <div className="flex min-h-0 flex-1 flex-col gap-2.5 overflow-y-auto px-3 py-3.5">
        {INITIAL_MESSAGES.map((message, index) => (
          <div
            key={index}
            className={cn(
              "w-fit max-w-[min(100%,30rem)] rounded-lg px-2.5 py-1.5",
              message.role === "user"
                ? "self-end bg-primary text-primary-foreground"
                : "self-start border border-border bg-card",
            )}
          >
            <span className="block text-xs leading-relaxed">{message.content}</span>
          </div>
        ))}
      </div>

      <div className="shrink-0 px-3 pb-2 pt-1.5">
        {/* One container wraps tabs + input. When tabs have content, the
            container is shaded and the input form inside has its own
            bg-background + rounded-lg, so the shading shows through the gaps
            around the form's curved corners. */}
        <div className={cn("rounded-lg border border-border", HAS_TABS && "bg-muted/50")}>
          {/* Tab content — expands above the tab labels. */}
          {expandedTab === "files" && (
            <div className="px-2 pb-1.5 pt-1">
              {MOCK_CHANGED_FILES.map((file) => (
                <div key={file.name} className="flex items-center gap-2 py-0.5 text-xs">
                  <FileText className="size-3 shrink-0 text-muted-foreground" />
                  <span className="truncate">{file.name}</span>
                  <span className="ml-auto flex shrink-0 gap-1.5 tabular-nums">
                    <span className="text-success">+{file.added}</span>
                    <span className="text-destructive">-{file.removed}</span>
                  </span>
                </div>
              ))}
              <div className="mt-1.5 flex gap-1.5">
                <button
                  type="button"
                  title="Reject all file changes"
                  className="rounded border border-border bg-background px-2 py-0.5 text-[11px] text-muted-foreground hover:bg-accent hover:text-foreground"
                >
                  Reject all
                </button>
                <button
                  type="button"
                  title="Accept all file changes"
                  className="rounded bg-primary px-2 py-0.5 text-[11px] text-primary-foreground hover:bg-primary/90"
                >
                  Accept all
                </button>
              </div>
            </div>
          )}

          {expandedTab === "subagents" && (
            <div className="px-2 pb-1.5 pt-1">
              {MOCK_SUBAGENTS.map((agent) => (
                <button
                  key={agent.id}
                  type="button"
                  title={`Scroll to subagent ${agent.name}`}
                  className="flex w-full items-center gap-2 rounded py-0.5 text-xs hover:bg-background/50"
                >
                  <Users className="size-3 shrink-0 text-muted-foreground" />
                  <span className="truncate">{agent.name}</span>
                </button>
              ))}
            </div>
          )}

          {/* Tab labels — only renders when at least one tab has content.
              border-t separates labels from expanded content above. */}
          {HAS_TABS && (
            <div className={cn("flex items-center gap-1 px-2 py-1", expandedTab && "border-t border-border")}>
              {MOCK_CHANGED_FILES.length > 0 && (
                <TabButton
                  label="Files changed"
                  active={expandedTab === "files"}
                  onClick={() => setExpandedTab((v) => (v === "files" ? null : "files"))}
                >
                  <FileText className="size-3" />
                  <span className="flex gap-1 tabular-nums">
                    <span className="text-success">+{FILES_TOTAL.added}</span>
                    <span className="text-destructive">-{FILES_TOTAL.removed}</span>
                  </span>
                </TabButton>
              )}
              {MOCK_SUBAGENTS.length > 0 && (
                <TabButton
                  label="Subagents"
                  active={expandedTab === "subagents"}
                  onClick={() => setExpandedTab((v) => (v === "subagents" ? null : "subagents"))}
                >
                  <Users className="size-3" />
                  <span className="tabular-nums">{MOCK_SUBAGENTS.length}</span>
                </TabButton>
              )}
            </div>
          )}

          {/* Input form — rounded corners + unshaded background inside the
              shaded container, so shading wraps its curved corners. */}
          <form
            className={cn("flex flex-col rounded-lg p-2", HAS_TABS && "bg-background")}
            onSubmit={(event) => event.preventDefault()}
          >
            <textarea
              className="min-h-15 w-full resize-none border-0 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
              disabled
              placeholder="Connect an agent to ask about your notes"
              aria-label="Assistant message input"
            />

            {/* Composer bar — left to right:
                attach → MCP settings → profile → model → context ring → harness → voice → send */}
            <div className="flex items-center gap-1 border-t border-border pt-1">
              {/* 1. Attach file */}
              <ComposerButton label="Attach file">
                <Paperclip className="size-3.5" />
              </ComposerButton>

              {/* 2. MCP settings — gear icon with popout */}
              <div className="relative shrink-0">
                <ComposerButton
                  label="MCP settings"
                  aria-expanded={settingsOpen}
                  onClick={() => setSettingsOpen((v) => !v)}
                >
                  <Settings className="size-3.5" />
                </ComposerButton>

                {settingsOpen && (
                  <>
                    <button
                      type="button"
                      className="fixed inset-0 z-40 cursor-default"
                      aria-hidden="true"
                      tabIndex={-1}
                      onClick={() => setSettingsOpen(false)}
                    />
                    <div className="absolute bottom-full left-0 mb-2 w-72 rounded-lg border border-border bg-popover p-3 text-popover-foreground shadow-soft z-50">
                      {/* Header: "x mcp    [mcp settings] [open mcp config file] [close]" */}
                      <div className="mb-2.5 flex items-center justify-between">
                        <span className="text-xs font-semibold">{MCP_SERVERS.length} mcp</span>
                        <div className="flex items-center gap-1">
                          <ComposerButton
                            label="Open MCP settings page"
                            className="size-5"
                            onClick={() => setSettingsOpen(false)}
                          >
                            <Settings className="size-3.5" />
                          </ComposerButton>
                          <ComposerButton
                            label="Open MCP config file in editor"
                            className="size-5"
                            onClick={() => setSettingsOpen(false)}
                          >
                            <FileText className="size-3.5" />
                          </ComposerButton>
                          <ComposerButton
                            label="Close MCP settings popout"
                            className="size-5"
                            onClick={() => setSettingsOpen(false)}
                          >
                            <X className="size-3.5" />
                          </ComposerButton>
                        </div>
                      </div>

                      {/* MCP rows: status bubble, name, switch */}
                      <div className="flex flex-col gap-2.5">
                        {MCP_SERVERS.map((server) => {
                          const enabled = serverEnabled[server.id] ?? server.enabled;
                          return (
                            <div key={server.id} className="flex items-center justify-between">
                              <div className="flex items-center gap-2">
                                <span
                                  className={cn(
                                    "size-2 rounded-full",
                                    server.connected ? "bg-success" : "bg-muted-foreground",
                                  )}
                                />
                                <span className="truncate text-xs">{server.name}</span>
                              </div>
                              <button
                                type="button"
                                role="switch"
                                aria-checked={enabled}
                                aria-label={`Toggle MCP server ${server.name}`}
                                title={`${server.name}: ${enabled ? "on" : "off"}`}
                                onClick={() =>
                                  setServerEnabled((prev) => ({ ...prev, [server.id]: !enabled }))
                                }
                                className={cn(
                                  "flex h-4 w-7 items-center rounded-full px-0.5 transition-colors",
                                  enabled ? "bg-primary" : "bg-secondary",
                                )}
                              >
                                <span
                                  className={cn(
                                    "size-3 rounded-full bg-background transition-transform",
                                    enabled && "translate-x-3",
                                  )}
                                />
                              </button>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </>
                )}
              </div>

              {/* 3. Profile selector — label collapses at @[418px]. */}
              <button
                type="button"
                title="Profile: Code"
                className="flex h-6 shrink-0 items-center gap-1 rounded px-1.5 text-muted-foreground hover:bg-accent hover:text-foreground"
              >
                <CodeXml className="size-3.5" />
                <span className="hidden @[418px]:inline text-xs">Code</span>
              </button>

              {/* 4. Model selector — always visible, truncates at narrow widths. */}
              <button
                type="button"
                title="Model: Claude Sonnet 4.5"
                className="flex h-6 min-w-0 flex-1 items-center gap-1 rounded px-1.5 text-muted-foreground hover:bg-accent hover:text-foreground"
              >
                <span className="truncate text-xs">Claude Sonnet 4.5</span>
              </button>

              {/* 5. Context ring — popout on hover/focus. */}
              <div
                className="relative shrink-0"
                onMouseEnter={() => setContextOpen(true)}
                onMouseLeave={() => setContextOpen(false)}
                onFocus={() => setContextOpen(true)}
                onBlur={() => setContextOpen(false)}
              >
                <ComposerButton label={`Context usage ${MOCK_CONTEXT.percent}%`}>
                  <ContextRing percent={MOCK_CONTEXT.percent} />
                </ComposerButton>

                {contextOpen && (
                  <div className="absolute bottom-full right-0 mb-2 w-48 rounded-lg border border-border bg-popover p-3 text-popover-foreground shadow-soft z-50">
                    <div className="flex flex-col gap-1 text-xs">
                      <span className="font-medium">
                        {MOCK_CONTEXT.percent}% ({MOCK_CONTEXT.usedLabel}) context used
                      </span>
                      <span className="text-muted-foreground">Total cost: {MOCK_CONTEXT.cost}</span>
                      <span className="text-muted-foreground">
                        Cache expiry: {MOCK_CONTEXT.cacheExpiry}
                      </span>
                    </div>
                  </div>
                )}
              </div>

              {/* 6. Harness selector — label collapses at @[482px]. */}
              <button
                type="button"
                title="Harness: Select"
                className="flex h-6 shrink-0 items-center gap-1 rounded px-1.5 text-muted-foreground hover:bg-accent hover:text-foreground"
              >
                <Bot className="size-3.5" />
                <span className="hidden @[482px]:inline text-xs">Select</span>
              </button>

              {/* 7. Voice record + 8. Send/cancel */}
              <div className="flex shrink-0 items-center gap-0.5">
                <ComposerButton label="Voice input">
                  <Mic className="size-3.5" />
                </ComposerButton>
                <button
                  type="submit"
                  title="Send message"
                  className="flex size-6 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground disabled:opacity-50"
                  disabled
                  aria-label="Send message"
                >
                  <ArrowUp className="size-3.5" />
                </button>
              </div>
            </div>
          </form>
        </div>

        {/* Status footer — workspace name + future status indicators. */}
        <div className="mt-1.5 flex items-center gap-4 px-1 text-[11px] text-muted-foreground">
          <div className="flex items-center gap-1">
            <FolderOpen className="size-3" />
            <span className="truncate">thinkbrain-notes</span>
          </div>
        </div>
      </div>
    </section>
  );
}
