import { cleanup, fireEvent, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useNotebookStore } from "../../store/useNotebookStore";
import { DashboardPanel } from "./DashboardPanel";

beforeEach(() => {
  localStorage.clear();
  useNotebookStore.setState(useNotebookStore.getInitialState(), true);
});

afterEach(() => cleanup());

describe("DashboardPanel recent pages", () => {
  it("shows and opens the page where a descendant was edited", () => {
    const store = useNotebookStore.getState();
    const page = Object.values(store.nodes).find((node) => node.kind === "content" && !node.deletedAt)!;
    store.editMarkdown(page.id, "页面 A");
    store.enterNode(page.id);
    const childId = store.createChild(page.id, "内部节点")!;
    store.editMarkdown(childId, "被编辑的内部节点");
    const onNavigate = vi.fn();
    const { getByRole, queryByText } = render(<DashboardPanel onNavigate={onNavigate} />);

    expect(queryByText("被编辑的内部节点")).toBeNull();
    fireEvent.click(getByRole("button", { name: /页面 A/ }));

    expect(onNavigate).toHaveBeenCalledWith("outline");
    expect(useNotebookStore.getState().activeRootId).toBe(page.id);
  });
});
