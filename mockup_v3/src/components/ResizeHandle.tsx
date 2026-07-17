import { useCallback, useEffect, useRef } from 'react'
import { cn } from '@/lib/utils'

type Props = {
  /** Which side the controlled panel is on — determines drag direction. */
  side: 'left' | 'right'
  /** Current width of the controlled panel in px. */
  width: number
  /** Called with the new width (px) during drag. */
  onResize: (width: number) => void
  min?: number
  max?: number
}

/**
 * A draggable divider that resizes an adjacent popout panel.
 *
 * - `side="left"`  → the panel is to the LEFT of the handle (left popout);
 *   dragging right increases width.
 * - `side="right"` → the panel is to the RIGHT of the handle (right popout);
 *   dragging left increases width.
 *
 * Uses window-level pointermove/up listeners for smooth dragging even when
 * the cursor leaves the handle's hit area. Double-click resets to default.
 */
export function ResizeHandle({ side, width, onResize, min = 180, max = 520 }: Props) {
  const startRef = useRef<{ x: number; w: number } | null>(null)

  const onPointerMove = useCallback(
    (e: PointerEvent) => {
      const start = startRef.current
      if (!start) return
      const delta = e.clientX - start.x
      const raw = side === 'left' ? start.w + delta : start.w - delta
      onResize(Math.round(Math.max(min, Math.min(max, raw))))
    },
    [side, onResize, min, max],
  )

  const onPointerUp = useCallback(() => {
    startRef.current = null
    document.body.style.userSelect = ''
    document.body.style.cursor = ''
    window.removeEventListener('pointermove', onPointerMove)
    window.removeEventListener('pointerup', onPointerUp)
  }, [onPointerMove])

  useEffect(() => {
    return () => {
      window.removeEventListener('pointermove', onPointerMove)
      window.removeEventListener('pointerup', onPointerUp)
    }
  }, [onPointerMove, onPointerUp])

  const onPointerDown = (e: React.PointerEvent) => {
    e.preventDefault()
    startRef.current = { x: e.clientX, w: width }
    document.body.style.userSelect = 'none'
    document.body.style.cursor = 'col-resize'
    window.addEventListener('pointermove', onPointerMove)
    window.addEventListener('pointerup', onPointerUp)
  }

  return (
    <div
      onPointerDown={onPointerDown}
      onDoubleClick={() => onResize(side === 'left' ? 256 : 288)}
      className={cn(
        'group relative z-10 h-full w-px shrink-0 cursor-col-resize bg-border transition-colors hover:bg-primary/60',
        // Wider invisible hit area (6px) centered on the 1px visual line
        'before:absolute before:inset-y-0 before:-left-[3px] before:w-[7px]',
      )}
    >
      {/* Visible grip dots on hover */}
      <div className="absolute left-1/2 top-1/2 flex -translate-x-1/2 -translate-y-1/2 flex-col gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
        <span className="size-1 rounded-full bg-muted-foreground" />
        <span className="size-1 rounded-full bg-muted-foreground" />
        <span className="size-1 rounded-full bg-muted-foreground" />
      </div>
    </div>
  )
}
