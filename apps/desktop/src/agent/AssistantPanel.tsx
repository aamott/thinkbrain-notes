import { useState } from "react";
import {
  ArrowUp,
  Bot,
  CodeXml,
  FolderOpen,
  Mic,
  Paperclip,
  Server,
  Settings,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Static placeholder messages shown until a real ACP session is wired in.
 *
 * The composer/thread UI is fully built out visually, but no generation
 * happens — we don't accidentally ship a half-wired agent.
 */
type ChatRole = "user" | "assistant";

const INITIAL_MESSAGES: { role: ChatRole; content: string }[] = [
  {
    role: "assistant",
    content:
      "Connect an agent session to enable note-aware assistance. Messages stay unavailable until an Agent Client Protocol runtime is configured.",
  },
];

/**
 * Stub MCP server list for the settings popover. Visual only — toggling a server
 * just flips local UI state and does not connect/disconnect anything.
 */
const MCP_SERVERS = [
  { id: "filesystem", name: "Filesystem", connected: true, enabled: true },
  { id: "terminal", name: "Terminal", connected: true, enabled: true },
  { id: "git", name: "Git", connected: false, enabled: false },
] as const;

/**
 * AssistantPanel renders the right-sidebar agent chat surface.
 *
 * This is a visual implementation: the thread + composer are plain React with
 * Tailwind utilities, but no runtime is connected yet. The composer action bar
 * (upload, settings popover, profile/LLM/harness selectors, voice, send) and
 * the status footer are presentational stubs.
 *
 * Container queries (`@container` on the root) drive responsive label collapsing
 * because the panel lives inside a resizable sidebar whose width is unknown at
 * build time — `sm:` breakpoints would key off the viewport, not the panel.
 */
export function AssistantPanel() {
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [serverEnabled, setServerEnabled] = useState<Record<string, boolean>>(
    () => Object.fromEntries(MCP_SERVERS.map((s) => [s.id, s.enabled])),
  );

  return (
    <section
      // @container enables @sm: responsive variants keyed off panel width.
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
        <form
          className="flex flex-col rounded-lg border border-border p-2"
          onSubmit={(event) => event.preventDefault()}
        >
          <textarea
            className="min-h-[60px] w-full resize-none border-0 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
            disabled
            placeholder="Connect an agent to ask about your notes"
            aria-label="Assistant message"
          />

          <div className="flex items-center justify-between gap-2 border-t border-border pt-1">
            {/* Left group: attachments, settings, profile, LLM label. */}
            <div className="flex min-w-0 flex-1 items-center gap-1">
              {/* Upload + Settings sit close together as a compact pair. */}
              <div className="flex items-center gap-0.5">
                <button
                  type="button"
                  className="flex size-6 items-center justify-center rounded text-muted-foreground hover:bg-accent hover:text-foreground"
                  aria-label="Attach file"
                >
                  <Paperclip className="size-3.5" />
                </button>

                <div className="relative">
                  <button
                    type="button"
                    onClick={() => setSettingsOpen((v) => !v)}
                    className="flex size-6 items-center justify-center rounded text-muted-foreground hover:bg-accent hover:text-foreground"
                    aria-label="Settings"
                    aria-expanded={settingsOpen}
                  >
                    <Settings className="size-3.5" />
                  </button>

                {settingsOpen && (
                  <>
                    {/* Click-away backdrop. */}
                    <button
                      type="button"
                      className="fixed inset-0 z-40 cursor-default"
                      aria-hidden="true"
                      tabIndex={-1}
                      onClick={() => setSettingsOpen(false)}
                    />
                    <div className="absolute bottom-full left-0 mb-2 w-72 rounded-lg border border-border bg-popover p-4 text-popover-foreground shadow-soft z-50">
                      <div className="mb-2.5 flex items-center justify-between">
                        <span className="text-xs font-semibold">MCP Servers</span>
                        <button
                          type="button"
                          onClick={() => setSettingsOpen(false)}
                          aria-label="Close settings"
                          className="flex size-5 items-center justify-center rounded text-muted-foreground hover:text-foreground"
                        >
                          <X className="size-3.5" />
                        </button>
                      </div>

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
                                data-checked={enabled}
                                onClick={() =>
                                  setServerEnabled((prev) => ({
                                    ...prev,
                                    [server.id]: !enabled,
                                  }))
                                }
                                className="flex h-4 w-7 items-center rounded-full bg-secondary px-0.5 data-[checked=true]:bg-primary"
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
              </div>

              <div className="mx-0.5 h-3 w-px bg-border" />

              <button
                type="button"
                className="flex h-6 items-center gap-1 rounded px-1.5 text-muted-foreground hover:bg-accent hover:text-foreground"
                aria-label="Profile"
              >
                <CodeXml className="size-3.5" />
                <span className="hidden @sm:inline text-xs">Code</span>
              </button>

              <span className="hidden min-w-0 flex-1 truncate @sm:block text-xs text-muted-foreground">
                Claude Sonnet 4.5
              </span>
            </div>

            {/* Right group: harness, then voice + send clustered tightly. */}
            <div className="flex shrink-0 items-center gap-1.5">
              <button
                type="button"
                className="flex h-6 items-center gap-1 rounded px-1.5 text-muted-foreground hover:bg-accent hover:text-foreground"
                aria-label="Harness"
              >
                <Bot className="size-3.5" />
                <span className="hidden @sm:inline text-xs">Select</span>
              </button>

              {/* Voice + send sit close together. */}
              <div className="flex items-center gap-0.5">
                <button
                  type="button"
                  className="flex size-6 items-center justify-center rounded text-muted-foreground hover:bg-accent hover:text-foreground"
                  aria-label="Voice input"
                >
                  <Mic className="size-3.5" />
                </button>

                <button
                  type="submit"
                  className="flex size-6 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground disabled:opacity-50"
                  disabled
                  aria-label="Send message"
                >
                  <ArrowUp className="size-3.5" />
                </button>
              </div>
            </div>
          </div>
        </form>

        <div className="mt-1.5 flex gap-4 px-1 text-[11px] text-muted-foreground">
          <div className="flex items-center gap-1">
            <FolderOpen className="size-3" />
            <span className="truncate">thinkbrain-notes</span>
          </div>
          <div className="flex items-center gap-1">
            <Server className="size-3" />
            <span className="truncate">Local</span>
          </div>
        </div>
      </div>
    </section>
  );
}

export default AssistantPanel;
