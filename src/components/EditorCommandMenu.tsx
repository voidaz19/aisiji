import { startCompletion } from "@codemirror/autocomplete";
import type { StateCommand } from "@codemirror/state";
import type { EditorView } from "@codemirror/view";
import {
  Bold,
  Code2,
  FilePlus2,
  Heading1,
  Highlighter,
  Italic,
  Link2,
  ListTodo,
  Minus,
  Plus,
  Quote,
  Search,
  Strikethrough,
  type LucideIcon,
} from "lucide-react";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { createPortal } from "react-dom";
import {
  insertMarkdownText,
  toggleBold,
  toggleHeading,
  toggleHighlight,
  toggleInlineCode,
  toggleItalic,
  toggleQuote,
  toggleStrikethrough,
  toggleTask,
} from "./markdown/markdownCommands";

export interface FileInsertOutcome {
  inserted: number;
  failed: number;
}

export interface FileInsertStatus {
  kind: "idle" | "loading" | "error" | "success";
  message: string;
}

interface Props {
  getEditor: () => EditorView | undefined;
  onPickFiles?: () => Promise<FileInsertOutcome>;
  onRetryFiles?: () => Promise<FileInsertOutcome>;
  fileStatus?: FileInsertStatus;
}

interface CommandItem {
  id: string;
  label: string;
  group: "格式" | "结构" | "节点";
  keywords: string;
  icon: LucideIcon;
  command?: StateCommand;
  run?: (editor: EditorView) => void;
}

export interface CommandMenuAnchor {
  kind: "trigger" | "caret";
  left: number;
  right: number;
  top: number;
  bottom: number;
}

export interface CommandMenuPosition {
  left: number;
  top: number;
  placement: "above" | "below";
}

const commands: readonly CommandItem[] = [
  { id: "bold", label: "粗体", group: "格式", keywords: "bold 加粗", icon: Bold, command: toggleBold },
  { id: "italic", label: "斜体", group: "格式", keywords: "italic", icon: Italic, command: toggleItalic },
  { id: "strikethrough", label: "删除线", group: "格式", keywords: "strike", icon: Strikethrough, command: toggleStrikethrough },
  { id: "highlight", label: "高亮", group: "格式", keywords: "highlight", icon: Highlighter, command: toggleHighlight },
  { id: "code", label: "行内代码", group: "格式", keywords: "code 代码", icon: Code2, command: toggleInlineCode },
  { id: "heading", label: "标题", group: "结构", keywords: "heading h1", icon: Heading1, command: toggleHeading },
  { id: "quote", label: "引用", group: "结构", keywords: "quote", icon: Quote, command: toggleQuote },
  { id: "task", label: "待办", group: "结构", keywords: "todo task", icon: ListTodo, command: toggleTask },
  { id: "divider", label: "分隔线", group: "结构", keywords: "divider rule", icon: Minus, command: insertMarkdownText("---") },
  {
    id: "node-link",
    label: "链接节点",
    group: "节点",
    keywords: "node link 双链",
    icon: Link2,
    run: (editor) => {
      insertMarkdownText("[[")(editor);
      editor.focus();
      queueMicrotask(() => startCompletion(editor));
    },
  },
];

const groups: readonly CommandItem["group"][] = ["格式", "结构", "节点"];
const FILE_ITEM_ID = "file";
const VIEWPORT_MARGIN = 8;
const MENU_GAP = 6;

export function calculateCommandMenuPosition(
  anchor: CommandMenuAnchor,
  menu: { width: number; height: number },
  viewport: { width: number; height: number },
  lockedPlacement?: CommandMenuPosition["placement"],
): CommandMenuPosition {
  const maximumLeft = Math.max(VIEWPORT_MARGIN, viewport.width - menu.width - VIEWPORT_MARGIN);
  const preferredLeft = anchor.kind === "trigger"
    ? anchor.right - menu.width
    : anchor.left + 4;
  const left = Math.min(Math.max(preferredLeft, VIEWPORT_MARGIN), maximumLeft);
  const spaceBelow = viewport.height - anchor.bottom - VIEWPORT_MARGIN;
  const spaceAbove = anchor.top - VIEWPORT_MARGIN;
  const placement = lockedPlacement ?? (menu.height > spaceBelow && spaceAbove > spaceBelow ? "above" : "below");
  const preferredTop = placement === "above"
    ? anchor.top - menu.height - MENU_GAP
    : anchor.bottom + MENU_GAP;
  const maximumTop = Math.max(VIEWPORT_MARGIN, viewport.height - menu.height - VIEWPORT_MARGIN);
  const top = Math.min(Math.max(preferredTop, VIEWPORT_MARGIN), maximumTop);
  return { left, top, placement };
}

export function EditorCommandMenu({
  getEditor,
  onPickFiles,
  onRetryFiles,
  fileStatus = { kind: "idle", message: "" },
}: Props) {
  const [anchor, setAnchor] = useState<CommandMenuAnchor | null>(null);
  const [position, setPosition] = useState<CommandMenuPosition | null>(null);
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const shell = useRef<HTMLDivElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const searchInput = useRef<HTMLInputElement>(null);
  const ctrlArmed = useRef(false);
  const focusSearchWhenPositioned = useRef(false);
  const restoreEditorFocusAfterClose = useRef(false);
  const getEditorRef = useRef(getEditor);
  getEditorRef.current = getEditor;
  const open = anchor !== null;
  const normalizedQuery = query.trim().toLocaleLowerCase();
  const filtered = useMemo(() => commands.filter((item) => {
    if (!normalizedQuery) return true;
    return `${item.label} ${item.group} ${item.keywords}`.toLocaleLowerCase().includes(normalizedQuery);
  }), [normalizedQuery]);
  const showFile = Boolean(onPickFiles && onRetryFiles)
    && (!normalizedQuery || `插入文件 文件 附件 attachment upload`.includes(normalizedQuery));
  const visibleIds = useMemo(
    () => [...filtered.map((item) => item.id), ...(showFile ? [FILE_ITEM_ID] : [])],
    [filtered, showFile],
  );

  const closeMenu = useCallback((restoreEditorFocus = true) => {
    focusSearchWhenPositioned.current = false;
    restoreEditorFocusAfterClose.current = restoreEditorFocus;
    setAnchor(null);
    setPosition(null);
    setQuery("");
    setSelectedId(null);
  }, []);

  const openAtAnchor = useCallback((nextAnchor: CommandMenuAnchor) => {
    focusSearchWhenPositioned.current = true;
    setPosition(null);
    setQuery("");
    setSelectedId(commands[0]?.id ?? FILE_ITEM_ID);
    setAnchor(nextAnchor);
  }, []);

  const openAtCaret = useCallback(() => {
    const editor = getEditorRef.current();
    if (!editor || editor.composing) return;
    const head = editor.state.selection.main.head;
    const caret = editor.coordsAtPos(head, 1);
    const fallback = editor.dom.getBoundingClientRect();
    openAtAnchor({
      kind: "caret",
      left: caret?.left ?? fallback.left,
      right: caret?.right ?? fallback.left,
      top: caret?.top ?? fallback.top,
      bottom: caret?.bottom ?? fallback.bottom,
    });
  }, [openAtAnchor]);

  useLayoutEffect(() => {
    if (!anchor || !menu.current) return;
    const bounds = menu.current.getBoundingClientRect();
    setPosition(calculateCommandMenuPosition(
      anchor,
      { width: bounds.width, height: bounds.height },
      { width: window.innerWidth, height: window.innerHeight },
      position?.placement,
    ));
  }, [anchor, query, fileStatus.kind]);

  useLayoutEffect(() => {
    if (!open || !position || !focusSearchWhenPositioned.current) return;
    focusSearchWhenPositioned.current = false;
    searchInput.current?.focus({ preventScroll: true });
  }, [open, position]);

  useLayoutEffect(() => {
    if (open || !restoreEditorFocusAfterClose.current) return;
    restoreEditorFocusAfterClose.current = false;
    getEditorRef.current()?.focus();
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const row = shell.current?.closest<HTMLElement>(".tree-row");
    const list = row?.closest<HTMLElement>(".tree-list");
    row?.classList.add("has-editor-menu");
    list?.classList.add("has-editor-menu");
    const closeOnPointerDown = (event: PointerEvent) => {
      const target = event.target as Node;
      if (!shell.current?.contains(target) && !menu.current?.contains(target)) closeMenu(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") closeMenu();
    };
    document.addEventListener("pointerdown", closeOnPointerDown);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      row?.classList.remove("has-editor-menu");
      list?.classList.remove("has-editor-menu");
      document.removeEventListener("pointerdown", closeOnPointerDown);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [closeMenu, open]);

  useEffect(() => {
    const ownsShortcut = () => {
      const editor = getEditorRef.current();
      return Boolean(
        editor?.hasFocus
        || (open && shell.current?.contains(document.activeElement))
        || (open && menu.current?.contains(document.activeElement)),
      );
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Control") {
        const editor = getEditorRef.current();
        ctrlArmed.current = !event.repeat
          && !event.altKey
          && !event.metaKey
          && !event.shiftKey
          && !editor?.composing
          && ownsShortcut();
        return;
      }
      ctrlArmed.current = false;
    };
    const onKeyUp = (event: KeyboardEvent) => {
      if (event.key !== "Control") return;
      const shouldToggle = ctrlArmed.current;
      ctrlArmed.current = false;
      if (!shouldToggle) return;
      if (open) closeMenu();
      else openAtCaret();
    };
    const cancelShortcut = () => { ctrlArmed.current = false; };
    document.addEventListener("keydown", onKeyDown, true);
    document.addEventListener("keyup", onKeyUp, true);
    document.addEventListener("pointerdown", cancelShortcut, true);
    window.addEventListener("blur", cancelShortcut);
    return () => {
      document.removeEventListener("keydown", onKeyDown, true);
      document.removeEventListener("keyup", onKeyUp, true);
      document.removeEventListener("pointerdown", cancelShortcut, true);
      window.removeEventListener("blur", cancelShortcut);
    };
  }, [closeMenu, open, openAtCaret]);

  useEffect(() => {
    if (!open) return;
    setSelectedId((current) => current && visibleIds.includes(current) ? current : (visibleIds[0] ?? null));
  }, [open, visibleIds]);

  useEffect(() => {
    if (!selectedId) return;
    const selected = menu.current
      ?.querySelector<HTMLElement>(`[data-command-item="${selectedId}"]`);
    selected?.scrollIntoView?.({ block: "nearest" });
  }, [selectedId]);

  const runCommand = useCallback((item: CommandItem) => {
    const editor = getEditorRef.current();
    if (!editor) return;
    if (item.command) item.command(editor);
    else item.run?.(editor);
    editor.focus();
    closeMenu();
  }, [closeMenu]);

  const pickFiles = useCallback(() => {
    if (!onPickFiles || fileStatus.kind === "loading") return;
    void onPickFiles().then((result) => {
      if (!result.failed) closeMenu();
    });
  }, [closeMenu, fileStatus.kind, onPickFiles]);

  const activateSelected = () => {
    if (!selectedId) return;
    if (selectedId === FILE_ITEM_ID) pickFiles();
    else {
      const item = commands.find((candidate) => candidate.id === selectedId);
      if (item) runCommand(item);
    }
  };

  const moveSelection = (direction: -1 | 1) => {
    if (!visibleIds.length) return;
    const currentIndex = selectedId ? visibleIds.indexOf(selectedId) : -1;
    const nextIndex = currentIndex < 0
      ? (direction === 1 ? 0 : visibleIds.length - 1)
      : (currentIndex + direction + visibleIds.length) % visibleIds.length;
    setSelectedId(visibleIds[nextIndex]);
  };

  const onSearchKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.nativeEvent.isComposing) return;
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      moveSelection(event.key === "ArrowDown" ? 1 : -1);
    } else if (event.key === "Enter") {
      event.preventDefault();
      activateSelected();
    }
  };

  const menuStyle: CSSProperties = position
    ? { left: position.left, top: position.top }
    : { visibility: "hidden" };

  return (
    <div className="editor-command" ref={shell} data-attachment-control="true">
      <button
        ref={trigger}
        type="button"
        className="editor-command-trigger"
        aria-label="打开插入与格式菜单"
        aria-haspopup="dialog"
        aria-expanded={open}
        title="插入与格式"
        onClick={() => {
          if (open) {
            closeMenu();
            return;
          }
          const bounds = trigger.current?.getBoundingClientRect();
          if (!bounds) return;
          openAtAnchor({
            kind: "trigger",
            left: bounds.left,
            right: bounds.right,
            top: bounds.top,
            bottom: bounds.bottom,
          });
        }}
      >
        <Plus size={15} />
      </button>
      {open && createPortal(
        <div
          ref={menu}
          className={`editor-command-menu is-${anchor.kind}-anchored`}
          role="dialog"
          aria-label="插入与格式菜单"
          style={menuStyle}
        >
          <label className="editor-command-search">
            <Search size={14} aria-hidden="true" />
            <input
              ref={searchInput}
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              onKeyDown={onSearchKeyDown}
              placeholder="搜索操作"
              aria-label="搜索操作"
            />
          </label>
          <div className="editor-command-list">
            {groups.map((group) => {
              const items = filtered.filter((item) => item.group === group);
              if (!items.length) return null;
              return (
                <section className="editor-command-group" key={group} aria-label={group}>
                  <div className="editor-command-group-label">{group}</div>
                  {items.map((item) => {
                    const Icon = item.icon;
                    return (
                      <button
                        type="button"
                        key={item.id}
                        data-command-item={item.id}
                        className={selectedId === item.id ? "is-selected" : undefined}
                        onPointerMove={() => setSelectedId(item.id)}
                        onClick={() => runCommand(item)}
                      >
                        <Icon size={15} aria-hidden="true" />
                        <span>{item.label}</span>
                      </button>
                    );
                  })}
                </section>
              );
            })}
            {showFile && (
              <section className="editor-command-group" aria-label="文件">
                <div className="editor-command-group-label">文件</div>
                <button
                  type="button"
                  data-command-item={FILE_ITEM_ID}
                  className={selectedId === FILE_ITEM_ID ? "is-selected" : undefined}
                  onPointerMove={() => setSelectedId(FILE_ITEM_ID)}
                  onClick={pickFiles}
                  disabled={fileStatus.kind === "loading"}
                >
                  <FilePlus2 size={15} aria-hidden="true" />
                  <span>插入文件</span>
                </button>
              </section>
            )}
            {!filtered.length && !showFile && <div className="editor-command-empty">没有匹配的操作</div>}
          </div>
          {fileStatus.kind !== "idle" && (
            <div className={`editor-command-status is-${fileStatus.kind}`} role="status">
              <span>{fileStatus.message}</span>
              {fileStatus.kind === "error" && onRetryFiles && (
                <button
                  type="button"
                  className="editor-command-retry"
                  onClick={() => {
                    void onRetryFiles().then((result) => {
                      if (!result.failed) closeMenu();
                    });
                  }}
                >
                  重试
                </button>
              )}
            </div>
          )}
        </div>,
        document.body,
      )}
    </div>
  );
}
