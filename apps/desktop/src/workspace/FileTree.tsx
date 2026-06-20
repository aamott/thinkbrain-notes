import type { MarkdownFileEntry } from "@thinkbrain/core";
import { classNames } from "@thinkbrain/ui";
import { useEffect, useRef, useState } from "react";
import { Tree, type NodeRendererProps } from "react-arborist";

import type { FileTreeNode } from "./fileTreeModel";

const ROW_HEIGHT = 28;
const TREE_INDENT = 14;

interface FileTreeProps {
  readonly nodes: FileTreeNode[];
  readonly activeRelativePath: string | null;
  readonly busyPath: string | null;
  readonly onOpenNote: (file: MarkdownFileEntry) => void;
  readonly onRenameNote: (file: MarkdownFileEntry) => void;
  readonly onDeleteNote: (file: MarkdownFileEntry) => void;
}

/**
 * Renders the workspace files as a collapsible, virtualized folder tree.
 *
 * react-arborist owns row virtualization and keyboard navigation; this component
 * supplies the tree data and a row renderer. The tree is sized to its container
 * via a ResizeObserver because the virtualizer needs explicit pixel dimensions.
 */
export function FileTree(props: FileTreeProps) {
  const { ref, size } = useElementSize();

  return (
    <div ref={ref} className="file-tree">
      {size.height > 0 ? (
        <Tree<FileTreeNode>
          className="file-tree__list"
          data={props.nodes}
          disableDrag
          disableDrop
          disableMultiSelection
          height={size.height}
          indent={TREE_INDENT}
          openByDefault={false}
          rowHeight={ROW_HEIGHT}
          width={size.width}
          onActivate={(node) => {
            // Keyboard activation (Enter): open files, expand/collapse folders.
            const data = node.data;
            if (data.kind === "file" && data.file) {
              props.onOpenNote(data.file);
            } else {
              node.toggle();
            }
          }}
        >
          {(rendererProps) => (
            <FileTreeRow rendererProps={rendererProps} treeProps={props} />
          )}
        </Tree>
      ) : null}
    </div>
  );
}

function FileTreeRow({
  rendererProps,
  treeProps
}: {
  readonly rendererProps: NodeRendererProps<FileTreeNode>;
  readonly treeProps: FileTreeProps;
}) {
  const { node, style } = rendererProps;
  const data = node.data;
  const isBusy = treeProps.busyPath === data.path;

  if (data.kind === "folder") {
    return (
      // `style` carries react-arborist's positioning + indentation; required.
      <div
        className="file-tree__row file-tree__row--folder"
        style={style}
        onClick={() => node.toggle()}
      >
        <span className="file-tree__twisty" aria-hidden="true">
          {node.isOpen ? "▾" : "▸"}
        </span>
        <span className="file-tree__label">{data.name}</span>
      </div>
    );
  }

  const isActive = treeProps.activeRelativePath === data.path;

  return (
    <div
      aria-current={isActive ? "page" : undefined}
      className={classNames(
        "file-tree__row file-tree__row--file",
        isActive && "is-active"
      )}
      style={style}
      onClick={() => {
        if (data.file && !isBusy) {
          treeProps.onOpenNote(data.file);
        }
      }}
    >
      <span className="file-tree__twisty" aria-hidden="true" />
      <span className="file-tree__label">{data.name}</span>
      <span className="file-tree__actions">
        <button
          disabled={isBusy}
          onClick={(event) => {
            event.stopPropagation();
            if (data.file) {
              treeProps.onRenameNote(data.file);
            }
          }}
          type="button"
        >
          Rename
        </button>
        <button
          disabled={isBusy}
          onClick={(event) => {
            event.stopPropagation();
            if (data.file) {
              treeProps.onDeleteNote(data.file);
            }
          }}
          type="button"
        >
          Delete
        </button>
      </span>
    </div>
  );
}

interface ElementSize {
  readonly width: number;
  readonly height: number;
}

/** Tracks an element's content-box size so the virtualized tree can fill it. */
function useElementSize(): {
  readonly ref: React.RefObject<HTMLDivElement | null>;
  readonly size: ElementSize;
} {
  const ref = useRef<HTMLDivElement | null>(null);
  const [size, setSize] = useState<ElementSize>({ width: 0, height: 0 });

  useEffect(() => {
    const element = ref.current;
    if (!element) {
      return;
    }

    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (entry) {
        setSize({
          width: entry.contentRect.width,
          height: entry.contentRect.height
        });
      }
    });

    observer.observe(element);

    return () => {
      observer.disconnect();
    };
  }, []);

  return { ref, size };
}
