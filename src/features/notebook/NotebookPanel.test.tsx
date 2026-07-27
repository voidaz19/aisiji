import { cleanup, fireEvent, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ROOT_ID } from "../../domain/model";
import { visibleNodes } from "../../domain/tree";
import { useNotebookStore } from "../../store/useNotebookStore";
import { NotebookPanel } from "./NotebookPanel";

beforeEach(() => {
  localStorage.clear();
  useNotebookStore.setState(useNotebookStore.getInitialState(), true);
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

function renderOutline() {
  const state = useNotebookStore.getState();
  return render(
    <NotebookPanel
      view="outline"
      activeRoot={null}
      rootId={ROOT_ID}
      visibleNodes={visibleNodes(state, ROOT_ID)}
    />,
  );
}

function dragTo(target: Element): void {
  Object.defineProperty(document, "elementFromPoint", {
    configurable: true,
    value: vi.fn(() => target),
  });
}

describe("NotebookPanel node range selection", () => {
  it("selects date, content, and ghost rows as one visual range", () => {
    const state = useNotebookStore.getState();
    const date = Object.values(state.nodes).find((node) => node.kind === "date")!;
    const { container } = renderOutline();
    const dateRow = container.querySelector<HTMLElement>(`[data-selection-key="${date.id}"]`)!;
    const ghostRow = container.querySelector<HTMLElement>(`[data-selection-key="ghost:${ROOT_ID}"]`)!;
    const area = container.querySelector<HTMLElement>(".content-area")!;
    dragTo(ghostRow);

    fireEvent.pointerDown(dateRow.querySelector(".date-content")!, { button: 0, pointerId: 1 });
    fireEvent.pointerMove(area, { pointerId: 1, clientX: 20, clientY: 200 });

    expect(container.querySelectorAll(".is-node-selected")).toHaveLength(3);
    expect(dateRow.classList.contains("is-node-selected")).toBe(true);
    expect(ghostRow.classList.contains("is-node-selected")).toBe(true);
  });

  it("deletes selected content while preserving selected date and ghost rows", () => {
    const state = useNotebookStore.getState();
    const date = Object.values(state.nodes).find((node) => node.kind === "date")!;
    const content = Object.values(state.nodes).find((node) => node.kind === "content")!;
    const { container } = renderOutline();
    const dateRow = container.querySelector<HTMLElement>(`[data-selection-key="${date.id}"]`)!;
    const ghostRow = container.querySelector<HTMLElement>(`[data-selection-key="ghost:${ROOT_ID}"]`)!;
    const area = container.querySelector<HTMLElement>(".content-area")!;
    dragTo(ghostRow);

    fireEvent.pointerDown(dateRow.querySelector(".date-content")!, { button: 0, pointerId: 2 });
    fireEvent.pointerMove(area, { pointerId: 2, clientX: 20, clientY: 200 });
    fireEvent.keyDown(area, { key: "Delete" });

    expect(useNotebookStore.getState().nodes[date.id].deletedAt).toBeNull();
    expect(useNotebookStore.getState().nodes[content.id].deletedAt).not.toBeNull();
  });
});
