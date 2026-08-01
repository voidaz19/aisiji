import {
  Bold,
  Code2,
  Copy,
  Check,
  Highlighter,
  Italic,
  Scissors,
  Strikethrough,
  Trash2,
  ListIndentDecrease,
  ListIndentIncrease,
  type LucideIcon,
} from "lucide-react";
import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from "react";
import { createPortal } from "react-dom";

export interface SelectionMenuAnchor {
  left: number;
  right: number;
  top: number;
  bottom: number;
}

export interface SelectionMenuAction {
  id: string;
  label: string;
  icon: LucideIcon;
  onSelect: () => void | boolean | Promise<void | boolean>;
  disabled?: boolean;
  feedback?: string;
  failureFeedback?: string;
}

interface Props {
  anchor: SelectionMenuAnchor | null;
  actions: readonly SelectionMenuAction[];
  ariaLabel: string;
  className?: string;
  alignment?: "center" | "start";
}

const VIEWPORT_MARGIN = 8;
const MENU_GAP = 6;

export interface SelectionMenuPosition {
  left: number;
  top: number;
  placement: "above" | "below";
}

export function calculateSelectionMenuPosition(
  anchor: SelectionMenuAnchor,
  menu: { width: number; height: number },
  viewport: { width: number; height: number },
  options: { alignment?: "center" | "start" } = {},
): SelectionMenuPosition {
  const maximumLeft = Math.max(VIEWPORT_MARGIN, viewport.width - menu.width - VIEWPORT_MARGIN);
  const preferredLeft = options.alignment === "start"
    ? anchor.left
    : anchor.left + (anchor.right - anchor.left) / 2 - menu.width / 2;
  const left = Math.min(Math.max(preferredLeft, VIEWPORT_MARGIN), maximumLeft);
  const spaceBelow = viewport.height - anchor.bottom - VIEWPORT_MARGIN;
  const spaceAbove = anchor.top - VIEWPORT_MARGIN;
  const placement = spaceAbove >= menu.height + MENU_GAP || spaceAbove >= spaceBelow ? "above" : "below";
  const preferredTop = placement === "above"
    ? anchor.top - menu.height - MENU_GAP
    : anchor.bottom + MENU_GAP;
  const maximumTop = Math.max(VIEWPORT_MARGIN, viewport.height - menu.height - VIEWPORT_MARGIN);
  const top = Math.min(Math.max(preferredTop, VIEWPORT_MARGIN), maximumTop);
  return { left, top, placement };
}

export function SelectionMenu({ anchor, actions, ariaLabel, className = "", alignment = "center" }: Props) {
  const menu = useRef<HTMLDivElement>(null);
  const feedbackTimer = useRef<number | null>(null);
  const [position, setPosition] = useState<SelectionMenuPosition | null>(null);
  const [feedback, setFeedback] = useState<{ actionId: string; message: string; success: boolean } | null>(null);

  useEffect(() => () => {
    if (feedbackTimer.current !== null) window.clearTimeout(feedbackTimer.current);
  }, []);

  useLayoutEffect(() => {
    if (!anchor || !menu.current) return;
    const bounds = menu.current.getBoundingClientRect();
    setPosition(calculateSelectionMenuPosition(
      anchor,
      { width: bounds.width, height: bounds.height },
      { width: window.innerWidth, height: window.innerHeight },
      { alignment },
    ));
  }, [alignment, anchor, actions.length]);

  if (!anchor || typeof document === "undefined") return null;
  const style: CSSProperties = position
    ? { left: position.left, top: position.top }
    : { visibility: "hidden" };

  return createPortal(
    <div
      ref={menu}
      className={`selection-menu ${className}`.trim()}
      role="toolbar"
      aria-label={ariaLabel}
      data-selection-menu-control="true"
      style={style}
    >
      {actions.map((action) => {
        const confirmed = feedback?.actionId === action.id && feedback.success;
        const Icon = confirmed ? Check : action.icon;
        return (
          <button
            key={action.id}
            type="button"
            className="selection-menu-button"
            aria-label={action.label}
            title={action.label}
            disabled={action.disabled}
            onPointerDown={(event) => event.preventDefault()}
            onClick={() => {
              void Promise.resolve(action.onSelect()).then((result) => {
                const success = result !== false;
                const message = success ? action.feedback : action.failureFeedback;
                if (!message) return;
                setFeedback({ actionId: action.id, message, success });
                if (feedbackTimer.current !== null) window.clearTimeout(feedbackTimer.current);
                feedbackTimer.current = window.setTimeout(() => setFeedback(null), 1400);
              });
            }}
          >
            <Icon size={15} aria-hidden="true" />
          </button>
        );
      })}
      {feedback && (
        <span className={`selection-menu-feedback ${feedback.success ? "is-success" : "is-error"}`} role="status">
          {feedback.message}
        </span>
      )}
    </div>,
    document.body,
  );
}

export const selectionMenuIcons = {
  bold: Bold,
  italic: Italic,
  strikethrough: Strikethrough,
  highlight: Highlighter,
  code: Code2,
  copy: Copy,
  cut: Scissors,
  delete: Trash2,
  indent: ListIndentIncrease,
  outdent: ListIndentDecrease,
} as const;
