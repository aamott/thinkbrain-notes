/**
 * Which docks are open and how wide they are, plus the debounced persistence
 * of those choices.
 *
 * Split out of {@link useWorkspaceLifecycle}: restoring a workspace and laying
 * out panels shared a file only because both write desktop state. The
 * lifecycle calls {@link restorePanels} once the persisted desktop state
 * arrives; everything else here is panel-local.
 */

import { useCallback, useMemo, useRef, useState } from "react";
import { createDebounced, type Debounced } from "../lib/debounce";
import {
  clampPanelWidth,
  DEFAULT_LEFT_PANEL_WIDTH,
  DEFAULT_RIGHT_PANEL_WIDTH,
  type DesktopState
} from "../settings/desktopState";
import { persistDesktopState } from "../settings/desktopStatePersistence";
import type { BottomPanel, LeftPanel, PanelSide } from "./shellTypes";

/** How long a drag settles before its final width is written down. */
const PANEL_WIDTH_PERSIST_DELAY_MS = 300;

export function usePanelLayout() {
  const [leftPanel, setLeftPanel] = useState<LeftPanel | null>("explorer");
  const [bottomPanel, setBottomPanel] = useState<BottomPanel | null>(null);
  const [leftWidth, setLeftWidth] = useState(DEFAULT_LEFT_PANEL_WIDTH);
  const [rightWidth, setRightWidth] = useState(DEFAULT_RIGHT_PANEL_WIDTH);
  const leftWidthRef = useRef(leftWidth);
  const rightWidthRef = useRef(rightWidth);

  /**
   * Coalesces rapid resize updates so a drag writes its final width once rather
   * than rewriting the app-settings file for every pointer movement.
   */
  const savePanelWidth = useMemo(
    (): Record<PanelSide, Debounced<number>> => ({
      left: createDebounced<number>(
        (width) => persistDesktopState({ leftPanelWidth: width }),
        PANEL_WIDTH_PERSIST_DELAY_MS
      ),
      right: createDebounced<number>(
        (width) => persistDesktopState({ rightPanelWidth: width }),
        PANEL_WIDTH_PERSIST_DELAY_MS
      )
    }),
    []
  );
  const schedulePanelWidthPersistence = useCallback(
    (side: PanelSide, width: number) => savePanelWidth[side](width),
    [savePanelWidth]
  );

  /** Applies and schedules persistence for a safe dock width. */
  const updatePanelWidth = useCallback((side: PanelSide, requestedWidth: number) => {
    const width = clampPanelWidth(requestedWidth);
    if (side === "left") {
      leftWidthRef.current = width;
      setLeftWidth(width);
    } else {
      rightWidthRef.current = width;
      setRightWidth(width);
    }
    schedulePanelWidthPersistence(side, width);
  }, [schedulePanelWidthPersistence]);

  /** Restores the side-specific dock width used by a double-clicked divider. */
  const resetPanelWidth = useCallback((side: PanelSide) => {
    updatePanelWidth(
      side,
      side === "left" ? DEFAULT_LEFT_PANEL_WIDTH : DEFAULT_RIGHT_PANEL_WIDTH
    );
  }, [updatePanelWidth]);

  const updateBottomPanel = useCallback((panel: BottomPanel | null) => {
    setBottomPanel(panel);
    persistDesktopState({ bottomPanelOpen: panel !== null });
  }, []);

  const toggleBottomPanel = useCallback(() => {
    updateBottomPanel(bottomPanel ? null : "terminal");
  }, [bottomPanel, updateBottomPanel]);

  const selectLeftPanel = useCallback((target: LeftPanel) => {
    setLeftPanel((panel) => {
      const next = panel === target ? null : target;
      persistDesktopState({ explorerOpen: next === "explorer" });
      return next;
    });
  }, []);

  const showExplorer = useCallback(() => {
    setLeftPanel("explorer");
    persistDesktopState({ explorerOpen: true });
  }, []);

  /** Applies the persisted panel layout once the desktop state arrives. */
  const restorePanels = useCallback((desktopState: DesktopState) => {
    setLeftPanel(desktopState.explorerOpen ? "explorer" : null);
    leftWidthRef.current = desktopState.leftPanelWidth;
    rightWidthRef.current = desktopState.rightPanelWidth;
    setLeftWidth(desktopState.leftPanelWidth);
    setRightWidth(desktopState.rightPanelWidth);
    setBottomPanel(desktopState.bottomPanelOpen ? "terminal" : null);
  }, []);

  /** Drops pending width writes — the panel half of the lifecycle's deferred-persistence cancel. */
  const cancelPanelWidthPersistence = useCallback(() => {
    savePanelWidth.left.cancel();
    savePanelWidth.right.cancel();
  }, [savePanelWidth]);

  return {
    bottomPanel,
    cancelPanelWidthPersistence,
    leftPanel,
    leftWidth,
    leftWidthRef,
    resetPanelWidth,
    restorePanels,
    rightWidth,
    rightWidthRef,
    selectLeftPanel,
    setLeftPanel,
    showExplorer,
    toggleBottomPanel,
    updateBottomPanel,
    updatePanelWidth
  };
}
