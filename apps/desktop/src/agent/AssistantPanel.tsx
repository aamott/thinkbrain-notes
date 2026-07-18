import {
  AssistantRuntimeProvider,
  ComposerPrimitive,
  MessagePrimitive,
  MessagePartPrimitive,
  ThreadPrimitive,
  type ChatModelAdapter,
  useLocalRuntime,
} from '@assistant-ui/react'

import styles from './AssistantPanel.module.css'

const unconfiguredChatModel: ChatModelAdapter = {
  async run() {
    throw new Error('An Agent Client Protocol session is required before chat can run.')
  },
}

const initialMessages = [
  {
    role: 'assistant' as const,
    content:
      'Connect an agent session to enable note-aware assistance. Messages stay unavailable until an Agent Client Protocol runtime is configured.',
  },
]

/**
 * Compact assistant-ui surface for the desktop right panel.
 *
 * This intentionally owns only the presentation/runtime boundary. The host
 * will replace the local placeholder runtime with its ACP-backed runtime when
 * agent lifecycle management is available.
 */
export function AssistantPanel() {
  const runtime = useLocalRuntime(unconfiguredChatModel, { initialMessages })

  return (
    <AssistantRuntimeProvider runtime={runtime}>
      <section className={styles.panel} aria-label="AI assistant">
        <header className={styles.header}>
          <div>
            <p className={styles.eyebrow}>Assistant</p>
            <h2 className={styles.title}>Notes companion</h2>
          </div>
          <span className={styles.status} aria-label="Agent session not connected">
            Offline
          </span>
        </header>

        <div className={styles.context}>
          <span className={styles.contextMark} aria-hidden="true">✦</span>
          <span>Context will follow the active note.</span>
        </div>

        <ThreadPrimitive.Root className={styles.thread}>
          <ThreadPrimitive.Viewport className={styles.viewport} autoScroll>
            <ThreadPrimitive.Messages>
              {({ message }) => (
                <MessagePrimitive.Root
                  className={
                    message.role === 'user'
                      ? styles.userMessage
                      : styles.assistantMessage
                  }
                >
                  <MessagePrimitive.Parts>
                    {() => <MessagePartPrimitive.Text className={styles.messageText} />}
                  </MessagePrimitive.Parts>
                </MessagePrimitive.Root>
              )}
            </ThreadPrimitive.Messages>
          </ThreadPrimitive.Viewport>
        </ThreadPrimitive.Root>

        <div className={styles.composerArea}>
          <ComposerPrimitive.Root className={styles.composer} onSubmit={(event) => event.preventDefault()}>
            <ComposerPrimitive.Input
              className={styles.input}
              disabled
              placeholder="Connect an agent to ask about your notes"
              submitMode="none"
              aria-label="Assistant message"
            />
            <ComposerPrimitive.Send className={styles.send} disabled aria-label="Send message">
              <span aria-hidden="true">↑</span>
            </ComposerPrimitive.Send>
          </ComposerPrimitive.Root>
          <p className={styles.hint}>Agent session required</p>
        </div>
      </section>
    </AssistantRuntimeProvider>
  )
}

export default AssistantPanel
